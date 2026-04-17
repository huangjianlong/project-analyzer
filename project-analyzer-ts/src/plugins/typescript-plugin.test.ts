import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TypeScriptPlugin } from './typescript-plugin.js';

describe('TypeScriptPlugin', () => {
  let plugin: TypeScriptPlugin;
  let tmpDir: string;

  beforeAll(() => {
    plugin = new TypeScriptPlugin();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-plugin-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getLanguageId', () => {
    it('returns "typescript"', () => {
      expect(plugin.getLanguageId()).toBe('typescript');
    });
  });

  describe('parseFile', () => {
    it('extracts class declarations with extends and implements', () => {
      const filePath = path.join(tmpDir, 'classes.ts');
      fs.writeFileSync(filePath, [
        'export class Foo extends Bar implements Baz, Qux {',
        '  name: string;',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('Foo');
      expect(cls!.superClass).toBe('Bar');
      expect(cls!.interfaces).toEqual(['Baz', 'Qux']);
      expect(cls!.modifiers).toContain('export');
    });

    it('extracts function declarations', () => {
      const filePath = path.join(tmpDir, 'funcs.ts');
      fs.writeFileSync(filePath, [
        'function hello(name: string): void {',
        '  console.log(name);',
        '}',
        'export async function fetchData(url: string) {',
        '  return fetch(url);',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const funcs = nodes.filter((n) => n.type === 'function');
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('hello');
      expect(funcs[0].modifiers).toEqual([]);
      expect(funcs[1].name).toBe('fetchData');
      expect(funcs[1].modifiers).toContain('export');
      expect(funcs[1].modifiers).toContain('async');
    });

    it('extracts arrow function declarations', () => {
      const filePath = path.join(tmpDir, 'arrow.ts');
      fs.writeFileSync(filePath, [
        'export const greet = (name: string) => {',
        '  return `Hello ${name}`;',
        '};',
        'const add = function(a: number, b: number) {',
        '  return a + b;',
        '};',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const funcs = nodes.filter((n) => n.type === 'function');
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('greet');
      expect(funcs[1].name).toBe('add');
    });

    it('extracts interface declarations with members', () => {
      const filePath = path.join(tmpDir, 'iface.ts');
      fs.writeFileSync(filePath, [
        'export interface UserService extends BaseService {',
        '  getUser(id: string): User;',
        '  name: string;',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const iface = nodes.find((n) => n.type === 'interface' && n.name === 'UserService');
      expect(iface).toBeDefined();
      expect(iface!.interfaces).toEqual(['BaseService']);
      expect(iface!.children.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts type alias declarations', () => {
      const filePath = path.join(tmpDir, 'types.ts');
      fs.writeFileSync(filePath, [
        'export type Status = "active" | "inactive";',
        'type UserId = string;',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const types = nodes.filter((n) => n.name === 'Status' || n.name === 'UserId');
      expect(types).toHaveLength(2);
    });

    it('extracts enum declarations', () => {
      const filePath = path.join(tmpDir, 'enums.ts');
      fs.writeFileSync(filePath, [
        'export enum Color {',
        '  Red,',
        '  Green,',
        '  Blue,',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const enumNode = nodes.find((n) => n.type === 'enum');
      expect(enumNode).toBeDefined();
      expect(enumNode!.name).toBe('Color');
    });

    it('extracts class methods and constructor', () => {
      const filePath = path.join(tmpDir, 'class-members.ts');
      fs.writeFileSync(filePath, [
        'class UserController {',
        '  constructor(private service: UserService) {}',
        '  async getUser(id: string): Promise<User> {',
        '    return this.service.find(id);',
        '  }',
        '  private validate(data: unknown) {',
        '    return true;',
        '  }',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      const children = cls!.children;
      const ctor = children.find((c) => c.type === 'constructor');
      expect(ctor).toBeDefined();
      const methods = children.filter((c) => c.type === 'method');
      expect(methods.length).toBeGreaterThanOrEqual(2);
      expect(methods.map((m) => m.name)).toContain('getUser');
      expect(methods.map((m) => m.name)).toContain('validate');
    });

    it('extracts decorators', () => {
      const filePath = path.join(tmpDir, 'decorators.ts');
      fs.writeFileSync(filePath, [
        '@Controller("/users")',
        'class UserController {',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.annotations.length).toBe(1);
      expect(cls!.annotations[0].name).toBe('Controller');
    });

    it('returns module node for files with no constructs', () => {
      const filePath = path.join(tmpDir, 'plain.ts');
      fs.writeFileSync(filePath, '// just a comment\nconsole.log("hi");\n');

      const nodes = plugin.parseFile(filePath);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('module');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.parseFile('/nonexistent/file.ts')).toEqual([]);
    });

    it('sets correct line numbers', () => {
      const filePath = path.join(tmpDir, 'lines.ts');
      fs.writeFileSync(filePath, [
        '// header comment',
        '',
        'function first() {',
        '  return 1;',
        '}',
        '',
        'function second() {',
        '  return 2;',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      expect(nodes[0].startLine).toBe(3);
      expect(nodes[1].startLine).toBe(7);
    });

    it('extracts abstract class', () => {
      const filePath = path.join(tmpDir, 'abstract.ts');
      fs.writeFileSync(filePath, [
        'export abstract class BaseService {',
        '  abstract process(): void;',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('BaseService');
      expect(cls!.modifiers).toContain('abstract');
      expect(cls!.modifiers).toContain('export');
    });

    it('handles export default function', () => {
      const filePath = path.join(tmpDir, 'default-fn.ts');
      fs.writeFileSync(filePath, [
        'export default function handler(req: Request) {',
        '  return new Response("ok");',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const fn = nodes.find((n) => n.type === 'function');
      expect(fn).toBeDefined();
      expect(fn!.name).toBe('handler');
      expect(fn!.modifiers).toContain('export');
      expect(fn!.modifiers).toContain('default');
    });
  });

  describe('extractDependencies', () => {
    it('extracts dependencies from package.json', () => {
      const projDir = path.join(tmpDir, 'dep-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
        dependencies: {
          express: '^4.18.0',
          mongoose: '^7.0.0',
        },
        devDependencies: {
          vitest: '^2.0.0',
          typescript: '^5.0.0',
        },
      }));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(4);

      const express = deps.find((d) => d.name === 'express');
      expect(express).toBeDefined();
      expect(express!.category).toBe('web-framework');
      expect(express!.scope).toBe('runtime');

      const mongoose = deps.find((d) => d.name === 'mongoose');
      expect(mongoose!.category).toBe('database');

      const vitest = deps.find((d) => d.name === 'vitest');
      expect(vitest!.category).toBe('testing');
      expect(vitest!.scope).toBe('test');
    });

    it('categorizes peer dependencies as provided scope', () => {
      const projDir = path.join(tmpDir, 'peer-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'package.json'), JSON.stringify({
        peerDependencies: {
          react: '^18.0.0',
        },
      }));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(1);
      expect(deps[0].scope).toBe('provided');
      expect(deps[0].category).toBe('web-framework');
    });

    it('returns empty array when no package.json', () => {
      const projDir = path.join(tmpDir, 'no-pkg');
      fs.mkdirSync(projDir);
      expect(plugin.extractDependencies(projDir)).toEqual([]);
    });

    it('returns empty array for invalid JSON', () => {
      const projDir = path.join(tmpDir, 'bad-json');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'package.json'), 'not json');
      expect(plugin.extractDependencies(projDir)).toEqual([]);
    });
  });

  describe('identifyApis', () => {
    it('identifies Express app routes', () => {
      const filePath = path.join(tmpDir, 'app-routes.ts');
      fs.writeFileSync(filePath, [
        'import express from "express";',
        'const app = express();',
        'app.get("/users", listUsers);',
        'app.post("/users", createUser);',
        'app.put("/users/:id", updateUser);',
        'app.delete("/users/:id", deleteUser);',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(4);

      expect(apis[0].method).toBe('GET');
      expect(apis[0].path).toBe('/users');
      expect(apis[0].handlerMethod).toBe('listUsers');

      expect(apis[1].method).toBe('POST');
      expect(apis[1].path).toBe('/users');
      expect(apis[1].handlerMethod).toBe('createUser');

      expect(apis[2].method).toBe('PUT');
      expect(apis[2].path).toBe('/users/:id');
      expect(apis[2].parameters).toHaveLength(1);
      expect(apis[2].parameters[0].name).toBe('id');
      expect(apis[2].parameters[0].in).toBe('path');

      expect(apis[3].method).toBe('DELETE');
    });

    it('identifies Express router routes', () => {
      const filePath = path.join(tmpDir, 'router-routes.ts');
      fs.writeFileSync(filePath, [
        'import { Router } from "express";',
        'const router = Router();',
        'router.get("/items", getItems);',
        'router.post("/items", addItem);',
        'router.patch("/items/:id", patchItem);',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(3);
      expect(apis[0].handlerClass).toBe('router');
      expect(apis[2].method).toBe('PATCH');
    });

    it('extracts path parameters from routes', () => {
      const filePath = path.join(tmpDir, 'params.ts');
      fs.writeFileSync(filePath, [
        'app.get("/users/:userId/posts/:postId", getPost);',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].parameters).toHaveLength(2);
      expect(apis[0].parameters[0].name).toBe('userId');
      expect(apis[0].parameters[1].name).toBe('postId');
    });

    it('handles anonymous handlers', () => {
      const filePath = path.join(tmpDir, 'anon.ts');
      fs.writeFileSync(filePath, [
        'app.get("/health", (req, res) => res.send("ok"));',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].handlerMethod).toBe('anonymous');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.identifyApis('/nonexistent/file.ts')).toEqual([]);
    });

    it('returns empty array for file with no routes', () => {
      const filePath = path.join(tmpDir, 'no-routes.ts');
      fs.writeFileSync(filePath, 'const x = 1;\n');
      expect(plugin.identifyApis(filePath)).toEqual([]);
    });
  });

  describe('identifyModules', () => {
    it('identifies modules from src subdirectories', () => {
      const projDir = path.join(tmpDir, 'mod-proj');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'src'));
      fs.mkdirSync(path.join(projDir, 'src', 'controllers'));
      fs.mkdirSync(path.join(projDir, 'src', 'services'));
      fs.writeFileSync(path.join(projDir, 'src', 'controllers', 'user.ts'), '');
      fs.writeFileSync(path.join(projDir, 'src', 'services', 'auth.ts'), '');

      const modules = plugin.identifyModules(projDir);
      const names = modules.map((m) => m.name).sort();
      expect(names).toEqual(['controllers', 'services']);
      expect(modules[0].isInferred).toBe(true);
    });

    it('skips ignored directories within src', () => {
      const projDir = path.join(tmpDir, 'mod-proj2');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'src'));
      fs.mkdirSync(path.join(projDir, 'src', 'utils'));
      fs.mkdirSync(path.join(projDir, 'src', 'node_modules'));
      fs.mkdirSync(path.join(projDir, 'src', '__tests__'));

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('utils');
    });

    it('falls back to top-level dirs when no src/lib found', () => {
      const projDir = path.join(tmpDir, 'mod-proj3');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'controllers'));
      fs.mkdirSync(path.join(projDir, 'models'));

      const modules = plugin.identifyModules(projDir);
      const names = modules.map((m) => m.name).sort();
      expect(names).toEqual(['controllers', 'models']);
    });

    it('lists key files in module directories', () => {
      const projDir = path.join(tmpDir, 'mod-proj4');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'src'));
      fs.mkdirSync(path.join(projDir, 'src', 'utils'));
      fs.writeFileSync(path.join(projDir, 'src', 'utils', 'helper.ts'), '');
      fs.writeFileSync(path.join(projDir, 'src', 'utils', 'format.ts'), '');

      const modules = plugin.identifyModules(projDir);
      expect(modules[0].keyFiles).toHaveLength(2);
    });

    it('returns empty array for non-existent directory', () => {
      expect(plugin.identifyModules('/nonexistent/path')).toEqual([]);
    });
  });
});
