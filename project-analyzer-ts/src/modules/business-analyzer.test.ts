import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BusinessAnalyzer } from './business-analyzer.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  ModuleInfo,
  BusinessResult,
  AstNode,
} from '../models/index.js';

// ─── Helpers ───

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'biz-test-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeProfile(projectPath: string, overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    projectName: 'test-project',
    projectPath,
    primaryLanguage: 'typescript',
    languages: [{ language: 'typescript', fileCount: 10, lineCount: 500, percentage: 100 }],
    buildTool: 'npm',
    modules: [],
    fileStats: { totalFiles: 10, sourceFiles: 8, testFiles: 1, configFiles: 1, totalLines: 500 },
    ...overrides,
  };
}

function makeModule(name: string, modulePath: string, keyFiles: string[]): ModuleInfo {
  return {
    name,
    path: modulePath,
    description: `Module inferred from directory: src/${name}`,
    isInferred: true,
    keyClasses: [],
    keyFiles,
    dependencies: [],
  };
}

function makeClassNode(name: string, filePath: string, fields: AstNode[] = []): AstNode {
  return {
    type: 'class',
    name,
    filePath,
    startLine: 1,
    endLine: 10,
    modifiers: ['public'],
    annotations: [],
    children: fields,
  };
}

function makeFieldNode(name: string, returnType: string, annotations: string[] = []): AstNode {
  return {
    type: 'field',
    name,
    filePath: '',
    startLine: 2,
    endLine: 2,
    modifiers: [],
    annotations: annotations.map((a) => ({ name: a, attributes: {} })),
    children: [],
    returnType,
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

describe('BusinessAnalyzer', () => {
  const analyzer = new BusinessAnalyzer();

  it('getName returns "business"', () => {
    expect(analyzer.getName()).toBe('business');
  });

  describe('module collection', () => {
    it('collects modules from plugins', async () => {
      const tmpDir = makeTmpDir();
      try {
        const mod = makeModule('auth', path.join(tmpDir, 'src', 'auth'), []);
        const plugin = makePlugin([mod]);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.modules).toHaveLength(1);
        expect(result.modules[0].name).toBe('auth');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('deduplicates modules by path across plugins', async () => {
      const tmpDir = makeTmpDir();
      try {
        const modPath = path.join(tmpDir, 'src', 'auth');
        const mod = makeModule('auth', modPath, []);
        const plugin1 = makePlugin([mod]);
        const plugin2 = makePlugin([mod]);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin1, plugin2])) as BusinessResult;

        expect(result.modules).toHaveLength(1);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('returns empty modules when no plugins provided', async () => {
      const tmpDir = makeTmpDir();
      try {
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [])) as BusinessResult;

        expect(result.modules).toHaveLength(0);
        expect(result.dataModels).toHaveLength(0);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('marks all modules as inferred', async () => {
      const tmpDir = makeTmpDir();
      try {
        const mod = makeModule('users', path.join(tmpDir, 'src', 'users'), []);
        const plugin = makePlugin([mod]);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        for (const m of result.modules) {
          expect(m.isInferred).toBe(true);
        }
      } finally {
        rmDir(tmpDir);
      }
    });
  });

  describe('key class enrichment', () => {
    it('extracts class names from parsed files into keyClasses', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'auth', 'auth-service.ts');
        const mod = makeModule('auth', path.join(tmpDir, 'src', 'auth'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [
          makeClassNode('AuthService', filePath),
          makeClassNode('AuthGuard', filePath),
        ]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.modules[0].keyClasses).toContain('AuthService');
        expect(result.modules[0].keyClasses).toContain('AuthGuard');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('deduplicates class names', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'auth', 'service.ts');
        const mod = makeModule('auth', path.join(tmpDir, 'src', 'auth'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [
          makeClassNode('AuthService', filePath),
          makeClassNode('AuthService', filePath),
        ]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.modules[0].keyClasses).toHaveLength(1);
      } finally {
        rmDir(tmpDir);
      }
    });
  });

  describe('description inference', () => {
    it('generates description from module name and key classes', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'user-management', 'user.ts');
        const mod = makeModule('user-management', path.join(tmpDir, 'src', 'user-management'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('UserService', filePath)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.modules[0].description).toContain('User Management');
        expect(result.modules[0].description).toContain('UserService');
        expect(result.modules[0].isInferred).toBe(true);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('generates fallback description when no classes found', async () => {
      const tmpDir = makeTmpDir();
      try {
        const mod = makeModule('payments', path.join(tmpDir, 'src', 'payments'), []);
        const plugin = makePlugin([mod]);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.modules[0].description).toContain('Payments');
        expect(result.modules[0].description).toContain('inferred from directory structure');
      } finally {
        rmDir(tmpDir);
      }
    });
  });

  describe('data model extraction', () => {
    it('extracts Entity class as data model', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'models', 'UserEntity.ts');
        const mod = makeModule('models', path.join(tmpDir, 'src', 'models'), [filePath]);

        const fields = [
          makeFieldNode('id', 'number', ['PrimaryKey']),
          makeFieldNode('name', 'string'),
        ];
        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('UserEntity', filePath, fields)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels).toHaveLength(1);
        expect(result.dataModels[0].name).toBe('UserEntity');
        expect(result.dataModels[0].type).toBe('entity');
        expect(result.dataModels[0].fields).toHaveLength(2);
        expect(result.dataModels[0].fields[0].name).toBe('id');
        expect(result.dataModels[0].fields[0].type).toBe('number');
        expect(result.dataModels[0].fields[0].annotations).toContain('PrimaryKey');
        expect(result.dataModels[0].fields[1].name).toBe('name');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('extracts DTO class as data model', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'dto', 'CreateUserDto.ts');
        const mod = makeModule('dto', path.join(tmpDir, 'src', 'dto'), [filePath]);

        const fields = [makeFieldNode('email', 'string')];
        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('CreateUserDto', filePath, fields)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels).toHaveLength(1);
        expect(result.dataModels[0].type).toBe('dto');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('extracts VO class as data model', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'vo', 'AddressVO.ts');
        const mod = makeModule('vo', path.join(tmpDir, 'src', 'vo'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('AddressVO', filePath)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels).toHaveLength(1);
        expect(result.dataModels[0].type).toBe('vo');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('classifies model type from file path when class name does not match', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'models', 'user.entity.ts');
        const mod = makeModule('models', path.join(tmpDir, 'src', 'models'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('User', filePath)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels).toHaveLength(1);
        expect(result.dataModels[0].type).toBe('entity');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('ignores classes that do not match data model patterns', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'services', 'auth-service.ts');
        const mod = makeModule('services', path.join(tmpDir, 'src', 'services'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('AuthService', filePath)]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels).toHaveLength(0);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('deduplicates data models by file+name', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'models', 'UserEntity.ts');
        const mod = makeModule('models', path.join(tmpDir, 'src', 'models'), [filePath]);

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('UserEntity', filePath)]);

        // Two plugins returning the same module/file
        const plugin1 = makePlugin([mod], parseResults);
        const plugin2 = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin1, plugin2])) as BusinessResult;

        // Module is deduped, so data model should also be deduped
        expect(result.dataModels).toHaveLength(1);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('extracts fields with unknown type when returnType is missing', async () => {
      const tmpDir = makeTmpDir();
      try {
        const filePath = path.join(tmpDir, 'src', 'models', 'OrderEntity.ts');
        const mod = makeModule('models', path.join(tmpDir, 'src', 'models'), [filePath]);

        const fieldNode: AstNode = {
          type: 'field',
          name: 'status',
          filePath: '',
          startLine: 3,
          endLine: 3,
          modifiers: [],
          annotations: [],
          children: [],
          // no returnType
        };

        const parseResults = new Map<string, AstNode[]>();
        parseResults.set(filePath, [makeClassNode('OrderEntity', filePath, [fieldNode])]);

        const plugin = makePlugin([mod], parseResults);
        const profile = makeProfile(tmpDir);

        const result = (await analyzer.analyze(profile, [plugin])) as BusinessResult;

        expect(result.dataModels[0].fields[0].type).toBe('unknown');
      } finally {
        rmDir(tmpDir);
      }
    });
  });
});
