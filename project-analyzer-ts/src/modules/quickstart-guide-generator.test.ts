import { describe, it, expect } from 'vitest';
import { QuickstartGuideGenerator } from './quickstart-guide-generator.js';
import type {
  AnalysisReport,
  ProjectProfile,
  QuickstartResult,
  PitfallRecord,
} from '../models/index.js';

// ─── Helpers ───

const INSUFFICIENT = '信息不足，建议手动补充';

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

function highPitfall(desc: string): PitfallRecord {
  return {
    category: 'anti-pattern',
    severity: 'high',
    filePath: 'src/bad.ts',
    line: 10,
    description: desc,
    suggestion: 'Fix it',
  };
}

function lowPitfall(desc: string): PitfallRecord {
  return {
    category: 'todo-marker',
    severity: 'low',
    filePath: 'src/ok.ts',
    line: 5,
    description: desc,
    suggestion: 'Consider fixing',
  };
}

// ─── Tests ───

describe('QuickstartGuideGenerator', () => {
  const generator = new QuickstartGuideGenerator();

  it('getName returns "quickstart"', () => {
    expect(generator.getName()).toBe('quickstart');
  });

  // ─── analyze() placeholder ───

  it('analyze() returns placeholder result with insufficient data markers', async () => {
    const result = (await generator.analyze(makeProfile(), [])) as QuickstartResult;
    expect(result.fiveMinuteOverview.purpose).toBe(INSUFFICIENT);
    expect(result.devSetupSteps).toContain(INSUFFICIENT);
    expect(result.businessOverview[0].moduleName).toBe(INSUFFICIENT);
  });

  // ─── fiveMinuteOverview ───

  describe('fiveMinuteOverview', () => {
    it('populates purpose from projectName and primaryLanguage', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.fiveMinuteOverview.purpose).toContain('my-app');
      expect(result.fiveMinuteOverview.purpose).toContain('typescript');
    });

    it('populates techStack from architecture frameworks', () => {
      const result = generator.generateGuide(makeReport({
        architecture: {
          dependencies: [],
          dependencyGroups: {} as any,
          layers: [],
          frameworks: [
            { name: 'Express', category: 'web', evidence: [] },
            { name: 'React', category: 'frontend', evidence: [] },
          ],
        },
      }));
      expect(result.fiveMinuteOverview.techStack).toEqual(['Express', 'React']);
    });

    it('marks techStack as insufficient when no architecture data', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.fiveMinuteOverview.techStack).toEqual([INSUFFICIENT]);
    });

    it('populates coreModules from business modules', () => {
      const result = generator.generateGuide(makeReport({
        business: {
          modules: [
            { name: 'auth', path: 'src/auth', description: 'Auth module', isInferred: false, keyClasses: [], keyFiles: [], dependencies: [] },
            { name: 'orders', path: 'src/orders', description: 'Orders module', isInferred: false, keyClasses: [], keyFiles: [], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      expect(result.fiveMinuteOverview.coreModules).toEqual(['auth', 'orders']);
    });

    it('marks coreModules as insufficient when no business data', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.fiveMinuteOverview.coreModules).toEqual([INSUFFICIENT]);
    });

    it('populates startupCommand from ops startup[0]', () => {
      const result = generator.generateGuide(makeReport({
        ops: {
          startup: [
            { method: 'npm-script', command: 'npm run dev', description: 'Dev server', filePath: 'package.json', isInferred: false },
          ],
          configItems: [],
          externalServices: [],
        },
      }));
      expect(result.fiveMinuteOverview.startupCommand).toBe('npm run dev');
    });

    it('marks startupCommand as insufficient when no ops data', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.fiveMinuteOverview.startupCommand).toBe(INSUFFICIENT);
    });
  });

  // ─── devSetupSteps ───

  describe('devSetupSteps', () => {
    it('includes npm install for npm projects', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.devSetupSteps).toContain('npm install');
    });

    it('includes pip install for pip projects', () => {
      const result = generator.generateGuide(makeReport({
        profile: makeProfile({ buildTool: 'pip' }),
      }));
      expect(result.devSetupSteps).toContain('pip install -r requirements.txt');
    });

    it('includes poetry install for poetry projects', () => {
      const result = generator.generateGuide(makeReport({
        profile: makeProfile({ buildTool: 'poetry' }),
      }));
      expect(result.devSetupSteps).toContain('poetry install');
    });

    it('includes go mod download for go-mod projects', () => {
      const result = generator.generateGuide(makeReport({
        profile: makeProfile({ buildTool: 'go-mod' }),
      }));
      expect(result.devSetupSteps).toContain('go mod download');
    });

    it('includes maven install for maven projects', () => {
      const result = generator.generateGuide(makeReport({
        profile: makeProfile({ buildTool: 'maven' }),
      }));
      expect(result.devSetupSteps).toContain('mvn install');
    });

    it('includes startup command when available', () => {
      const result = generator.generateGuide(makeReport({
        ops: {
          startup: [{ method: 'npm-script', command: 'npm start', description: '', filePath: '', isInferred: false }],
          configItems: [],
          externalServices: [],
        },
      }));
      expect(result.devSetupSteps).toContain('npm start');
    });

    it('returns insufficient marker when buildTool is unknown and no startup', () => {
      const result = generator.generateGuide(makeReport({
        profile: makeProfile({ buildTool: 'unknown' }),
      }));
      expect(result.devSetupSteps).toEqual([INSUFFICIENT]);
    });
  });

  // ─── businessOverview ───

  describe('businessOverview', () => {
    it('maps business modules to overview entries', () => {
      const result = generator.generateGuide(makeReport({
        business: {
          modules: [
            { name: 'users', path: 'src/users', description: 'User management', isInferred: false, keyClasses: [], keyFiles: ['src/users/controller.ts'], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      expect(result.businessOverview).toHaveLength(1);
      expect(result.businessOverview[0].moduleName).toBe('users');
      expect(result.businessOverview[0].description).toBe('User management');
      expect(result.businessOverview[0].keyFiles).toEqual(['src/users/controller.ts']);
    });

    it('returns insufficient marker when no business modules', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.businessOverview).toHaveLength(1);
      expect(result.businessOverview[0].moduleName).toBe(INSUFFICIENT);
    });

    it('marks description as insufficient when module has no description', () => {
      const result = generator.generateGuide(makeReport({
        business: {
          modules: [
            { name: 'core', path: 'src/core', description: '', isInferred: false, keyClasses: [], keyFiles: [], dependencies: [] },
          ],
          dataModels: [],
        },
      }));
      expect(result.businessOverview[0].description).toBe(INSUFFICIENT);
    });
  });

  // ─── warnings (only high severity) ───

  describe('warnings', () => {
    it('includes only high severity pitfalls', () => {
      const result = generator.generateGuide(makeReport({
        pitfalls: {
          records: [
            highPitfall('Critical issue'),
            lowPitfall('Minor todo'),
            { ...highPitfall('Another critical'), category: 'security-risk' },
            { ...lowPitfall('Medium issue'), severity: 'medium' },
          ],
          summary: { total: 4, byCategory: {} as any, bySeverity: { high: 2, medium: 1, low: 1 } },
        },
      }));
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.every(w => w.severity === 'high')).toBe(true);
    });

    it('returns empty array when no pitfalls', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.warnings).toEqual([]);
    });

    it('returns empty array when no high severity pitfalls', () => {
      const result = generator.generateGuide(makeReport({
        pitfalls: {
          records: [lowPitfall('Just a todo')],
          summary: { total: 1, byCategory: {} as any, bySeverity: { high: 0, medium: 0, low: 1 } },
        },
      }));
      expect(result.warnings).toEqual([]);
    });
  });

  // ─── apiQuickRef ───

  describe('apiQuickRef', () => {
    it('maps API endpoints to quick ref entries', () => {
      const result = generator.generateGuide(makeReport({
        apis: {
          endpoints: [
            { path: '/api/users', method: 'GET', handlerClass: 'UserController', handlerMethod: 'list', parameters: [], tags: [], description: 'List users' },
            { path: '/api/users/:id', method: 'DELETE', handlerClass: 'UserController', handlerMethod: 'delete', parameters: [], tags: [] },
          ],
          groups: [],
          totalCount: 2,
        },
      }));
      expect(result.apiQuickRef).toHaveLength(2);
      expect(result.apiQuickRef![0]).toEqual({ path: '/api/users', method: 'GET', description: 'List users' });
      expect(result.apiQuickRef![1].description).toBe(INSUFFICIENT);
    });

    it('returns undefined when no API endpoints', () => {
      const result = generator.generateGuide(makeReport());
      expect(result.apiQuickRef).toBeUndefined();
    });

    it('returns undefined when endpoints array is empty', () => {
      const result = generator.generateGuide(makeReport({
        apis: { endpoints: [], groups: [], totalCount: 0 },
      }));
      expect(result.apiQuickRef).toBeUndefined();
    });
  });

  // ─── Full integration ───

  describe('full report integration', () => {
    it('generates complete guide from a rich report', () => {
      const result = generator.generateGuide(makeReport({
        architecture: {
          dependencies: [],
          dependencyGroups: {} as any,
          layers: [],
          frameworks: [{ name: 'Express', category: 'web', evidence: [] }],
        },
        business: {
          modules: [
            { name: 'auth', path: 'src/auth', description: 'Authentication', isInferred: false, keyClasses: [], keyFiles: ['src/auth/index.ts'], dependencies: [] },
          ],
          dataModels: [],
        },
        ops: {
          startup: [{ method: 'npm-script', command: 'npm run dev', description: 'Dev', filePath: 'package.json', isInferred: false }],
          configItems: [],
          externalServices: [],
        },
        pitfalls: {
          records: [highPitfall('God class detected'), lowPitfall('TODO found')],
          summary: { total: 2, byCategory: {} as any, bySeverity: { high: 1, medium: 0, low: 1 } },
        },
        apis: {
          endpoints: [
            { path: '/login', method: 'POST', handlerClass: 'AuthController', handlerMethod: 'login', parameters: [], tags: [], description: 'User login' },
          ],
          groups: [],
          totalCount: 1,
        },
      }));

      // fiveMinuteOverview
      expect(result.fiveMinuteOverview.techStack).toEqual(['Express']);
      expect(result.fiveMinuteOverview.coreModules).toEqual(['auth']);
      expect(result.fiveMinuteOverview.startupCommand).toBe('npm run dev');

      // devSetupSteps
      expect(result.devSetupSteps).toContain('npm install');
      expect(result.devSetupSteps).toContain('npm run dev');

      // businessOverview
      expect(result.businessOverview).toHaveLength(1);
      expect(result.businessOverview[0].moduleName).toBe('auth');

      // warnings — only high
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].description).toBe('God class detected');

      // apiQuickRef
      expect(result.apiQuickRef).toHaveLength(1);
      expect(result.apiQuickRef![0].path).toBe('/login');
    });
  });
});
