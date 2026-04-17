import { describe, it, expect } from 'vitest';
import { FlowAnalyzer } from './flow-analyzer.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  FlowResult,
  AstNode,
  ModuleInfo,
  Annotation,
} from '../models/index.js';

// ─── Helpers ───

function makeProfile(projectPath: string): ProjectProfile {
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

function makeModule(name: string, modulePath: string, keyFiles: string[]): ModuleInfo {
  return {
    name,
    path: modulePath,
    description: `Module: ${name}`,
    isInferred: true,
    keyClasses: [],
    keyFiles,
    dependencies: [],
  };
}

function makeAnnotation(name: string, attributes: Record<string, string> = {}): Annotation {
  return { name, attributes };
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

function makeMethodNode(
  name: string,
  filePath: string,
  startLine: number = 5,
  annotations: Annotation[] = [],
  children: AstNode[] = [],
): AstNode {
  return {
    type: 'method',
    name,
    filePath,
    startLine,
    endLine: startLine + 10,
    modifiers: ['public'],
    annotations,
    children,
  };
}

function makeFunctionNode(
  name: string,
  filePath: string,
  startLine: number = 1,
  annotations: Annotation[] = [],
): AstNode {
  return {
    type: 'function',
    name,
    filePath,
    startLine,
    endLine: startLine + 10,
    modifiers: [],
    annotations,
    children: [],
  };
}

function makePlugin(
  modules: ModuleInfo[],
  parseResults: Map<string, AstNode[]> = new Map(),
): LanguagePlugin {
  return {
    getLanguageId: () => 'typescript',
    parseFile: (filePath: string) => parseResults.get(filePath) ?? [],
    extractDependencies: () => [],
    identifyApis: () => [],
    identifyModules: () => modules,
  };
}

// ─── Tests ───

describe('FlowAnalyzer', () => {
  const analyzer = new FlowAnalyzer();

  it('getName returns "flow"', () => {
    expect(analyzer.getName()).toBe('flow');
  });

  describe('entry point identification', () => {
    it('identifies controller classes by name pattern', async () => {
      const filePath = '/project/src/UserController.ts';
      const methods = [makeMethodNode('getUser', filePath, 5)];
      const classNode = makeClassNode('UserController', filePath, methods);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      expect(result.entryPoints.length).toBeGreaterThanOrEqual(1);
      const controllerEp = result.entryPoints.find((ep) => ep.type === 'controller');
      expect(controllerEp).toBeDefined();
      expect(controllerEp!.className).toBe('UserController');
      expect(controllerEp!.methodName).toBe('getUser');
    });

    it('identifies handler classes by name pattern', async () => {
      const filePath = '/project/src/EventHandler.ts';
      const methods = [makeMethodNode('process', filePath, 5)];
      const classNode = makeClassNode('RequestHandler', filePath, methods);

      const mod = makeModule('handlers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const controllerEp = result.entryPoints.find(
        (ep) => ep.type === 'controller' && ep.className === 'RequestHandler',
      );
      expect(controllerEp).toBeDefined();
    });

    it('identifies controller classes by route annotations', async () => {
      const filePath = '/project/src/ApiResource.ts';
      const methods = [makeMethodNode('list', filePath, 5)];
      const classAnnotations = [makeAnnotation('RequestMapping', { value: '/api/users' })];
      const classNode = makeClassNode('ApiResource', filePath, methods, classAnnotations);

      const mod = makeModule('api', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const controllerEp = result.entryPoints.find((ep) => ep.type === 'controller');
      expect(controllerEp).toBeDefined();
      expect(controllerEp!.className).toBe('ApiResource');
    });

    it('extracts httpPath from annotations', async () => {
      const filePath = '/project/src/UserController.ts';
      const methodAnnotations = [makeAnnotation('GetMapping', { value: '/list' })];
      const methods = [makeMethodNode('listUsers', filePath, 5, methodAnnotations)];
      const classAnnotations = [makeAnnotation('RequestMapping', { value: '/api/users' })];
      const classNode = makeClassNode('UserController', filePath, methods, classAnnotations);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const ep = result.entryPoints.find((e) => e.methodName === 'listUsers');
      expect(ep).toBeDefined();
      expect(ep!.httpPath).toBe('/api/users/list');
    });

    it('identifies main functions', async () => {
      const filePath = '/project/src/main.ts';
      const mainFn = makeFunctionNode('main', filePath, 1);

      const mod = makeModule('root', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [mainFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const mainEp = result.entryPoints.find((ep) => ep.type === 'main');
      expect(mainEp).toBeDefined();
      expect(mainEp!.methodName).toBe('main');
    });

    it('identifies event handlers by name pattern (on*)', async () => {
      const filePath = '/project/src/events.ts';
      const onClickFn = makeFunctionNode('onClick', filePath, 1);

      const mod = makeModule('events', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [onClickFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const eventEp = result.entryPoints.find((ep) => ep.type === 'event-handler');
      expect(eventEp).toBeDefined();
      expect(eventEp!.methodName).toBe('onClick');
    });

    it('identifies event handlers by name pattern (handle*)', async () => {
      const filePath = '/project/src/events.ts';
      const handleSubmitFn = makeFunctionNode('handleSubmit', filePath, 1);

      const mod = makeModule('events', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [handleSubmitFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const eventEp = result.entryPoints.find(
        (ep) => ep.type === 'event-handler' && ep.methodName === 'handleSubmit',
      );
      expect(eventEp).toBeDefined();
    });

    it('identifies event handlers by annotation', async () => {
      const filePath = '/project/src/Listener.ts';
      const methodAnnotations = [makeAnnotation('EventListener')];
      const methods = [makeMethodNode('onUserCreated', filePath, 5, methodAnnotations)];
      const classNode = makeClassNode('UserEventListener', filePath, methods);

      const mod = makeModule('listeners', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const eventEp = result.entryPoints.find(
        (ep) => ep.type === 'event-handler' && ep.methodName === 'onUserCreated',
      );
      expect(eventEp).toBeDefined();
    });

    it('returns empty entry points when no patterns match', async () => {
      const filePath = '/project/src/utils.ts';
      const utilFn = makeFunctionNode('formatDate', filePath, 1);

      const mod = makeModule('utils', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [utilFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      expect(result.entryPoints).toHaveLength(0);
    });

    it('deduplicates entry points', async () => {
      const filePath = '/project/src/UserController.ts';
      const methods = [makeMethodNode('getUser', filePath, 5)];
      const classNode = makeClassNode('UserController', filePath, methods);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      // Two plugins returning the same file
      const plugin1 = makePlugin([mod], parseResults);
      const plugin2 = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin1, plugin2])) as FlowResult;

      const controllerEps = result.entryPoints.filter(
        (ep) => ep.className === 'UserController' && ep.methodName === 'getUser',
      );
      expect(controllerEps).toHaveLength(1);
    });
  });

  describe('call chain analysis', () => {
    it('generates flow traces for each entry point', async () => {
      const filePath = '/project/src/UserController.ts';
      const methods = [makeMethodNode('getUser', filePath, 5)];
      const classNode = makeClassNode('UserController', filePath, methods);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      expect(result.flows).toHaveLength(result.entryPoints.length);
      for (const flow of result.flows) {
        expect(flow.maxDepth).toBe(5);
        expect(flow.description).toBeTruthy();
        expect(flow.entryPoint).toBeDefined();
      }
    });

    it('respects max depth of 5', async () => {
      const filePath = '/project/src/UserController.ts';
      const methods = [makeMethodNode('getUser', filePath, 5)];
      const classNode = makeClassNode('UserController', filePath, methods);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      for (const flow of result.flows) {
        expect(flow.maxDepth).toBe(5);
        for (const step of flow.callChain) {
          expect(step.depth).toBeLessThanOrEqual(5);
        }
      }
    });

    it('flow description includes type label', async () => {
      const filePath = '/project/src/UserController.ts';
      const methods = [makeMethodNode('getUser', filePath, 5)];
      const classNode = makeClassNode('UserController', filePath, methods);

      const mod = makeModule('controllers', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [classNode]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const controllerFlow = result.flows.find(
        (f) => f.entryPoint.type === 'controller',
      );
      expect(controllerFlow).toBeDefined();
      expect(controllerFlow!.description).toContain('HTTP endpoint');
      expect(controllerFlow!.description).toContain('UserController.getUser');
    });

    it('flow description for main function', async () => {
      const filePath = '/project/src/main.ts';
      const mainFn = makeFunctionNode('main', filePath, 1);

      const mod = makeModule('root', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [mainFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const mainFlow = result.flows.find((f) => f.entryPoint.type === 'main');
      expect(mainFlow).toBeDefined();
      expect(mainFlow!.description).toContain('Application entry point');
    });

    it('flow description for event handler', async () => {
      const filePath = '/project/src/events.ts';
      const onClickFn = makeFunctionNode('onClick', filePath, 1);

      const mod = makeModule('events', '/project/src', [filePath]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(filePath, [onClickFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const eventFlow = result.flows.find((f) => f.entryPoint.type === 'event-handler');
      expect(eventFlow).toBeDefined();
      expect(eventFlow!.description).toContain('Event handler');
    });
  });

  describe('empty / edge cases', () => {
    it('handles no plugins gracefully', async () => {
      const profile = makeProfile('/project');
      const result = (await analyzer.analyze(profile, [])) as FlowResult;

      expect(result.entryPoints).toHaveLength(0);
      expect(result.flows).toHaveLength(0);
    });

    it('handles plugins with no modules', async () => {
      const plugin = makePlugin([]);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      expect(result.entryPoints).toHaveLength(0);
      expect(result.flows).toHaveLength(0);
    });

    it('handles multiple entry point types in same project', async () => {
      const controllerFile = '/project/src/UserController.ts';
      const mainFile = '/project/src/main.ts';
      const eventFile = '/project/src/events.ts';

      const controllerMethods = [makeMethodNode('getUser', controllerFile, 5)];
      const controllerNode = makeClassNode('UserController', controllerFile, controllerMethods);
      const mainFn = makeFunctionNode('main', mainFile, 1);
      const eventFn = makeFunctionNode('onMessage', eventFile, 1);

      const mod = makeModule('root', '/project/src', [controllerFile, mainFile, eventFile]);
      const parseResults = new Map<string, AstNode[]>();
      parseResults.set(controllerFile, [controllerNode]);
      parseResults.set(mainFile, [mainFn]);
      parseResults.set(eventFile, [eventFn]);

      const plugin = makePlugin([mod], parseResults);
      const profile = makeProfile('/project');

      const result = (await analyzer.analyze(profile, [plugin])) as FlowResult;

      const types = new Set(result.entryPoints.map((ep) => ep.type));
      expect(types.has('controller')).toBe(true);
      expect(types.has('main')).toBe(true);
      expect(types.has('event-handler')).toBe(true);

      // Each entry point should have a corresponding flow
      expect(result.flows).toHaveLength(result.entryPoints.length);
    });
  });
});
