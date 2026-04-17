import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GenericPlugin } from './generic-plugin.js';

describe('GenericPlugin', () => {
  let plugin: GenericPlugin;
  let tmpDir: string;

  beforeAll(() => {
    plugin = new GenericPlugin();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-plugin-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getLanguageId', () => {
    it('returns "generic"', () => {
      expect(plugin.getLanguageId()).toBe('generic');
    });
  });

  describe('parseFile', () => {
    it('extracts class declarations', () => {
      const filePath = path.join(tmpDir, 'classes.txt');
      fs.writeFileSync(filePath, 'class Foo {\n}\nexport class Bar {\n}\n');

      const nodes = plugin.parseFile(filePath);
      const classNodes = nodes.filter((n) => n.type === 'class');
      expect(classNodes).toHaveLength(2);
      expect(classNodes[0].name).toBe('Foo');
      expect(classNodes[1].name).toBe('Bar');
    });

    it('extracts function declarations from multiple languages', () => {
      const filePath = path.join(tmpDir, 'funcs.txt');
      fs.writeFileSync(
        filePath,
        [
          'function hello() {}',
          'def greet():',
          'func main() {',
          'async function fetchData() {}',
        ].join('\n'),
      );

      const nodes = plugin.parseFile(filePath);
      const funcNodes = nodes.filter((n) => n.type === 'function');
      expect(funcNodes).toHaveLength(4);
      expect(funcNodes.map((n) => n.name)).toEqual([
        'hello', 'greet', 'main', 'fetchData',
      ]);
    });

    it('returns a module node when no constructs found', () => {
      const filePath = path.join(tmpDir, 'plain.txt');
      fs.writeFileSync(filePath, 'just some text\nno code here\n');

      const nodes = plugin.parseFile(filePath);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('module');
      expect(nodes[0].name).toBe('plain.txt');
    });

    it('returns empty array for non-existent file', () => {
      const nodes = plugin.parseFile(path.join(tmpDir, 'nope.txt'));
      expect(nodes).toEqual([]);
    });

    it('sets correct startLine for each node', () => {
      const filePath = path.join(tmpDir, 'lines.txt');
      fs.writeFileSync(filePath, 'line1\nclass A {\n}\nfunction b() {}\n');

      const nodes = plugin.parseFile(filePath);
      const classNode = nodes.find((n) => n.name === 'A');
      const funcNode = nodes.find((n) => n.name === 'b');
      expect(classNode?.startLine).toBe(2);
      expect(funcNode?.startLine).toBe(4);
    });
  });

  describe('extractDependencies', () => {
    it('returns empty array', () => {
      expect(plugin.extractDependencies(tmpDir)).toEqual([]);
    });
  });

  describe('identifyApis', () => {
    it('returns empty array', () => {
      const filePath = path.join(tmpDir, 'api.txt');
      fs.writeFileSync(filePath, 'app.get("/hello")');
      expect(plugin.identifyApis(filePath)).toEqual([]);
    });
  });

  describe('identifyModules', () => {
    it('identifies top-level directories as modules', () => {
      const projDir = path.join(tmpDir, 'proj');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'src'));
      fs.mkdirSync(path.join(projDir, 'lib'));
      fs.writeFileSync(path.join(projDir, 'src', 'main.ts'), '');
      fs.writeFileSync(path.join(projDir, 'README.md'), '');

      const modules = plugin.identifyModules(projDir);
      const names = modules.map((m) => m.name).sort();
      expect(names).toEqual(['lib', 'src']);
    });

    it('skips ignored directories', () => {
      const projDir = path.join(tmpDir, 'proj2');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'node_modules'));
      fs.mkdirSync(path.join(projDir, 'dist'));
      fs.mkdirSync(path.join(projDir, '.git'));
      fs.mkdirSync(path.join(projDir, 'app'));

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('app');
    });

    it('marks modules as inferred', () => {
      const projDir = path.join(tmpDir, 'proj3');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'core'));

      const modules = plugin.identifyModules(projDir);
      expect(modules[0].isInferred).toBe(true);
    });

    it('lists key files in module directory', () => {
      const projDir = path.join(tmpDir, 'proj4');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'utils'));
      fs.writeFileSync(path.join(projDir, 'utils', 'helper.ts'), '');
      fs.writeFileSync(path.join(projDir, 'utils', 'format.ts'), '');

      const modules = plugin.identifyModules(projDir);
      expect(modules[0].keyFiles).toHaveLength(2);
    });

    it('returns empty array for non-existent directory', () => {
      expect(plugin.identifyModules('/nonexistent/path')).toEqual([]);
    });
  });
});
