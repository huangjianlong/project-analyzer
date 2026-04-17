import { describe, it, expect } from 'vitest';
import { AiMemoryGenerator } from './ai-memory-generator.js';
import type {
  AnalysisReport,
  ProjectProfile,
  AiMemoryData,
  AiModuleInfo,
  AiApiInfo,
  GlossaryEntry,
} from '../models/index.js';

// ─── Helpers ───

function makeProfile(overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    projectName: 'my-app',
    projectPath: '/tmp/my-app',
    primaryLanguage: 'typescript',
    languages: [{ language: 'typescript', fileCount: 10, lineCount: 500, percentage: 100 }],
    buildTool: 'npm',
    modules: [],
    fileStats: { totalFiles: 10, sourceFiles: 8, testFiles: 1, configFiles: 1, totalLines: 500 },
    ...overrides,
  };
}

function makeReport(overrides?: Partial<AnalysisReport>): AnalysisReport {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      analyzerVersion: '0.1.0',
      analyzerType: 'ts',
      projectName: 'my-app',
    },
    profile: makeProfile(),
    ...overrides,
  };
}

function makeMemoryData(overrides?: Partial<AiMemoryData>): AiMemoryData {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectMeta: { name: 'my-app', language: 'typescript', framework: 'Express', buildTool: 'npm' },
    modules: [],
    apis: [],
    glossary: [],
    codeNavigation: [],
    ...overrides,
  };
}

// ─── Tests ───

