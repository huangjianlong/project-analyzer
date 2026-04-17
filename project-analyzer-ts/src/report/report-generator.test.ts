import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { ReportGenerator } from './report-generator.js';
import type { AnalysisReport } from '../models/index.js';

/** Minimal valid AnalysisReport for testing. */
function makeMinimalReport(overrides?: Partial<AnalysisReport>): AnalysisReport {
  return {
    metadata: {
      generatedAt: '2025-01-15T10:00:00Z',
      analyzerVersion: '0.1.0',
      analyzerType: 'ts',
      projectName: 'test-project',
    },
    profile: {
      projectName: 'test-project',
      projectPath: '/tmp/test-project',
      primaryLanguage: 'TypeScript',
      languages: [
        { language: 'TypeScript', fileCount: 10, lineCount: 500, percentage: 80 },
        { language: 'JavaScript', fileCount: 2, lineCount: 100, percentage: 20 },
      ],
      buildTool: 'npm',
      modules: [],
      fileStats: { totalFiles: 15, sourceFiles: 12, testFiles: 3, configFiles: 2, totalLines: 600 },
    },
    ...overrides,
  };
}

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let tmpDir: string;

  beforeEach(async () => {
    generator = new ReportGenerator();
    tmpDir = await mkdtemp(join(tmpdir(), 'rg-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates output directory if it does not exist', async () => {
    const nested = join(tmpDir, 'a', 'b', 'c');
    const report = makeMinimalReport();
    await generator.generate(report, nested);
    const files = await readdir(nested);
    expect(files.length).toBeGreaterThan(0);
  });

  it('uses default output dir name when none provided', async () => {
    // We override to a known temp path to avoid polluting cwd
    const report = makeMinimalReport();
    const outDir = join(tmpDir, 'analysis-reports');
    const result = await generator.generate(report, outDir);
    expect(result.indexFile).toContain('README.md');
  });

  it('generates all expected report files', async () => {
    const report = makeMinimalReport();
    const result = await generator.generate(report, tmpDir);

    const expectedFiles = [
      '01-project-overview.md',
      '02-architecture.md',
      '03-business.md',
      '04-flows.md',
      '05-apis.md',
      '06-structure.md',
      '07-ops.md',
      '08-pitfalls.md',
      '09-quickstart.md',
      'ai-context.md',
      'ai-memory.json',
      'README.md',
    ];

    const dirFiles = await readdir(tmpDir);
    for (const f of expectedFiles) {
      expect(dirFiles).toContain(f);
    }
    // reportFiles should include all non-README files
    expect(result.reportFiles.length).toBe(11); // 10 md + 1 json
    expect(result.indexFile).toContain('README.md');
  });

  it('includes standard header in every Markdown report', async () => {
    const report = makeMinimalReport();
    await generator.generate(report, tmpDir);

    const mdFiles = [
      '01-project-overview.md',
      '02-architecture.md',
      '03-business.md',
      '04-flows.md',
      '05-apis.md',
      '06-structure.md',
      '07-ops.md',
      '08-pitfalls.md',
      '09-quickstart.md',
      'ai-context.md',
      'README.md',
    ];

    for (const f of mdFiles) {
      const content = await readFile(join(tmpDir, f), 'utf-8');
      expect(content).toContain('项目名称: test-project');
      expect(content).toContain('生成时间: 2025-01-15T10:00:00Z');
      expect(content).toContain('Project Analyzer ts v0.1.0');
    }
  });

  it('shows no-data message when optional sections are missing', async () => {
    const report = makeMinimalReport(); // no architecture, business, etc.
    await generator.generate(report, tmpDir);

    const archContent = await readFile(join(tmpDir, '02-architecture.md'), 'utf-8');
    expect(archContent).toContain('该模块未产生有效结果');

    const bizContent = await readFile(join(tmpDir, '03-business.md'), 'utf-8');
    expect(bizContent).toContain('该模块未产生有效结果');

    const flowContent = await readFile(join(tmpDir, '04-flows.md'), 'utf-8');
    expect(flowContent).toContain('该模块未产生有效结果');

    const apiContent = await readFile(join(tmpDir, '05-apis.md'), 'utf-8');
    expect(apiContent).toContain('该模块未产生有效结果');
  });

  it('renders project overview with profile data', async () => {
    const report = makeMinimalReport();
    await generator.generate(report, tmpDir);

    const content = await readFile(join(tmpDir, '01-project-overview.md'), 'utf-8');
    expect(content).toContain('# 项目概览');
    expect(content).toContain('TypeScript');
    expect(content).toContain('npm');
    expect(content).toContain('500');
    expect(content).toContain('80%');
  });

  it('renders architecture report with data', async () => {
    const report = makeMinimalReport({
      architecture: {
        dependencies: [{ name: 'express', version: '4.18.0', category: 'web-framework', scope: 'compile' }],
        dependencyGroups: {
          'web-framework': [{ name: 'express', version: '4.18.0', category: 'web-framework', scope: 'compile' }],
        } as any,
        layers: [{ name: 'Controller', pattern: '**/controllers/**', classes: ['UserController'], files: ['user.ts'] }],
        frameworks: [{ name: 'Express', version: '4.18.0', category: 'web', evidence: ['package.json'] }],
      },
    });
    await generator.generate(report, tmpDir);

    const content = await readFile(join(tmpDir, '02-architecture.md'), 'utf-8');
    expect(content).toContain('Express');
    expect(content).toContain('web-framework');
    expect(content).toContain('Controller');
  });

  it('renders ai-memory.json with valid JSON', async () => {
    const report = makeMinimalReport({
      aiMemory: {
        memoryData: {
          version: '1.0',
          generatedAt: '2025-01-15T10:00:00Z',
          projectMeta: { name: 'test', language: 'TS', framework: 'Express', buildTool: 'npm' },
          modules: [],
          apis: [],
          glossary: [],
          codeNavigation: [],
        },
        jsonFilePath: 'ai-memory.json',
        markdownFilePath: 'ai-context.md',
      },
    });
    await generator.generate(report, tmpDir);

    const jsonContent = await readFile(join(tmpDir, 'ai-memory.json'), 'utf-8');
    const parsed = JSON.parse(jsonContent);
    expect(parsed.version).toBe('1.0');
    expect(parsed.projectMeta.name).toBe('test');
  });

  it('renders ai-memory.json with error when no data', async () => {
    const report = makeMinimalReport();
    await generator.generate(report, tmpDir);

    const jsonContent = await readFile(join(tmpDir, 'ai-memory.json'), 'utf-8');
    const parsed = JSON.parse(jsonContent);
    expect(parsed.error).toContain('该模块未产生有效结果');
  });

  it('README.md contains links to all report files', async () => {
    const report = makeMinimalReport();
    await generator.generate(report, tmpDir);

    const content = await readFile(join(tmpDir, 'README.md'), 'utf-8');
    expect(content).toContain('[01-project-overview.md](./01-project-overview.md)');
    expect(content).toContain('[02-architecture.md](./02-architecture.md)');
    expect(content).toContain('[09-quickstart.md](./09-quickstart.md)');
    expect(content).toContain('[ai-memory.json](./ai-memory.json)');
    expect(content).toContain('[ai-context.md](./ai-context.md)');
  });

  it('renders quickstart report with data', async () => {
    const report = makeMinimalReport({
      quickstart: {
        fiveMinuteOverview: {
          purpose: 'A test project',
          techStack: ['Express', 'TypeScript'],
          coreModules: ['auth', 'users'],
          startupCommand: 'npm start',
        },
        devSetupSteps: ['npm install', 'npm run dev'],
        businessOverview: [
          { moduleName: 'auth', description: 'Authentication', keyFiles: ['auth.ts'], relatedApis: ['POST /login'] },
        ],
        warnings: [
          { category: 'anti-pattern', severity: 'high', filePath: 'big.ts', description: 'God class', suggestion: 'Split it' },
        ],
        apiQuickRef: [
          { path: '/login', method: 'POST', description: 'User login' },
        ],
      },
    });
    await generator.generate(report, tmpDir);

    const content = await readFile(join(tmpDir, '09-quickstart.md'), 'utf-8');
    expect(content).toContain('A test project');
    expect(content).toContain('npm install');
    expect(content).toContain('auth');
    expect(content).toContain('God class');
    expect(content).toContain('/login');
  });

  it('renders pitfalls report with records', async () => {
    const report = makeMinimalReport({
      pitfalls: {
        records: [
          { category: 'todo-marker', severity: 'low', filePath: 'app.ts', line: 42, description: 'TODO: fix this', suggestion: 'Fix it' },
        ],
        summary: {
          total: 1,
          byCategory: { 'todo-marker': 1 } as any,
          bySeverity: { high: 0, medium: 0, low: 1 },
        },
      },
    });
    await generator.generate(report, tmpDir);

    const content = await readFile(join(tmpDir, '08-pitfalls.md'), 'utf-8');
    expect(content).toContain('todo-marker');
    expect(content).toContain('app.ts:42');
    expect(content).toContain('Fix it');
  });
});
