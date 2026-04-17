import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DefaultProjectScanner } from './project-scanner.js';
import { AnalysisException } from '../errors/index.js';

/**
 * Helper: create a temporary project directory with given file structure.
 * `files` is a record of relative path → content.
 */
function createTempProject(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return tmpDir;
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('DefaultProjectScanner', () => {
  const scanner = new DefaultProjectScanner();
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) removeTempDir(tmpDir);
  });

  describe('scan() — basic project', () => {
    beforeEach(() => {
      tmpDir = createTempProject({
        'package.json': '{ "name": "test-project" }',
        'src/index.ts': 'export const x = 1;\n',
        'src/app.ts': 'console.log("hello");\nconsole.log("world");\n',
        'src/utils.js': 'module.exports = {};\n',
        'src/app.test.ts': 'test("works", () => {});\n',
        'config.json': '{}',
        'README.md': '# Test\n',
      });
    });

    it('should return correct projectName', () => {
      const profile = scanner.scan(tmpDir);
      expect(profile.projectName).toBe(path.basename(tmpDir));
    });

    it('should return resolved projectPath', () => {
      const profile = scanner.scan(tmpDir);
      expect(profile.projectPath).toBe(path.resolve(tmpDir));
    });

    it('should detect TypeScript as primary language', () => {
      const profile = scanner.scan(tmpDir);
      expect(profile.primaryLanguage).toBe('TypeScript');
    });

    it('should compute language stats sorted by file count', () => {
      const profile = scanner.scan(tmpDir);
      expect(profile.languages.length).toBeGreaterThanOrEqual(2);
      // TypeScript has 3 files (.ts + .test.ts), JS has 1
      const ts = profile.languages.find((l) => l.language === 'TypeScript');
      const js = profile.languages.find((l) => l.language === 'JavaScript');
      expect(ts).toBeDefined();
      expect(js).toBeDefined();
      expect(ts!.fileCount).toBe(3);
      expect(js!.fileCount).toBe(1);
      // First entry should be the most common
      expect(profile.languages[0].language).toBe('TypeScript');
    });

    it('should detect npm as build tool from package.json', () => {
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('npm');
    });

    it('should compute correct file stats', () => {
      const profile = scanner.scan(tmpDir);
      // Total files: package.json, index.ts, app.ts, utils.js, app.test.ts, config.json, README.md = 7
      expect(profile.fileStats.totalFiles).toBe(7);
      // Source files: index.ts, app.ts, utils.js = 3 (app.test.ts is a test file)
      expect(profile.fileStats.sourceFiles).toBe(3);
      // Test files: app.test.ts = 1
      expect(profile.fileStats.testFiles).toBe(1);
      // Config files: package.json, config.json = 2
      expect(profile.fileStats.configFiles).toBe(2);
      // Total lines > 0
      expect(profile.fileStats.totalLines).toBeGreaterThan(0);
    });

    it('should have percentage summing to ~100 for language stats', () => {
      const profile = scanner.scan(tmpDir);
      const totalPct = profile.languages.reduce((s, l) => s + l.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });
  });

  describe('scan() — build tool detection', () => {
    it('should detect yarn from yarn.lock', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'yarn.lock': '',
        'src/index.ts': '',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('yarn');
    });

    it('should detect pnpm from pnpm-lock.yaml', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'pnpm-lock.yaml': '',
        'src/index.ts': '',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('pnpm');
    });

    it('should detect pip from requirements.txt', () => {
      tmpDir = createTempProject({
        'requirements.txt': 'flask==2.0\n',
        'app.py': 'print("hello")\n',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('pip');
    });

    it('should detect poetry from poetry.lock + pyproject.toml', () => {
      tmpDir = createTempProject({
        'pyproject.toml': '[tool.poetry]\nname = "test"\n',
        'poetry.lock': '',
        'app.py': '',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('poetry');
    });

    it('should detect go-mod from go.mod', () => {
      tmpDir = createTempProject({
        'go.mod': 'module example.com/test\n',
        'main.go': 'package main\n',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('go-mod');
    });

    it('should detect maven from pom.xml', () => {
      tmpDir = createTempProject({
        'pom.xml': '<project></project>',
        'src/main/java/App.java': 'class App {}',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('maven');
    });

    it('should detect gradle from build.gradle', () => {
      tmpDir = createTempProject({
        'build.gradle': 'plugins { }',
        'src/main/java/App.java': 'class App {}',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('gradle');
    });

    it('should detect gradle from build.gradle.kts', () => {
      tmpDir = createTempProject({
        'build.gradle.kts': 'plugins { }',
        'src/main/java/App.java': 'class App {}',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('gradle');
    });

    it('should return unknown when no build config found', () => {
      tmpDir = createTempProject({
        'src/main.rs': 'fn main() {}',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.buildTool).toBe('unknown');
    });
  });

  describe('scan() — ignored directories', () => {
    it('should skip node_modules', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'src/index.ts': 'export {};\n',
        'node_modules/dep/index.js': 'module.exports = {};\n',
      });
      const profile = scanner.scan(tmpDir);
      // node_modules/dep/index.js should not be counted
      expect(profile.fileStats.totalFiles).toBe(2);
    });

    it('should skip .git directory', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'src/index.ts': '',
        '.git/config': '[core]',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.fileStats.totalFiles).toBe(2);
    });

    it('should skip __pycache__', () => {
      tmpDir = createTempProject({
        'requirements.txt': '',
        'app.py': 'print("hi")\n',
        '__pycache__/app.cpython-39.pyc': '',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.fileStats.totalFiles).toBe(2);
    });
  });

  describe('scan() — sub-module detection', () => {
    it('should detect sub-modules with their own build config', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'src/index.ts': '',
        'packages/frontend/package.json': '{}',
        'packages/frontend/src/App.tsx': 'export default function App() {}',
        'packages/backend/package.json': '{}',
        'packages/backend/src/server.ts': 'console.log("server")',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.modules.length).toBe(2);
      const names = profile.modules.map((m) => m.name).sort();
      expect(names).toEqual(['backend', 'frontend']);
      // Each sub-module should have a build tool
      for (const mod of profile.modules) {
        expect(mod.buildTool).toBe('npm');
      }
    });

    it('should detect language for each sub-module', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'services/api/package.json': '{}',
        'services/api/src/index.ts': '',
        'services/api/src/routes.ts': '',
        'services/worker/requirements.txt': '',
        'services/worker/main.py': '',
        'services/worker/utils.py': '',
      });
      const profile = scanner.scan(tmpDir);
      const api = profile.modules.find((m) => m.name === 'api');
      const worker = profile.modules.find((m) => m.name === 'worker');
      expect(api).toBeDefined();
      expect(worker).toBeDefined();
      expect(api!.language).toBe('TypeScript');
      expect(worker!.language).toBe('Python');
    });
  });

  describe('scan() — language detection', () => {
    it('should detect Python as primary for Python-only project', () => {
      tmpDir = createTempProject({
        'requirements.txt': '',
        'app.py': 'print("hello")\n',
        'utils.py': 'def foo(): pass\n',
        'tests/test_app.py': 'def test_foo(): pass\n',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.primaryLanguage).toBe('Python');
    });

    it('should detect Go as primary for Go project', () => {
      tmpDir = createTempProject({
        'go.mod': 'module test',
        'main.go': 'package main\nfunc main() {}\n',
        'handler.go': 'package main\n',
        'handler_test.go': 'package main\n',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.primaryLanguage).toBe('Go');
    });

    it('should throw EMPTY_PROJECT for project with no recognized source files', () => {
      tmpDir = createTempProject({
        'README.md': '# Hello',
        'data.csv': 'a,b,c',
      });
      expect(() => scanner.scan(tmpDir)).toThrowError(AnalysisException);
      try {
        scanner.scan(tmpDir);
      } catch (e) {
        const err = e as AnalysisException;
        expect(err.code).toBe('EMPTY_PROJECT');
      }
    });
  });

  describe('scan() — test file detection', () => {
    it('should recognize various test file patterns', () => {
      tmpDir = createTempProject({
        'package.json': '{}',
        'src/app.ts': '',
        'src/app.test.ts': '',
        'src/app.spec.ts': '',
        'src/app_test.go': '',
        'src/test_app.py': '',
        'src/AppTest.java': '',
      });
      const profile = scanner.scan(tmpDir);
      expect(profile.fileStats.testFiles).toBe(5);
      expect(profile.fileStats.sourceFiles).toBe(1); // only app.ts
    });
  });

  describe('scan() — path validation (INVALID_PATH)', () => {
    it('should throw INVALID_PATH for non-existent path', () => {
      const fakePath = path.join(os.tmpdir(), 'scanner-nonexistent-' + Date.now());
      expect(() => scanner.scan(fakePath)).toThrowError(AnalysisException);
      try {
        scanner.scan(fakePath);
      } catch (e) {
        const err = e as AnalysisException;
        expect(err.code).toBe('INVALID_PATH');
        expect(err.recoverable).toBe(false);
      }
    });

    it('should throw INVALID_PATH when path is a file, not a directory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-file-'));
      const filePath = path.join(tmpDir, 'somefile.txt');
      fs.writeFileSync(filePath, 'hello');
      expect(() => scanner.scan(filePath)).toThrowError(AnalysisException);
      try {
        scanner.scan(filePath);
      } catch (e) {
        const err = e as AnalysisException;
        expect(err.code).toBe('INVALID_PATH');
        expect(err.recoverable).toBe(false);
      }
    });
  });

  describe('scan() — empty project (EMPTY_PROJECT)', () => {
    it('should throw EMPTY_PROJECT for an empty directory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-empty-'));
      expect(() => scanner.scan(tmpDir)).toThrowError(AnalysisException);
      try {
        scanner.scan(tmpDir);
      } catch (e) {
        const err = e as AnalysisException;
        expect(err.code).toBe('EMPTY_PROJECT');
        expect(err.recoverable).toBe(false);
      }
    });

    it('should throw EMPTY_PROJECT for directory with only non-source files', () => {
      tmpDir = createTempProject({
        'README.md': '# Hello',
        'data.txt': 'some data',
        'notes.csv': 'a,b,c',
      });
      expect(() => scanner.scan(tmpDir)).toThrowError(AnalysisException);
      try {
        scanner.scan(tmpDir);
      } catch (e) {
        const err = e as AnalysisException;
        expect(err.code).toBe('EMPTY_PROJECT');
        expect(err.recoverable).toBe(false);
      }
    });
  });
});