describe('AiMemoryGenerator', () => {
  const generator = new AiMemoryGenerator();

  it('getName returns "ai-memory"', () => {
    expect(generator.getName()).toBe('ai-memory');
  });

  // ─── analyze() placeholder ───

  it('analyze() returns placeholder result', async () => {
    const result = await generator.analyze(makeProfile(), []);
    expect(result).toBeDefined();
    const memResult = result as any;
    expect(memResult.memoryData).toBeDefined();
    expect(memResult.memoryData.version).toBe('1.0.0');
    expect(memResult.memoryData.modules).toEqual([]);
  });

  // ─── generateMemoryData ───

  describe('generateMemoryData', () => {
    it('includes version and generatedAt timestamp', () => {
      const before = new Date().toISOString();
      const data = generator.generateMemoryData(makeReport());
      const after = new Date().toISOString();

      expect(data.version).toBe('1.0.0');
      expect(data.generatedAt).toBeDefined();
      expect(data.generatedAt >= before).toBe(true);
      expect(data.generatedAt <= after).toBe(true);
    });

    it('populates projectMeta from report profile', () => {
      const data = generator.generateMemoryData(makeReport());
      expect(data.projectMeta.name).toBe('my-app');
      expect(data.projectMeta.language).toBe('typescript');
      expect(data.projectMeta.buildTool).toBe('npm');
    });

    it('populates framework from architecture', () => {
      const data = generator.generateMemoryData(makeReport({
        architecture: {
          dependencies: [],
          dependencyGroups: {} as any,
          layers: [],
          frameworks: [{ name: 'Express', category: 'web', evidence: [] }],
        },
      }));
      expect(data.projectMeta.framework).toBe('Express');
    });

    it('uses empty string for framework when no architecture data', () => {
      const data = generator.generateMemoryData(makeReport());
      expect(data.projectMeta.framework).toBe('');
    });

    it('builds modules from business modules', () => {
      const data = generator.generateMemoryData(makeReport({
        business: {
          modules: [
            { name: 'auth', path: 'src/auth', description: 'Authentication module', isInferred: false, keyClasses: ['AuthService', 'AuthController'], keyFiles: ['src/auth/index.ts'], dependencies: ['db'] },
          ],
          dataModels: [],
        },
      }));
      expect(data.modules).toHaveLength(1);
      expect(data.modules[0].name).toBe('auth');
      expect(data.modules[0].purpose).toBe('Authentication module');
      expect(data.modules[0].coreClasses).toHaveLength(2);
      expect(data.modules[0].coreClasses[0].name).toBe('AuthService');
      expect(data.modules[0].coreClasses[0].dependencies).toEqual(['db']);
    });

    it('returns empty modules when no business data', () => {
      const data = generator.generateMemoryData(makeReport());
      expect(data.modules).toEqual([]);
    });

    it('builds apis from report endpoints', () => {
      const data = generator.generateMemoryData(makeReport({
        apis: {
          endpoints: [
            {
              path: '/api/users',
              method: 'GET',
              handlerClass: 'UserController',
              handlerMethod: 'list',
              parameters: [{ name: 'page', type: 'number', in: 'query', required: false }],
              responseType: 'User[]',
              description: 'List all users',
              tags: [],
            },
          ],
          groups: [],
          totalCount: 1,
        },
      }));
      expect(data.apis).toHaveLength(1);
      expect(data.apis[0].path).toBe('/api/users');
      expect(data.apis[0].method).toBe('GET');
      expect(data.apis[0].description).toBe('List all users');
      expect(data.apis[0].parameters).toHaveLength(1);
      expect(data.apis[0].parameters[0].name).toBe('page');
      expect(data.apis[0].responseModel).toBe('User[]');
    });

    it('returns empty apis when no api data', () => {
      const data = generator.generateMemoryData(makeReport());
      expect(data.apis).toEqual([]);
    });

    it('builds glossary from module names and class names', () => {
      const data = generator.generateMemoryData(makeReport({
        business: {
          modules: [
            { name: 'auth', path: 'src/auth', description: 'Auth module', isInferred: false, keyClasses: ['AuthService'], keyFiles: ['src/auth/index.ts'], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      expect(data.glossary.length).toBeGreaterThanOrEqual(2);
      const terms = data.glossary.map(g => g.term);
      expect(terms).toContain('auth');
      expect(terms).toContain('AuthService');
    });

    it('deduplicates glossary entries', () => {
      const data = generator.generateMemoryData(makeReport({
        business: {
          modules: [
            { name: 'auth', path: 'src/auth', description: 'Auth', isInferred: false, keyClasses: ['auth'], keyFiles: [], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      const authEntries = data.glossary.filter(g => g.term === 'auth');
      expect(authEntries).toHaveLength(1);
    });

    it('builds codeNavigation from business modules', () => {
      const data = generator.generateMemoryData(makeReport({
        business: {
          modules: [
            { name: 'orders', path: 'src/orders', description: 'Order management', isInferred: false, keyClasses: [], keyFiles: ['src/orders/service.ts', 'src/orders/controller.ts'], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      expect(data.codeNavigation).toHaveLength(1);
      expect(data.codeNavigation[0].feature).toBe('orders');
      expect(data.codeNavigation[0].files).toEqual(['src/orders/service.ts', 'src/orders/controller.ts']);
    });

    it('returns empty codeNavigation when no business data', () => {
      const data = generator.generateMemoryData(makeReport());
      expect(data.codeNavigation).toEqual([]);
    });
  });

  // ─── compareVersions ───

  describe('compareVersions', () => {
    it('detects added modules', () => {
      const oldData = makeMemoryData({ modules: [] });
      const newMod: AiModuleInfo = { name: 'payments', purpose: 'Payment processing', coreClasses: [] };
      const newData = makeMemoryData({ modules: [newMod] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.modules.added).toHaveLength(1);
      expect(diff.modules.added[0].name).toBe('payments');
      expect(diff.modules.removed).toHaveLength(0);
      expect(diff.modules.modified).toHaveLength(0);
    });

    it('detects removed modules', () => {
      const oldMod: AiModuleInfo = { name: 'legacy', purpose: 'Old module', coreClasses: [] };
      const oldData = makeMemoryData({ modules: [oldMod] });
      const newData = makeMemoryData({ modules: [] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.modules.removed).toHaveLength(1);
      expect(diff.modules.removed[0].name).toBe('legacy');
      expect(diff.modules.added).toHaveLength(0);
    });

    it('detects modified modules', () => {
      const oldMod: AiModuleInfo = { name: 'auth', purpose: 'Old auth', coreClasses: [] };
      const newMod: AiModuleInfo = { name: 'auth', purpose: 'New auth', coreClasses: [] };
      const oldData = makeMemoryData({ modules: [oldMod] });
      const newData = makeMemoryData({ modules: [newMod] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.modules.modified).toHaveLength(1);
      expect(diff.modules.modified[0].old.purpose).toBe('Old auth');
      expect(diff.modules.modified[0].new.purpose).toBe('New auth');
      expect(diff.modules.added).toHaveLength(0);
      expect(diff.modules.removed).toHaveLength(0);
    });

    it('detects unchanged modules as neither added, modified, nor removed', () => {
      const mod: AiModuleInfo = { name: 'auth', purpose: 'Auth', coreClasses: [] };
      const oldData = makeMemoryData({ modules: [mod] });
      const newData = makeMemoryData({ modules: [mod] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.modules.added).toHaveLength(0);
      expect(diff.modules.modified).toHaveLength(0);
      expect(diff.modules.removed).toHaveLength(0);
    });

    it('detects added APIs', () => {
      const newApi: AiApiInfo = {
        path: '/api/new', method: 'POST', description: 'New endpoint',
        parameters: [], businessContext: '', relatedModule: '',
      };
      const oldData = makeMemoryData({ apis: [] });
      const newData = makeMemoryData({ apis: [newApi] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.apis.added).toHaveLength(1);
      expect(diff.apis.added[0].path).toBe('/api/new');
    });

    it('detects removed APIs', () => {
      const oldApi: AiApiInfo = {
        path: '/api/old', method: 'GET', description: 'Old endpoint',
        parameters: [], businessContext: '', relatedModule: '',
      };
      const oldData = makeMemoryData({ apis: [oldApi] });
      const newData = makeMemoryData({ apis: [] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.apis.removed).toHaveLength(1);
      expect(diff.apis.removed[0].path).toBe('/api/old');
    });

    it('detects modified APIs (same path+method, different description)', () => {
      const oldApi: AiApiInfo = {
        path: '/api/users', method: 'GET', description: 'Old desc',
        parameters: [], businessContext: '', relatedModule: '',
      };
      const newApi: AiApiInfo = {
        path: '/api/users', method: 'GET', description: 'New desc',
        parameters: [], businessContext: '', relatedModule: '',
      };
      const oldData = makeMemoryData({ apis: [oldApi] });
      const newData = makeMemoryData({ apis: [newApi] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.apis.modified).toHaveLength(1);
      expect(diff.apis.modified[0].old.description).toBe('Old desc');
      expect(diff.apis.modified[0].new.description).toBe('New desc');
    });

    it('detects added glossary entries', () => {
      const newEntry: GlossaryEntry = { term: 'NewTerm', definition: 'A new term', relatedCode: [] };
      const oldData = makeMemoryData({ glossary: [] });
      const newData = makeMemoryData({ glossary: [newEntry] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.glossary.added).toHaveLength(1);
      expect(diff.glossary.added[0].term).toBe('NewTerm');
    });

    it('detects removed glossary entries', () => {
      const oldEntry: GlossaryEntry = { term: 'OldTerm', definition: 'An old term', relatedCode: [] };
      const oldData = makeMemoryData({ glossary: [oldEntry] });
      const newData = makeMemoryData({ glossary: [] });

      const diff = generator.compareVersions(oldData, newData);
      expect(diff.glossary.removed).toHaveLength(1);
      expect(diff.glossary.removed[0].term).toBe('OldTerm');
    });

    it('handles complex diff with mixed changes', () => {
      const oldData = makeMemoryData({
        modules: [
          { name: 'auth', purpose: 'Auth', coreClasses: [] },
          { name: 'legacy', purpose: 'Legacy', coreClasses: [] },
        ],
        apis: [
          { path: '/api/auth', method: 'POST', description: 'Login', parameters: [], businessContext: '', relatedModule: 'auth' },
        ],
        glossary: [
          { term: 'auth', definition: 'Authentication', relatedCode: [] },
          { term: 'legacy', definition: 'Legacy module', relatedCode: [] },
        ],
      });

      const newData = makeMemoryData({
        modules: [
          { name: 'auth', purpose: 'Updated Auth', coreClasses: [] },
          { name: 'payments', purpose: 'Payments', coreClasses: [] },
        ],
        apis: [
          { path: '/api/auth', method: 'POST', description: 'Login', parameters: [], businessContext: '', relatedModule: 'auth' },
          { path: '/api/pay', method: 'POST', description: 'Pay', parameters: [], businessContext: '', relatedModule: 'payments' },
        ],
        glossary: [
          { term: 'auth', definition: 'Authentication', relatedCode: [] },
          { term: 'payments', definition: 'Payment processing', relatedCode: [] },
        ],
      });

      const diff = generator.compareVersions(oldData, newData);

      // modules: auth modified, legacy removed, payments added
      expect(diff.modules.added).toHaveLength(1);
      expect(diff.modules.added[0].name).toBe('payments');
      expect(diff.modules.modified).toHaveLength(1);
      expect(diff.modules.modified[0].new.purpose).toBe('Updated Auth');
      expect(diff.modules.removed).toHaveLength(1);
      expect(diff.modules.removed[0].name).toBe('legacy');

      // apis: /api/pay added, /api/auth unchanged
      expect(diff.apis.added).toHaveLength(1);
      expect(diff.apis.added[0].path).toBe('/api/pay');
      expect(diff.apis.modified).toHaveLength(0);
      expect(diff.apis.removed).toHaveLength(0);

      // glossary: payments added, legacy removed
      expect(diff.glossary.added).toHaveLength(1);
      expect(diff.glossary.added[0].term).toBe('payments');
      expect(diff.glossary.removed).toHaveLength(1);
      expect(diff.glossary.removed[0].term).toBe('legacy');
    });
  });
});
