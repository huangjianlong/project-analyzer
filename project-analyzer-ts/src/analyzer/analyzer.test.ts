/**
 * Tests for ProjectAnalyzer coordinator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProjectAnalyzer } from './analyzer.js';
import type { AnalyzerConfig } from './analyzer.js';

/** Create a minimal project directory for testing. */
function createTestProject(dir: string): void {
  // package.json
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'test-project', version: '1.0.0', scripts: { start: 'node index.js' } }),
  );
  // A source file
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const hello = "world";\n');
}

describe('ProjectAnalyzer', () => {
  let tmpDir: string;
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-test-'));
    projectDir = path.join(tmpDir, 'project');
    outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(projectDir, { recursive: true });
    createTestProject(projectDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run all modules by default and produce reports', async () => {
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: [],
    };

    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.run(config);

    // Report metadata
    expect(result.report.metadata.analyzerType).toBe('ts');
    expect(result.report.metadata.projectName).toBe('project');
    expect(result.report.profile.projectPath).toBe(projectDir);

    // Reports were generated
    expect(result.reportFiles.indexFile).toContain('README.md');
    expect(result.reportFiles.reportFiles.length).toBeGreaterThan(0);

    // Output directory was created
    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it('should run only selected modules when specified', async () => {
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: ['architecture', 'structure'],
    };

    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.run(config);

    // Selected modules should have results
    expect(result.report.architecture).toBeDefined();
    expect(result.report.structure).toBeDefined();

    // Non-selected modules should be undefined
    expect(result.report.business).toBeUndefined();
    expect(result.report.flows).toBeUndefined();
    expect(result.report.apis).toBeUndefined();
  });

  it('should invoke progress callback', async () => {
    const messages: string[] = [];
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: ['architecture'],
    };

    const analyzer = new ProjectAnalyzer((msg) => messages.push(msg));
    await analyzer.run(config);

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some(m => m.includes('扫描项目目录'))).toBe(true);
    expect(messages.some(m => m.includes('生成分析报告'))).toBe(true);
  });

  it('should record warning for unknown module names', async () => {
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: ['nonexistent'],
    };

    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.run(config);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('nonexistent');
  });

  it('should throw on invalid project path (scanner fatal error)', async () => {
    const config: AnalyzerConfig = {
      projectPath: '/nonexistent/path/that/does/not/exist',
      outputDir,
      modules: [],
    };

    const analyzer = new ProjectAnalyzer();
    await expect(analyzer.run(config)).rejects.toThrow();
  });

  it('should support language override via config.lang', async () => {
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: ['architecture'],
      lang: 'python',
    };

    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.run(config);

    // Should still complete without error
    expect(result.report.metadata.projectName).toBe('project');
  });

  it('should handle quickstart and ai-memory modules with full report', async () => {
    const config: AnalyzerConfig = {
      projectPath: projectDir,
      outputDir,
      modules: ['quickstart', 'ai-memory'],
    };

    const analyzer = new ProjectAnalyzer();
    const result = await analyzer.run(config);

    expect(result.report.quickstart).toBeDefined();
    expect(result.report.quickstart?.fiveMinuteOverview).toBeDefined();
    expect(result.report.aiMemory).toBeDefined();
    expect(result.report.aiMemory?.memoryData).toBeDefined();
  });
});
