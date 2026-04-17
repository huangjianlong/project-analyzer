import { describe, it, expect } from 'vitest';
import { ApiAnalyzer } from './api-analyzer.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  ApiResult,
  ApiEndpoint,
  AstNode,
  ModuleInfo,
  Annotation,
  HttpMethod,
  ApiParameter,
} from '../models/index.js';

// ─── Helpers ───

function makeProfile(projectPath = '/project'): ProjectProfile {
  return {
    projectName: 'test-project',
    projectPath,
    primaryLanguage: 'typescript',
    languages: [{ language: 'typescript', fileCount: 10, lineCount: 500, percentage: 100 }],
    buildTool: 'npm',
    modules: [],
    fileStats: { totalFiles: 10, sourceFiles: 8, testFiles: 1, configFiles: 1, totalLines: 500 },
  };
}

function makeModule(name: string, keyFiles: string[]): ModuleInfo {
  return {
    name,
    path: '/project/src',
    description: `Module: ${name}`,
    isInferred: true,
    keyClasses: [],
    keyFiles,
    dependencies: [],
  };
}

function makeEndpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    path: '/api/users',
    method: 'GET',
    handlerClass: 'UserController',
    handlerMethod: 'getUsers',
    parameters: [],
    tags: [],
    ...overrides,
  };
}

function makeAnnotation(name: string, attributes: Record<string, string> = {}): Annotation {
  return { name, attributes };
}

function makeMethodNode(
  name: string,
  filePath: string,
  annotations: Annotation[] = [],
): AstNode {
  return {
    type: 'method',
    name,
    filePath,
    startLine: 5,
    endLine: 15,
    modifiers: ['public'],
    annotations,
    children: [],
  };
}

function makeClassNode(
  name: string,
  filePath: string,
  children: AstNode[] = [],
  annotations: Annotation[] = [],
): AstNode {
  return {
    type: 'class',
    name,
    filePath,
    startLine: 1,
    endLine: 50,
    modifiers: ['public'],
    annotations,
    children,
  };
}

function makePlugin(
  modules: ModuleInfo[],
  apiResults: Map<string, ApiEndpoint[]> = new Map(),
  parseResults: Map<string, AstNode[]> = new Map(),
): LanguagePlugin {
  return {
    getLanguageId: () => 'typescript',
    parseFile: (filePath: string) => parseResults.get(filePath) ?? [],
    extractDependencies: () => [],
    identifyApis: (filePath: string) => apiResults.get(filePath) ?? [],
    identifyModules: () => modules,
  };
}

// ─── Tests ───

