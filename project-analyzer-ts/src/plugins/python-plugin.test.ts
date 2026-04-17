import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PythonPlugin } from './python-plugin.js';

describe('PythonPlugin', () => {
  let plugin: PythonPlugin;
  let tmpDir: string;

  beforeAll(() => {
    plugin = new PythonPlugin();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'py-plugin-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getLanguageId', () => {
    it('returns "python"', () => {
      expect(plugin.getLanguageId()).toBe('python');
    });
  });

  describe('parseFile', () => {
    it('extracts class declarations with base classes', () => {
      const filePath = path.join(tmpDir, 'classes.py');
      fs.writeFileSync(filePath, [
        'class UserService(BaseService, Mixin):',
        '    pass',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('UserService');
      expect(cls!.superClass).toBe('BaseService');
      expect(cls!.interfaces).toEqual(['Mixin']);
    });

    it('extracts class with no base classes', () => {
      const filePath = path.join(tmpDir, 'simple_class.py');
      fs.writeFileSync(filePath, [
        'class Config:',
        '    DEBUG = True',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('Config');
      expect(cls!.superClass).toBeUndefined();
    });

    it('extracts function declarations', () => {
      const filePath = path.join(tmpDir, 'funcs.py');
      fs.writeFileSync(filePath, [
        'def hello(name: str) -> str:',
        '    return f"Hello {name}"',
        '',
        'async def fetch_data(url: str) -> dict:',
        '    pass',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const funcs = nodes.filter((n) => n.type === 'function');
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('hello');
      expect(funcs[0].returnType).toBe('str');
      expect(funcs[0].parameters).toHaveLength(1);
      expect(funcs[0].parameters![0].name).toBe('name');
      expect(funcs[1].name).toBe('fetch_data');
      expect(funcs[1].modifiers).toContain('async');
    });

    it('extracts class methods and constructor', () => {
      const filePath = path.join(tmpDir, 'methods.py');
      fs.writeFileSync(filePath, [
        'class UserController:',
        '    def __init__(self, service):',
        '        self.service = service',
        '',
        '    async def get_user(self, user_id: int) -> dict:',
        '        return self.service.find(user_id)',
        '',
        '    def _validate(self, data):',
        '        return True',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      const children = cls!.children;
      const ctor = children.find((c) => c.type === 'constructor');
      expect(ctor).toBeDefined();
      expect(ctor!.name).toBe('__init__');
      const methods = children.filter((c) => c.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].name).toBe('get_user');
      expect(methods[0].modifiers).toContain('async');
      expect(methods[1].name).toBe('_validate');
      expect(methods[1].modifiers).toContain('private');
    });

    it('extracts decorators', () => {
      const filePath = path.join(tmpDir, 'decorators.py');
      fs.writeFileSync(filePath, [
        '@app.route("/users")',
        'def list_users():',
        '    pass',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const fn = nodes.find((n) => n.type === 'function');
      expect(fn).toBeDefined();
      expect(fn!.annotations).toHaveLength(1);
      expect(fn!.annotations[0].name).toBe('app.route');
    });

    it('extracts staticmethod and classmethod decorators', () => {
      const filePath = path.join(tmpDir, 'static.py');
      fs.writeFileSync(filePath, [
        'class Utils:',
        '    @staticmethod',
        '    def helper(x: int) -> int:',
        '        return x + 1',
        '',
        '    @classmethod',
        '    def create(cls, data: dict):',
        '        return cls(data)',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      const methods = cls!.children.filter((c) => c.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].modifiers).toContain('static');
      expect(methods[1].modifiers).toContain('classmethod');
    });

    it('extracts class-level fields', () => {
      const filePath = path.join(tmpDir, 'fields.py');
      fs.writeFileSync(filePath, [
        'class Config:',
        '    DEBUG = True',
        '    SECRET_KEY = "abc"',
        '    PORT: int = 8080',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      const fields = cls!.children.filter((c) => c.type === 'field');
      expect(fields).toHaveLength(3);
      expect(fields.map((f) => f.name)).toEqual(['DEBUG', 'SECRET_KEY', 'PORT']);
    });

    it('filters out self and cls from parameters', () => {
      const filePath = path.join(tmpDir, 'params.py');
      fs.writeFileSync(filePath, [
        'class Foo:',
        '    def bar(self, x: int, y: str) -> None:',
        '        pass',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      const method = cls!.children.find((c) => c.name === 'bar');
      expect(method!.parameters).toHaveLength(2);
      expect(method!.parameters![0].name).toBe('x');
      expect(method!.parameters![1].name).toBe('y');
    });

    it('returns module node for files with no constructs', () => {
      const filePath = path.join(tmpDir, 'plain.py');
      fs.writeFileSync(filePath, '# just a comment\nprint("hi")\n');

      const nodes = plugin.parseFile(filePath);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('module');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.parseFile('/nonexistent/file.py')).toEqual([]);
    });
  });

  describe('extractDependencies', () => {
    it('extracts dependencies from requirements.txt', () => {
      const projDir = path.join(tmpDir, 'req-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'requirements.txt'), [
        'flask>=2.0.0',
        'sqlalchemy==1.4.0',
        'pytest>=7.0',
        '# this is a comment',
        '',
        'redis~=4.0',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(4);

      const flask = deps.find((d) => d.name === 'flask');
      expect(flask).toBeDefined();
      expect(flask!.category).toBe('web-framework');

      const sqlalchemy = deps.find((d) => d.name === 'sqlalchemy');
      expect(sqlalchemy!.category).toBe('database');

      const pytestDep = deps.find((d) => d.name === 'pytest');
      expect(pytestDep!.category).toBe('testing');

      const redisDep = deps.find((d) => d.name === 'redis');
      expect(redisDep!.category).toBe('cache');
    });

    it('extracts dependencies from setup.py', () => {
      const projDir = path.join(tmpDir, 'setup-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'setup.py'), [
        'from setuptools import setup',
        'setup(',
        '    name="myapp",',
        '    install_requires=[',
        '        "django>=4.0",',
        '        "celery>=5.0",',
        '    ],',
        ')',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(2);
      expect(deps.find((d) => d.name === 'django')!.category).toBe('web-framework');
      expect(deps.find((d) => d.name === 'celery')!.category).toBe('message-queue');
    });

    it('extracts dependencies from pyproject.toml', () => {
      const projDir = path.join(tmpDir, 'pyproject-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'pyproject.toml'), [
        '[project]',
        'name = "myapp"',
        'dependencies = [',
        '    "fastapi>=0.100",',
        '    "pyjwt>=2.0",',
        ']',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(2);
      expect(deps.find((d) => d.name === 'fastapi')!.category).toBe('web-framework');
      expect(deps.find((d) => d.name === 'pyjwt')!.category).toBe('security');
    });

    it('deduplicates across files', () => {
      const projDir = path.join(tmpDir, 'dedup-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'requirements.txt'), 'flask>=2.0\n');
      fs.writeFileSync(path.join(projDir, 'setup.py'), [
        'setup(install_requires=["flask>=2.0"])',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      const flaskDeps = deps.filter((d) => d.name === 'flask');
      expect(flaskDeps).toHaveLength(1);
    });

    it('returns empty array when no dependency files exist', () => {
      const projDir = path.join(tmpDir, 'no-deps');
      fs.mkdirSync(projDir);
      expect(plugin.extractDependencies(projDir)).toEqual([]);
    });

    it('handles extras in requirements.txt', () => {
      const projDir = path.join(tmpDir, 'extras-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'requirements.txt'), 'celery[redis]>=5.0\n');

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('celery');
    });
  });

  describe('identifyApis', () => {
    it('identifies Flask app.route decorators', () => {
      const filePath = path.join(tmpDir, 'flask_app.py');
      fs.writeFileSync(filePath, [
        'from flask import Flask',
        'app = Flask(__name__)',
        '',
        '@app.route("/users", methods=[\'GET\'])',
        'def list_users():',
        '    return []',
        '',
        '@app.route("/users", methods=[\'POST\'])',
        'def create_user():',
        '    return {}',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].method).toBe('GET');
      expect(apis[0].path).toBe('/users');
      expect(apis[0].handlerMethod).toBe('list_users');
      expect(apis[1].method).toBe('POST');
      expect(apis[1].handlerMethod).toBe('create_user');
    });

    it('defaults to GET when no methods specified', () => {
      const filePath = path.join(tmpDir, 'flask_default.py');
      fs.writeFileSync(filePath, [
        '@app.route("/health")',
        'def health():',
        '    return "ok"',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].method).toBe('GET');
      expect(apis[0].handlerMethod).toBe('health');
    });

    it('identifies Flask blueprint routes', () => {
      const filePath = path.join(tmpDir, 'blueprint.py');
      fs.writeFileSync(filePath, [
        'from flask import Blueprint',
        'bp = Blueprint("users", __name__)',
        '',
        '@bp.route("/items/<int:item_id>")',
        'def get_item(item_id):',
        '    pass',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].handlerClass).toBe('bp');
      expect(apis[0].path).toBe('/items/<int:item_id>');
      expect(apis[0].parameters).toHaveLength(1);
      expect(apis[0].parameters[0].name).toBe('item_id');
      expect(apis[0].parameters[0].type).toBe('int');
    });

    it('extracts Flask path parameters', () => {
      const filePath = path.join(tmpDir, 'flask_params.py');
      fs.writeFileSync(filePath, [
        '@app.route("/users/<user_id>/posts/<int:post_id>")',
        'def get_post(user_id, post_id):',
        '    pass',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].parameters).toHaveLength(2);
      expect(apis[0].parameters[0].name).toBe('user_id');
      expect(apis[0].parameters[0].type).toBe('string');
      expect(apis[0].parameters[1].name).toBe('post_id');
      expect(apis[0].parameters[1].type).toBe('int');
    });

    it('identifies Django path() patterns', () => {
      const filePath = path.join(tmpDir, 'urls.py');
      fs.writeFileSync(filePath, [
        'from django.urls import path',
        'urlpatterns = [',
        '    path("users/", views.list_users),',
        '    path("users/<int:pk>/", views.user_detail),',
        ']',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].path).toBe('users/');
      expect(apis[0].handlerMethod).toBe('list_users');
      expect(apis[0].handlerClass).toBe('urlpatterns');
      expect(apis[1].path).toBe('users/<int:pk>/');
      expect(apis[1].parameters).toHaveLength(1);
      expect(apis[1].parameters[0].name).toBe('pk');
      expect(apis[1].parameters[0].type).toBe('int');
    });

    it('identifies Django url() with regex patterns', () => {
      const filePath = path.join(tmpDir, 'urls_regex.py');
      fs.writeFileSync(filePath, [
        'from django.conf.urls import url',
        'urlpatterns = [',
        '    url(r"^users/(?P<user_id>\\d+)/$", views.user_detail),',
        ']',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(1);
      expect(apis[0].parameters).toHaveLength(1);
      expect(apis[0].parameters[0].name).toBe('user_id');
    });

    it('identifies multiple methods in Flask route', () => {
      const filePath = path.join(tmpDir, 'multi_method.py');
      fs.writeFileSync(filePath, [
        '@app.route("/resource", methods=[\'GET\', \'POST\'])',
        'def resource():',
        '    pass',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].method).toBe('GET');
      expect(apis[1].method).toBe('POST');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.identifyApis('/nonexistent/file.py')).toEqual([]);
    });

    it('returns empty array for file with no routes', () => {
      const filePath = path.join(tmpDir, 'no_routes.py');
      fs.writeFileSync(filePath, 'x = 1\n');
      expect(plugin.identifyApis(filePath)).toEqual([]);
    });
  });

  describe('identifyModules', () => {
    it('identifies Python packages with __init__.py', () => {
      const projDir = path.join(tmpDir, 'py-proj');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'myapp'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'myapp', '__init__.py'), '');
      fs.writeFileSync(path.join(projDir, 'myapp', 'models.py'), '');
      fs.mkdirSync(path.join(projDir, 'utils'));
      fs.writeFileSync(path.join(projDir, 'utils', '__init__.py'), '');

      const modules = plugin.identifyModules(projDir);
      const names = modules.map((m) => m.name).sort();
      expect(names).toEqual(['myapp', 'utils']);
      expect(modules[0].isInferred).toBe(true);
    });

    it('skips directories without __init__.py', () => {
      const projDir = path.join(tmpDir, 'py-proj2');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, 'scripts'));
      fs.writeFileSync(path.join(projDir, 'scripts', 'run.py'), '');
      // No __init__.py

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(0);
    });

    it('skips ignored directories', () => {
      const projDir = path.join(tmpDir, 'py-proj3');
      fs.mkdirSync(projDir);
      fs.mkdirSync(path.join(projDir, '__pycache__'));
      fs.writeFileSync(path.join(projDir, '__pycache__', '__init__.py'), '');
      fs.mkdirSync(path.join(projDir, 'venv'));
      fs.writeFileSync(path.join(projDir, 'venv', '__init__.py'), '');
      fs.mkdirSync(path.join(projDir, 'core'));
      fs.writeFileSync(path.join(projDir, 'core', '__init__.py'), '');

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('core');
    });

    it('identifies packages inside src directory', () => {
      const projDir = path.join(tmpDir, 'py-proj4');
      fs.mkdirSync(path.join(projDir, 'src', 'mylib'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'src', 'mylib', '__init__.py'), '');
      fs.writeFileSync(path.join(projDir, 'src', 'mylib', 'core.py'), '');

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('mylib');
    });

    it('lists .py files as key files', () => {
      const projDir = path.join(tmpDir, 'py-proj5');
      fs.mkdirSync(path.join(projDir, 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'pkg', '__init__.py'), '');
      fs.writeFileSync(path.join(projDir, 'pkg', 'main.py'), '');
      fs.writeFileSync(path.join(projDir, 'pkg', 'utils.py'), '');

      const modules = plugin.identifyModules(projDir);
      expect(modules[0].keyFiles).toHaveLength(3);
    });

    it('returns empty array for non-existent directory', () => {
      expect(plugin.identifyModules('/nonexistent/path')).toEqual([]);
    });
  });
});
