import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PitfallDetector } from './pitfall-detector.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  PitfallResult,
  AstNode,
  Dependency,
  ModuleInfo,
} from '../models/index.js';

// ─── Helpers ───

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pitfall-test-'));
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

function makePlugin(opts?: {
  deps?: Dependency[];
  modules?: ModuleInfo[];
  nodes?: AstNode[];
}): LanguagePlugin {
  return {
    getLanguageId: () => 'typescript',
    parseFile: () => opts?.nodes ?? [],
    extractDependencies: () => opts?.deps ?? [],
    identifyApis: () => [],
    identifyModules: () => opts?.modules ?? [],
  };
}

function makeMethodNode(name: string, startLine: number, endLine: number, children: AstNode[] = []): AstNode {
  return {
    type: 'method',
    name,
    filePath: '/src/example.ts',
    startLine,
    endLine,
    modifiers: [],
    annotations: [],
    children,
  };
}

function makeClassNode(
  name: string,
  startLine: number,
  endLine: number,
  methods: AstNode[],
): AstNode {
  return {
    type: 'class',
    name,
    filePath: '/src/example.ts',
    startLine,
    endLine,
    modifiers: [],
    annotations: [],
    children: methods,
  };
}

// ─── Tests ───

describe('PitfallDetector', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmDir(tmpDir); });

  it('getName returns "pitfall"', () => {
    const detector = new PitfallDetector();
    expect(detector.getName()).toBe('pitfall');
  });

  // ─── Anti-pattern detection ───

  describe('anti-pattern detection', () => {
    it('detects long methods (> 80 lines by default)', () => {
      const detector = new PitfallDetector();
      const longMethod = makeMethodNode('processData', 1, 100);
      const records = detector.detectAntiPatterns([longMethod]);
      expect(records).toHaveLength(1);
      expect(records[0].category).toBe('anti-pattern');
      expect(records[0].severity).toBe('medium');
      expect(records[0].description).toContain('processData');
      expect(records[0].description).toContain('99');
    });

    it('does not flag methods within threshold', () => {
      const detector = new PitfallDetector();
      const shortMethod = makeMethodNode('doStuff', 1, 50);
      const records = detector.detectAntiPatterns([shortMethod]);
      expect(records).toHaveLength(0);
    });

    it('detects God Class with too many methods', () => {
      const detector = new PitfallDetector();
      const methods = Array.from({ length: 25 }, (_, i) =>
        makeMethodNode(`method${i}`, i * 10, i * 10 + 5),
      );
      const godClass = makeClassNode('GodService', 1, 260, methods);
      const records = detector.detectAntiPatterns([godClass]);
      const godClassRecords = records.filter(r => r.description.includes('methods'));
      expect(godClassRecords).toHaveLength(1);
      expect(godClassRecords[0].severity).toBe('high');
    });

    it('detects God Class with too many lines', () => {
      const detector = new PitfallDetector();
      const cls = makeClassNode('HugeClass', 1, 600, []);
      const records = detector.detectAntiPatterns([cls]);
      const lineRecords = records.filter(r => r.description.includes('lines long'));
      expect(lineRecords).toHaveLength(1);
      expect(lineRecords[0].severity).toBe('high');
    });

    it('detects deep nesting', () => {
      const detector = new PitfallDetector();
      // Create nested children to simulate depth > 4
      const deepChild: AstNode = {
        type: 'function', name: 'inner5', filePath: '/src/a.ts',
        startLine: 50, endLine: 55, modifiers: [], annotations: [], children: [],
      };
      const level4: AstNode = {
        type: 'function', name: 'inner4', filePath: '/src/a.ts',
        startLine: 40, endLine: 60, modifiers: [], annotations: [], children: [deepChild],
      };
      const level3: AstNode = {
        type: 'function', name: 'inner3', filePath: '/src/a.ts',
        startLine: 30, endLine: 70, modifiers: [], annotations: [], children: [level4],
      };
      const level2: AstNode = {
        type: 'function', name: 'inner2', filePath: '/src/a.ts',
        startLine: 20, endLine: 80, modifiers: [], annotations: [], children: [level3],
      };
      const level1: AstNode = {
        type: 'function', name: 'inner1', filePath: '/src/a.ts',
        startLine: 10, endLine: 90, modifiers: [], annotations: [], children: [level2],
      };
      const topMethod = makeMethodNode('deepMethod', 1, 100);
      topMethod.children = [level1];

      const records = detector.detectAntiPatterns([topMethod]);
      const nestingRecords = records.filter(r => r.description.includes('nesting depth'));
      expect(nestingRecords.length).toBeGreaterThanOrEqual(1);
      expect(nestingRecords[0].severity).toBe('medium');
    });

    it('respects custom thresholds', () => {
      const detector = new PitfallDetector({
        antiPatternThresholds: { maxMethodLines: 20, maxNestingDepth: 2, maxClassMethods: 5, maxClassLines: 100, maxFileLines: 200 },
      });
      const method = makeMethodNode('shortish', 1, 25);
      const records = detector.detectAntiPatterns([method]);
      expect(records).toHaveLength(1);
      expect(records[0].description).toContain('24');
    });
  });

  // ─── TODO marker detection ───

  describe('TODO marker detection', () => {
    it('detects TODO, FIXME, HACK, XXX markers', async () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'app.ts'),
        [
          'const x = 1;',
          '// TODO: implement this feature',
          '// FIXME: broken logic here',
          '// HACK: temporary workaround',
          '// XXX: needs review',
          'const y = 2;',
        ].join('\n'),
      );

      const sourceFiles = [path.join(srcDir, 'app.ts')];
      const records = detector.detectTodoMarkers(tmpDir, sourceFiles);

      expect(records).toHaveLength(4);
      expect(records.filter(r => r.severity === 'low')).toHaveLength(2);   // TODO, XXX
      expect(records.filter(r => r.severity === 'medium')).toHaveLength(2); // FIXME, HACK
      expect(records.every(r => r.category === 'todo-marker')).toBe(true);
    });

    it('returns empty for files without markers', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'clean.ts'), 'const x = 1;\nconst y = 2;\n');

      const records = detector.detectTodoMarkers(tmpDir, [path.join(srcDir, 'clean.ts')]);
      expect(records).toHaveLength(0);
    });
  });

  // ─── Hardcoded config detection ───

  describe('hardcoded config detection', () => {
    it('detects hardcoded URLs in source files', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'service.ts'),
        'const apiUrl = "https://api.example.com/v1/users";\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'service.ts')]);
      expect(records).toHaveLength(1);
      expect(records[0].category).toBe('hardcoded-config');
      expect(records[0].severity).toBe('medium');
    });

    it('detects hardcoded IP addresses', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'db.ts'),
        'const dbHost = "192.168.1.100";\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'db.ts')]);
      expect(records.some(r => r.description.includes('IP address'))).toBe(true);
    });

    it('ignores loopback addresses', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'local.ts'),
        'const host = "127.0.0.1";\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'local.ts')]);
      const ipRecords = records.filter(r => r.description.includes('IP address'));
      expect(ipRecords).toHaveLength(0);
    });

    it('detects hardcoded API keys', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'auth.ts'),
        'const api_key = "sk_live_abcdef1234567890";\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'auth.ts')]);
      expect(records.some(r => r.description.includes('secret'))).toBe(true);
    });

    it('skips test files', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'service.test.ts'),
        'const testUrl = "https://api.example.com/test";\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'service.test.ts')]);
      expect(records).toHaveLength(0);
    });

    it('skips comment lines', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'commented.ts'),
        '// https://docs.example.com/api\nconst x = 1;\n',
      );

      const records = detector.detectHardcodedConfigs(tmpDir, [path.join(srcDir, 'commented.ts')]);
      expect(records).toHaveLength(0);
    });
  });

  // ─── Deprecated dependency detection ───

  describe('deprecated dependency detection', () => {
    it('detects known deprecated packages', () => {
      const detector = new PitfallDetector();
      const deps: Dependency[] = [
        { name: 'request', version: '2.88.2', category: 'utility', scope: 'compile' },
        { name: 'express', version: '4.18.0', category: 'web-framework', scope: 'compile' },
      ];

      const records = detector.detectDeprecatedDependencies(deps);
      expect(records).toHaveLength(1);
      expect(records[0].category).toBe('deprecated-dep');
      expect(records[0].description).toContain('request');
    });

    it('returns empty for non-deprecated packages', () => {
      const detector = new PitfallDetector();
      const deps: Dependency[] = [
        { name: 'express', version: '4.18.0', category: 'web-framework', scope: 'compile' },
      ];

      const records = detector.detectDeprecatedDependencies(deps);
      expect(records).toHaveLength(0);
    });
  });

  // ─── Missing test detection ───

  describe('missing test detection', () => {
    it('detects modules without test files', () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'auth.ts'), 'export class Auth {}');
      fs.writeFileSync(path.join(srcDir, 'user.ts'), 'export class User {}');
      fs.writeFileSync(path.join(srcDir, 'user.test.ts'), 'test("user", () => {})');

      const modules: ModuleInfo[] = [
        { name: 'auth', path: 'src/auth', description: 'Auth module', isInferred: false, keyClasses: [], keyFiles: ['src/auth.ts'], dependencies: [] },
        { name: 'user', path: 'src/user', description: 'User module', isInferred: false, keyClasses: [], keyFiles: ['src/user.ts'], dependencies: [] },
      ];

      const sourceFiles = [
        path.join(srcDir, 'auth.ts'),
        path.join(srcDir, 'user.ts'),
        path.join(srcDir, 'user.test.ts'),
      ];

      const records = detector.detectMissingTests(tmpDir, modules, sourceFiles);
      expect(records).toHaveLength(1);
      expect(records[0].category).toBe('missing-test');
      expect(records[0].description).toContain('auth');
    });
  });

  // ─── Full analyze integration ───

  describe('full analyze()', () => {
    it('returns PitfallResult with summary', async () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'app.ts'),
        '// TODO: fix this\nconst x = 1;\n',
      );

      const profile = makeProfile(tmpDir);
      const plugin = makePlugin();
      const result = (await detector.analyze(profile, [plugin])) as PitfallResult;

      expect(result.records).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBe(result.records.length);
      expect(result.summary.byCategory).toBeDefined();
      expect(result.summary.bySeverity).toBeDefined();
    });

    it('aggregates records from all detection categories', async () => {
      const detector = new PitfallDetector();
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'service.ts'),
        [
          '// FIXME: broken',
          'const url = "https://api.prod.example.com/data";',
          'export function process() { return 1; }',
        ].join('\n'),
      );

      const longMethod = makeMethodNode('bigMethod', 1, 100);
      const plugin = makePlugin({
        nodes: [longMethod],
        deps: [{ name: 'request', version: '2.88.2', category: 'utility', scope: 'compile' }],
      });

      const profile = makeProfile(tmpDir);
      const result = (await detector.analyze(profile, [plugin])) as PitfallResult;

      // Should have at least: anti-pattern (long method), deprecated-dep, todo-marker, hardcoded-config
      expect(result.summary.total).toBeGreaterThanOrEqual(3);
      expect(result.summary.byCategory['anti-pattern']).toBeGreaterThanOrEqual(1);
      expect(result.summary.byCategory['deprecated-dep']).toBeGreaterThanOrEqual(1);
      expect(result.summary.byCategory['todo-marker']).toBeGreaterThanOrEqual(1);
    });
  });
});
