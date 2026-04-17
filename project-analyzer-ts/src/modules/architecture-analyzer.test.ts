import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ArchitectureAnalyzer } from './architecture-analyzer.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  Dependency,
  DependencyCategory,
  ArchitectureResult,
  SubModule,
} from '../models/index.js';

// ─── Helpers ───

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arch-test-'));
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

function makePlugin(deps: Dependency[]): LanguagePlugin {
  return {
    getLanguageId: () => 'typescript',
    parseFile: () => [],
    extractDependencies: () => deps,
    identifyApis: () => [],
    identifyModules: () => [],
  };
}

function dep(name: string, version: string, category: DependencyCategory): Dependency {
  return { name, version, category, scope: 'runtime' };
}

// ─── Tests ───

describe('ArchitectureAnalyzer', () => {
  const analyzer = new ArchitectureAnalyzer();

  it('getName returns "architecture"', () => {
    expect(analyzer.getName()).toBe('architecture');
  });

  describe('dependency collection and grouping', () => {
    it('collects dependencies from multiple plugins', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin1 = makePlugin([
          dep('express', '4.18.0', 'web-framework'),
          dep('lodash', '4.17.21', 'utility'),
        ]);
        const plugin2 = makePlugin([
          dep('flask', '2.3.0', 'web-framework'),
        ]);

        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin1, plugin2])) as ArchitectureResult;

        expect(result.dependencies).toHaveLength(3);
        expect(result.dependencies.map((d) => d.name).sort()).toEqual(['express', 'flask', 'lodash']);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('deduplicates identical dependencies across plugins', async () => {
      const tmpDir = makeTmpDir();
      try {
        const sharedDep = dep('express', '4.18.0', 'web-framework');
        const plugin1 = makePlugin([sharedDep]);
        const plugin2 = makePlugin([sharedDep]);

        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin1, plugin2])) as ArchitectureResult;

        expect(result.dependencies).toHaveLength(1);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('groups dependencies by category', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([
          dep('express', '4.18.0', 'web-framework'),
          dep('pg', '8.11.0', 'database'),
          dep('redis', '4.6.0', 'cache'),
          dep('jest', '29.0.0', 'testing'),
          dep('lodash', '4.17.21', 'utility'),
        ]);

        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        expect(result.dependencyGroups['web-framework']).toHaveLength(1);
        expect(result.dependencyGroups['database']).toHaveLength(1);
        expect(result.dependencyGroups['cache']).toHaveLength(1);
        expect(result.dependencyGroups['testing']).toHaveLength(1);
        expect(result.dependencyGroups['utility']).toHaveLength(1);
        expect(result.dependencyGroups['other']).toHaveLength(0);
      } finally {
        rmDir(tmpDir);
      }
    });

    it('returns empty groups when no plugins provided', async () => {
      const tmpDir = makeTmpDir();
      try {
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

        expect(result.dependencies).toHaveLength(0);
        // All category groups should exist but be empty
        for (const cat of ['web-framework', 'database', 'cache', 'message-queue', 'security', 'testing', 'logging', 'utility', 'other'] as DependencyCategory[]) {
          expect(result.dependencyGroups[cat]).toEqual([]);
        }
      } finally {
        rmDir(tmpDir);
      }
    });
  });

  describe('framework identification', () => {
    it('identifies Express framework', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([dep('express', '4.18.0', 'web-framework')]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        expect(result.frameworks).toHaveLength(1);
        expect(result.frameworks[0].name).toBe('Express');
        expect(result.frameworks[0].version).toBe('4.18.0');
        expect(result.frameworks[0].category).toBe('web');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('identifies React framework', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([dep('react', '18.2.0', 'web-framework')]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        const react = result.frameworks.find((f) => f.name === 'React');
        expect(react).toBeDefined();
        expect(react!.category).toBe('frontend');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('identifies Django framework from Python deps', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([dep('django', '4.2.0', 'web-framework')]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        const django = result.frameworks.find((f) => f.name === 'Django');
        expect(django).toBeDefined();
        expect(django!.category).toBe('web');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('identifies Gin framework from Go deps', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([dep('github.com/gin-gonic/gin', 'v1.9.1', 'web-framework')]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        const gin = result.frameworks.find((f) => f.name === 'Gin');
        expect(gin).toBeDefined();
        expect(gin!.category).toBe('web');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('identifies multiple frameworks', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([
          dep('express', '4.18.0', 'web-framework'),
          dep('react', '18.2.0', 'web-framework'),
          dep('typeorm', '0.3.17', 'database'),
          dep('vitest', '2.1.0', 'testing'),
        ]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        const names = result.frameworks.map((f) => f.name);
        expect(names).toContain('Express');
        expect(names).toContain('React');
        expect(names).toContain('TypeORM');
        expect(names).toContain('Vitest');
      } finally {
        rmDir(tmpDir);
      }
    });

    it('returns empty frameworks when no known deps', async () => {
      const tmpDir = makeTmpDir();
      try {
        const plugin = makePlugin([dep('my-custom-lib', '1.0.0', 'other')]);
        const profile = makeProfile(tmpDir);
        const result = (await analyzer.analyze(profile, [plugin])) as ArchitectureResult;

        expect(result.frameworks).toHaveLength(0);
      } finally {
        rmDir(tmpDir);
      }
    });
  });

  describe('layer identification', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
    });

    afterEach(() => {
      rmDir(tmpDir);
    });

    it('identifies controller layer', async () => {
      const ctrlDir = path.join(tmpDir, 'src', 'controllers');
      fs.mkdirSync(ctrlDir, { recursive: true });
      fs.writeFileSync(path.join(ctrlDir, 'user-controller.ts'), '// controller');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const ctrlLayer = result.layers.find((l) => l.name === 'Controller/Handler');
      expect(ctrlLayer).toBeDefined();
      expect(ctrlLayer!.files.length).toBeGreaterThan(0);
    });

    it('identifies service layer', async () => {
      const svcDir = path.join(tmpDir, 'src', 'services');
      fs.mkdirSync(svcDir, { recursive: true });
      fs.writeFileSync(path.join(svcDir, 'user-service.ts'), '// service');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const svcLayer = result.layers.find((l) => l.name === 'Service');
      expect(svcLayer).toBeDefined();
      expect(svcLayer!.files.length).toBeGreaterThan(0);
    });

    it('identifies repository/data layer', async () => {
      const repoDir = path.join(tmpDir, 'src', 'repositories');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'user-repo.ts'), '// repo');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const repoLayer = result.layers.find((l) => l.name === 'Repository/Data');
      expect(repoLayer).toBeDefined();
    });

    it('identifies utility layer', async () => {
      const utilDir = path.join(tmpDir, 'src', 'utils');
      fs.mkdirSync(utilDir, { recursive: true });
      fs.writeFileSync(path.join(utilDir, 'helpers.ts'), '// util');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const utilLayer = result.layers.find((l) => l.name === 'Utility');
      expect(utilLayer).toBeDefined();
    });

    it('identifies multiple layers', async () => {
      for (const dir of ['controllers', 'services', 'models', 'utils']) {
        const d = path.join(tmpDir, 'src', dir);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'index.ts'), '// file');
      }

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      expect(result.layers.length).toBeGreaterThanOrEqual(4);
    });

    it('returns empty layers when no matching dirs', async () => {
      // Just an empty project with src
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), '// entry');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      expect(result.layers).toHaveLength(0);
    });

    it('detects handler directories as Controller/Handler layer', async () => {
      const handlerDir = path.join(tmpDir, 'src', 'handlers');
      fs.mkdirSync(handlerDir, { recursive: true });
      fs.writeFileSync(path.join(handlerDir, 'auth-handler.ts'), '// handler');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const layer = result.layers.find((l) => l.name === 'Controller/Handler');
      expect(layer).toBeDefined();
      expect(layer!.classes).toContain('auth-handler');
    });

    it('detects route directories as Controller/Handler layer', async () => {
      const routeDir = path.join(tmpDir, 'src', 'routes');
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(path.join(routeDir, 'api.ts'), '// routes');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const layer = result.layers.find((l) => l.name === 'Controller/Handler');
      expect(layer).toBeDefined();
    });

    it('detects api directories as Controller/Handler layer', async () => {
      const apiDir = path.join(tmpDir, 'src', 'api');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(apiDir, 'users.ts'), '// api');

      const profile = makeProfile(tmpDir);
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const layer = result.layers.find((l) => l.name === 'Controller/Handler');
      expect(layer).toBeDefined();
    });
  });

  describe('module dependency graph', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
    });

    afterEach(() => {
      rmDir(tmpDir);
    });

    it('returns undefined when no sub-modules', async () => {
      const profile = makeProfile(tmpDir, { modules: [] });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;
      expect(result.moduleDependencyGraph).toBeUndefined();
    });

    it('returns undefined when only one sub-module', async () => {
      const modDir = path.join(tmpDir, 'mod-a');
      fs.mkdirSync(modDir, { recursive: true });
      fs.writeFileSync(path.join(modDir, 'package.json'), JSON.stringify({ name: 'mod-a' }));

      const modules: SubModule[] = [
        { name: 'mod-a', path: 'mod-a', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;
      expect(result.moduleDependencyGraph).toBeUndefined();
    });

    it('detects npm cross-module dependencies from package.json', async () => {
      // Create two npm sub-modules where mod-a depends on mod-b
      const modADir = path.join(tmpDir, 'packages', 'mod-a');
      const modBDir = path.join(tmpDir, 'packages', 'mod-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: 'mod-a', dependencies: { 'mod-b': '^1.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: 'mod-b' }),
      );

      const modules: SubModule[] = [
        { name: 'mod-a', path: 'packages/mod-a', language: 'typescript', buildTool: 'npm' },
        { name: 'mod-b', path: 'packages/mod-b', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      expect(result.moduleDependencyGraph).toBeDefined();
      const graph = result.moduleDependencyGraph!;
      expect(graph.nodes).toEqual(['mod-a', 'mod-b']);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: 'mod-a', to: 'mod-b', label: 'compile' });
      expect(graph.syntax).toContain('graph TD');
    });

    it('detects npm devDependencies as test scope', async () => {
      const modADir = path.join(tmpDir, 'packages', 'mod-a');
      const modBDir = path.join(tmpDir, 'packages', 'mod-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: 'mod-a', devDependencies: { 'mod-b': '^1.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: 'mod-b' }),
      );

      const modules: SubModule[] = [
        { name: 'mod-a', path: 'packages/mod-a', language: 'typescript', buildTool: 'npm' },
        { name: 'mod-b', path: 'packages/mod-b', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].label).toBe('test');
    });

    it('detects Go cross-module dependencies from go.mod', async () => {
      const modADir = path.join(tmpDir, 'svc-a');
      const modBDir = path.join(tmpDir, 'svc-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'go.mod'),
        'module example.com/svc-a\n\nrequire (\n\tsvc-b v0.1.0\n)\n',
      );
      fs.writeFileSync(
        path.join(modBDir, 'go.mod'),
        'module example.com/svc-b\n',
      );

      const modules: SubModule[] = [
        { name: 'svc-a', path: 'svc-a', language: 'go', buildTool: 'go-mod' },
        { name: 'svc-b', path: 'svc-b', language: 'go', buildTool: 'go-mod' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: 'svc-a', to: 'svc-b', label: 'compile' });
    });

    it('detects Python cross-module dependencies from imports', async () => {
      const modADir = path.join(tmpDir, 'pkg_a');
      const modBDir = path.join(tmpDir, 'pkg_b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'main.py'),
        'from pkg_b import utils\nimport os\n',
      );
      fs.writeFileSync(
        path.join(modBDir, 'utils.py'),
        'def helper(): pass\n',
      );

      const modules: SubModule[] = [
        { name: 'pkg_a', path: 'pkg_a', language: 'python', buildTool: 'pip' },
        { name: 'pkg_b', path: 'pkg_b', language: 'python', buildTool: 'pip' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]).toEqual({ from: 'pkg_a', to: 'pkg_b', label: 'runtime' });
    });

    it('generates valid Mermaid graph TD syntax', async () => {
      const modADir = path.join(tmpDir, 'packages', 'alpha');
      const modBDir = path.join(tmpDir, 'packages', 'beta');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: 'alpha', dependencies: { beta: '1.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: 'beta' }),
      );

      const modules: SubModule[] = [
        { name: 'alpha', path: 'packages/alpha', language: 'typescript', buildTool: 'npm' },
        { name: 'beta', path: 'packages/beta', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.syntax).toMatch(/^graph TD/);
      expect(graph.syntax).toContain('alpha["alpha"]');
      expect(graph.syntax).toContain('beta["beta"]');
      expect(graph.syntax).toContain('alpha -->|"compile"| beta');
    });

    it('handles modules with no cross-dependencies', async () => {
      const modADir = path.join(tmpDir, 'packages', 'mod-a');
      const modBDir = path.join(tmpDir, 'packages', 'mod-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: 'mod-a', dependencies: { lodash: '4.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: 'mod-b', dependencies: { express: '4.0.0' } }),
      );

      const modules: SubModule[] = [
        { name: 'mod-a', path: 'packages/mod-a', language: 'typescript', buildTool: 'npm' },
        { name: 'mod-b', path: 'packages/mod-b', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(0);
    });

    it('sanitizes special characters in module names for Mermaid IDs', async () => {
      const modADir = path.join(tmpDir, 'packages', '@scope-mod-a');
      const modBDir = path.join(tmpDir, 'packages', '@scope-mod-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: '@scope/mod-a', dependencies: { '@scope/mod-b': '1.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: '@scope/mod-b' }),
      );

      const modules: SubModule[] = [
        { name: '@scope/mod-a', path: 'packages/@scope-mod-a', language: 'typescript', buildTool: 'npm' },
        { name: '@scope/mod-b', path: 'packages/@scope-mod-b', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.edges).toHaveLength(1);
      // Mermaid node IDs should be sanitized, but labels keep original names
      expect(graph.syntax).toContain('_scope_mod_a');
      expect(graph.syntax).toContain('_scope_mod_b');
      // IDs (before the bracket) should not contain special chars
      const idPattern = /^\s+([a-zA-Z0-9_]+)\["/gm;
      const ids: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = idPattern.exec(graph.syntax)) !== null) {
        ids.push(match[1]);
      }
      for (const id of ids) {
        expect(id).toMatch(/^[a-zA-Z0-9_]+$/);
      }
    });

    it('detects bidirectional dependencies', async () => {
      const modADir = path.join(tmpDir, 'packages', 'mod-a');
      const modBDir = path.join(tmpDir, 'packages', 'mod-b');
      fs.mkdirSync(modADir, { recursive: true });
      fs.mkdirSync(modBDir, { recursive: true });

      fs.writeFileSync(
        path.join(modADir, 'package.json'),
        JSON.stringify({ name: 'mod-a', dependencies: { 'mod-b': '1.0.0' } }),
      );
      fs.writeFileSync(
        path.join(modBDir, 'package.json'),
        JSON.stringify({ name: 'mod-b', dependencies: { 'mod-a': '1.0.0' } }),
      );

      const modules: SubModule[] = [
        { name: 'mod-a', path: 'packages/mod-a', language: 'typescript', buildTool: 'npm' },
        { name: 'mod-b', path: 'packages/mod-b', language: 'typescript', buildTool: 'npm' },
      ];
      const profile = makeProfile(tmpDir, { modules });
      const result = (await analyzer.analyze(profile, [])) as ArchitectureResult;

      const graph = result.moduleDependencyGraph!;
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges).toContainEqual({ from: 'mod-a', to: 'mod-b', label: 'compile' });
      expect(graph.edges).toContainEqual({ from: 'mod-b', to: 'mod-a', label: 'compile' });
    });
  });
});