describe('ApiAnalyzer', () => {
  const analyzer = new ApiAnalyzer();

  it('getName returns "api"', () => {
    expect(analyzer.getName()).toBe('api');
  });

  describe('endpoint collection', () => {
    it('collects endpoints from plugin identifyApis', async () => {
      const filePath = '/project/src/routes.ts';
      const ep = makeEndpoint({ path: '/api/users', method: 'GET' });
      const mod = makeModule('api', [filePath]);
      const apiResults = new Map([[filePath, [ep]]]);
      const plugin = makePlugin([mod], apiResults);

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0].path).toBe('/api/users');
      expect(result.endpoints[0].method).toBe('GET');
      expect(result.totalCount).toBe(1);
    });

    it('collects endpoints from multiple plugins', async () => {
      const file1 = '/project/src/users.ts';
      const file2 = '/project/src/orders.ts';
      const ep1 = makeEndpoint({ path: '/api/users', method: 'GET', handlerClass: 'UserController' });
      const ep2 = makeEndpoint({ path: '/api/orders', method: 'POST', handlerClass: 'OrderController' });

      const plugin1 = makePlugin(
        [makeModule('users', [file1])],
        new Map([[file1, [ep1]]]),
      );
      const plugin2 = makePlugin(
        [makeModule('orders', [file2])],
        new Map([[file2, [ep2]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin1, plugin2])) as ApiResult;

      expect(result.endpoints).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it('does not process the same file twice', async () => {
      const filePath = '/project/src/routes.ts';
      const ep = makeEndpoint();
      const mod = makeModule('api', [filePath]);
      const apiResults = new Map([[filePath, [ep]]]);

      // Two plugins both referencing the same file
      const plugin1 = makePlugin([mod], apiResults);
      const plugin2 = makePlugin([mod], apiResults);

      const result = (await analyzer.analyze(makeProfile(), [plugin1, plugin2])) as ApiResult;

      // Should only have 1 endpoint, not 2
      expect(result.endpoints).toHaveLength(1);
    });
  });

  describe('deduplication', () => {
    it('deduplicates endpoints by path + method', async () => {
      const file1 = '/project/src/v1.ts';
      const file2 = '/project/src/v2.ts';
      const ep1 = makeEndpoint({ path: '/api/users', method: 'GET', handlerClass: 'V1Controller' });
      const ep2 = makeEndpoint({ path: '/api/users', method: 'GET', handlerClass: 'V2Controller' });

      const plugin = makePlugin(
        [makeModule('api', [file1, file2])],
        new Map([[file1, [ep1]], [file2, [ep2]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(1);
    });

    it('keeps different methods on the same path as separate endpoints', async () => {
      const filePath = '/project/src/routes.ts';
      const ep1 = makeEndpoint({ path: '/api/users', method: 'GET' });
      const ep2 = makeEndpoint({ path: '/api/users', method: 'POST' });

      const plugin = makePlugin(
        [makeModule('api', [filePath])],
        new Map([[filePath, [ep1, ep2]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(2);
    });

    it('merges description from duplicate when first is missing it', async () => {
      const file1 = '/project/src/v1.ts';
      const file2 = '/project/src/v2.ts';
      const ep1 = makeEndpoint({ path: '/api/users', method: 'GET' });
      const ep2 = makeEndpoint({ path: '/api/users', method: 'GET', description: 'List users' });

      const plugin = makePlugin(
        [makeModule('api', [file1, file2])],
        new Map([[file1, [ep1]], [file2, [ep2]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0].description).toBe('List users');
    });
  });

  describe('grouping', () => {
    it('groups endpoints by handlerClass', async () => {
      const filePath = '/project/src/routes.ts';
      const ep1 = makeEndpoint({ path: '/api/users', method: 'GET', handlerClass: 'UserController' });
      const ep2 = makeEndpoint({ path: '/api/users', method: 'POST', handlerClass: 'UserController' });
      const ep3 = makeEndpoint({ path: '/api/orders', method: 'GET', handlerClass: 'OrderController' });

      const plugin = makePlugin(
        [makeModule('api', [filePath])],
        new Map([[filePath, [ep1, ep2, ep3]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.groups).toHaveLength(2);
      const userGroup = result.groups.find((g) => g.name === 'UserController');
      const orderGroup = result.groups.find((g) => g.name === 'OrderController');
      expect(userGroup).toBeDefined();
      expect(userGroup!.endpoints).toHaveLength(2);
      expect(orderGroup).toBeDefined();
      expect(orderGroup!.endpoints).toHaveLength(1);
    });

    it('uses "default" group for endpoints without handlerClass', async () => {
      const filePath = '/project/src/routes.ts';
      const ep = makeEndpoint({ path: '/health', method: 'GET', handlerClass: '' });

      const plugin = makePlugin(
        [makeModule('api', [filePath])],
        new Map([[filePath, [ep]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].name).toBe('default');
    });

    it('infers basePath from common path prefix', async () => {
      const filePath = '/project/src/routes.ts';
      const ep1 = makeEndpoint({ path: '/api/users/list', method: 'GET', handlerClass: 'UserController' });
      const ep2 = makeEndpoint({ path: '/api/users/create', method: 'POST', handlerClass: 'UserController' });

      const plugin = makePlugin(
        [makeModule('api', [filePath])],
        new Map([[filePath, [ep1, ep2]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      const group = result.groups.find((g) => g.name === 'UserController');
      expect(group).toBeDefined();
      expect(group!.basePath).toBe('/api/users');
    });
  });

  describe('Swagger/OpenAPI enrichment', () => {
    it('extracts description from ApiOperation annotation', async () => {
      const filePath = '/project/src/UserController.ts';
      const ep = makeEndpoint({
        path: '/api/users',
        method: 'GET',
        handlerClass: 'UserController',
        handlerMethod: 'getUsers',
      });

      const methodNode = makeMethodNode('getUsers', filePath, [
        makeAnnotation('ApiOperation', { value: 'List all users' }),
      ]);
      const classNode = makeClassNode('UserController', filePath, [methodNode]);

      const mod = makeModule('api', [filePath]);
      const plugin = makePlugin(
        [mod],
        new Map([[filePath, [ep]]]),
        new Map([[filePath, [classNode]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints[0].description).toBe('List all users');
    });

    it('extracts tags from annotation', async () => {
      const filePath = '/project/src/UserController.ts';
      const ep = makeEndpoint({
        path: '/api/users',
        method: 'GET',
        handlerClass: 'UserController',
        handlerMethod: 'getUsers',
        tags: [],
      });

      const methodNode = makeMethodNode('getUsers', filePath, [
        makeAnnotation('Api', { tags: 'users, admin' }),
      ]);
      const classNode = makeClassNode('UserController', filePath, [methodNode]);

      const mod = makeModule('api', [filePath]);
      const plugin = makePlugin(
        [mod],
        new Map([[filePath, [ep]]]),
        new Map([[filePath, [classNode]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints[0].tags).toContain('users');
      expect(result.endpoints[0].tags).toContain('admin');
    });

    it('does not overwrite existing description', async () => {
      const filePath = '/project/src/UserController.ts';
      const ep = makeEndpoint({
        path: '/api/users',
        method: 'GET',
        handlerClass: 'UserController',
        handlerMethod: 'getUsers',
        description: 'Original description',
      });

      const methodNode = makeMethodNode('getUsers', filePath, [
        makeAnnotation('ApiOperation', { value: 'New description' }),
      ]);
      const classNode = makeClassNode('UserController', filePath, [methodNode]);

      const mod = makeModule('api', [filePath]);
      const plugin = makePlugin(
        [mod],
        new Map([[filePath, [ep]]]),
        new Map([[filePath, [classNode]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints[0].description).toBe('Original description');
    });
  });

  describe('dynamic parameters', () => {
    it('preserves path parameters from plugin output', async () => {
      const filePath = '/project/src/routes.ts';
      const params: ApiParameter[] = [
        { name: 'id', type: 'string', in: 'path', required: true },
      ];
      const ep = makeEndpoint({
        path: '/api/users/:id',
        method: 'GET',
        parameters: params,
      });

      const plugin = makePlugin(
        [makeModule('api', [filePath])],
        new Map([[filePath, [ep]]]),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints[0].parameters).toHaveLength(1);
      expect(result.endpoints[0].parameters[0].name).toBe('id');
      expect(result.endpoints[0].parameters[0].in).toBe('path');
    });
  });

  describe('edge cases', () => {
    it('handles no plugins gracefully', async () => {
      const result = (await analyzer.analyze(makeProfile(), [])) as ApiResult;

      expect(result.endpoints).toHaveLength(0);
      expect(result.groups).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('handles plugins with no modules', async () => {
      const plugin = makePlugin([]);
      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(0);
      expect(result.groups).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('handles plugins returning no endpoints', async () => {
      const filePath = '/project/src/utils.ts';
      const plugin = makePlugin(
        [makeModule('utils', [filePath])],
        new Map(),
      );

      const result = (await analyzer.analyze(makeProfile(), [plugin])) as ApiResult;

      expect(result.endpoints).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });
});
