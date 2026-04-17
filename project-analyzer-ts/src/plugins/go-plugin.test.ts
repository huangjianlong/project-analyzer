import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GoPlugin } from './go-plugin.js';

describe('GoPlugin', () => {
  let plugin: GoPlugin;
  let tmpDir: string;

  beforeAll(() => {
    plugin = new GoPlugin();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-plugin-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getLanguageId', () => {
    it('returns "go"', () => {
      expect(plugin.getLanguageId()).toBe('go');
    });
  });

  describe('parseFile', () => {
    it('extracts package declaration', () => {
      const filePath = path.join(tmpDir, 'pkg.go');
      fs.writeFileSync(filePath, 'package main\n');

      const nodes = plugin.parseFile(filePath);
      const pkg = nodes.find((n) => n.type === 'namespace');
      expect(pkg).toBeDefined();
      expect(pkg!.name).toBe('main');
    });

    it('extracts struct declarations with fields', () => {
      const filePath = path.join(tmpDir, 'structs.go');
      fs.writeFileSync(filePath, [
        'package models',
        '',
        'type User struct {',
        '    ID   int    `json:"id"`',
        '    Name string `json:"name"`',
        '    age  int',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      expect(cls).toBeDefined();
      expect(cls!.name).toBe('User');
      expect(cls!.modifiers).toContain('export');

      const fields = cls!.children.filter((c) => c.type === 'field');
      expect(fields).toHaveLength(3);
      expect(fields[0].name).toBe('ID');
      expect(fields[0].modifiers).toContain('export');
      expect(fields[0].annotations).toHaveLength(1);
      expect(fields[0].annotations[0].name).toBe('json');
      expect(fields[2].name).toBe('age');
      expect(fields[2].modifiers).toContain('private');
    });

    it('extracts interface declarations with methods', () => {
      const filePath = path.join(tmpDir, 'iface.go');
      fs.writeFileSync(filePath, [
        'package service',
        '',
        'type UserRepository interface {',
        '    FindByID(id int) (*User, error)',
        '    Save(user *User) error',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const iface = nodes.find((n) => n.type === 'interface');
      expect(iface).toBeDefined();
      expect(iface!.name).toBe('UserRepository');

      const methods = iface!.children.filter((c) => c.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].name).toBe('FindByID');
      expect(methods[1].name).toBe('Save');
    });

    it('extracts function declarations', () => {
      const filePath = path.join(tmpDir, 'funcs.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func main() {',
        '    fmt.Println("hello")',
        '}',
        '',
        'func Add(a int, b int) int {',
        '    return a + b',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const funcs = nodes.filter((n) => n.type === 'function');
      expect(funcs).toHaveLength(2);
      expect(funcs[0].name).toBe('main');
      expect(funcs[0].modifiers).toContain('private');
      expect(funcs[1].name).toBe('Add');
      expect(funcs[1].modifiers).toContain('export');
      expect(funcs[1].returnType).toBe('int');
      expect(funcs[1].parameters).toHaveLength(2);
    });

    it('extracts method declarations with receiver', () => {
      const filePath = path.join(tmpDir, 'methods.go');
      fs.writeFileSync(filePath, [
        'package service',
        '',
        'func (s *UserService) GetUser(id int) (*User, error) {',
        '    return s.repo.FindByID(id)',
        '}',
        '',
        'func (s *UserService) createUser(name string) error {',
        '    return nil',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const methods = nodes.filter((n) => n.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0].name).toBe('GetUser');
      expect(methods[0].superClass).toBe('UserService');
      expect(methods[0].modifiers).toContain('export');
      expect(methods[0].annotations[0].name).toBe('receiver');
      expect(methods[0].annotations[0].attributes.type).toBe('UserService');
      expect(methods[0].returnType).toBe('*User, error');
      expect(methods[1].name).toBe('createUser');
      expect(methods[1].modifiers).toContain('private');
    });

    it('extracts import blocks', () => {
      const filePath = path.join(tmpDir, 'imports.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'import (',
        '    "fmt"',
        '    "net/http"',
        ')',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const imports = nodes.find((n) => n.type === 'module' && n.modifiers.includes('import'));
      expect(imports).toBeDefined();
    });

    it('extracts single import', () => {
      const filePath = path.join(tmpDir, 'single_import.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'import "fmt"',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const imports = nodes.find((n) => n.type === 'module' && n.modifiers.includes('import'));
      expect(imports).toBeDefined();
    });

    it('returns module node for files with no constructs', () => {
      const filePath = path.join(tmpDir, 'empty.go');
      fs.writeFileSync(filePath, '// just a comment\n');

      const nodes = plugin.parseFile(filePath);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('module');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.parseFile('/nonexistent/file.go')).toEqual([]);
    });

    it('extracts struct tags as annotations', () => {
      const filePath = path.join(tmpDir, 'tags.go');
      fs.writeFileSync(filePath, [
        'package models',
        '',
        'type Config struct {',
        '    Host string `json:"host" yaml:"host"`',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const cls = nodes.find((n) => n.type === 'class');
      const field = cls!.children[0];
      expect(field.annotations).toHaveLength(2);
      expect(field.annotations[0].name).toBe('json');
      expect(field.annotations[0].attributes.value).toBe('host');
      expect(field.annotations[1].name).toBe('yaml');
    });

    it('extracts function with multiple return types', () => {
      const filePath = path.join(tmpDir, 'multi_return.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func Divide(a float64, b float64) (float64, error) {',
        '    if b == 0 {',
        '        return 0, fmt.Errorf("division by zero")',
        '    }',
        '    return a / b, nil',
        '}',
      ].join('\n'));

      const nodes = plugin.parseFile(filePath);
      const fn = nodes.find((n) => n.type === 'function' && n.name === 'Divide');
      expect(fn).toBeDefined();
      expect(fn!.returnType).toBe('float64, error');
    });
  });

  describe('extractDependencies', () => {
    it('extracts dependencies from go.mod require block', () => {
      const projDir = path.join(tmpDir, 'go-proj');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'go.mod'), [
        'module github.com/myorg/myapp',
        '',
        'go 1.21',
        '',
        'require (',
        '    github.com/gin-gonic/gin v1.9.1',
        '    gorm.io/gorm v1.25.0',
        '    github.com/stretchr/testify v1.8.4 // indirect',
        ')',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(3);

      const gin = deps.find((d) => d.name === 'github.com/gin-gonic/gin');
      expect(gin).toBeDefined();
      expect(gin!.category).toBe('web-framework');
      expect(gin!.version).toBe('v1.9.1');
      expect(gin!.scope).toBe('runtime');

      const gorm = deps.find((d) => d.name === 'gorm.io/gorm');
      expect(gorm!.category).toBe('database');

      const testify = deps.find((d) => d.name === 'github.com/stretchr/testify');
      expect(testify!.category).toBe('testing');
      expect(testify!.scope).toBe('provided');
    });

    it('extracts single-line require', () => {
      const projDir = path.join(tmpDir, 'go-proj-single');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'go.mod'), [
        'module myapp',
        '',
        'go 1.21',
        '',
        'require github.com/gin-gonic/gin v1.9.1',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('github.com/gin-gonic/gin');
    });

    it('categorizes various Go dependencies correctly', () => {
      const projDir = path.join(tmpDir, 'go-proj-cats');
      fs.mkdirSync(projDir);
      fs.writeFileSync(path.join(projDir, 'go.mod'), [
        'module myapp',
        '',
        'go 1.21',
        '',
        'require (',
        '    github.com/go-redis/redis/v8 v8.11.5',
        '    github.com/segmentio/kafka-go v0.4.42',
        '    github.com/golang-jwt/jwt/v5 v5.0.0',
        '    go.uber.org/zap v1.26.0',
        ')',
      ].join('\n'));

      const deps = plugin.extractDependencies(projDir);
      expect(deps.find((d) => d.name.includes('redis'))!.category).toBe('cache');
      expect(deps.find((d) => d.name.includes('kafka'))!.category).toBe('message-queue');
      expect(deps.find((d) => d.name.includes('jwt'))!.category).toBe('security');
      expect(deps.find((d) => d.name.includes('zap'))!.category).toBe('logging');
    });

    it('returns empty array when no go.mod exists', () => {
      const projDir = path.join(tmpDir, 'no-gomod');
      fs.mkdirSync(projDir);
      expect(plugin.extractDependencies(projDir)).toEqual([]);
    });
  });

  describe('identifyApis', () => {
    it('identifies Gin router.GET/POST/PUT/DELETE routes', () => {
      const filePath = path.join(tmpDir, 'gin_routes.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func setupRoutes(router *gin.Engine) {',
        '    router.GET("/users", listUsers)',
        '    router.POST("/users", createUser)',
        '    router.PUT("/users/:id", updateUser)',
        '    router.DELETE("/users/:id", deleteUser)',
        '}',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(4);
      expect(apis[0].method).toBe('GET');
      expect(apis[0].path).toBe('/users');
      expect(apis[0].handlerMethod).toBe('listUsers');
      expect(apis[1].method).toBe('POST');
      expect(apis[2].method).toBe('PUT');
      expect(apis[2].path).toBe('/users/:id');
      expect(apis[2].parameters).toHaveLength(1);
      expect(apis[2].parameters[0].name).toBe('id');
      expect(apis[3].method).toBe('DELETE');
    });

    it('identifies routes with short variable names (r, g, group)', () => {
      const filePath = path.join(tmpDir, 'gin_short.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func setupRoutes(r *gin.Engine) {',
        '    r.GET("/health", healthCheck)',
        '    group := r.Group("/api")',
        '    group.GET("/items", listItems)',
        '}',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].handlerClass).toBe('r');
      expect(apis[0].path).toBe('/health');
      expect(apis[1].handlerClass).toBe('group');
      expect(apis[1].path).toBe('/items');
    });

    it('identifies net/http HandleFunc patterns', () => {
      const filePath = path.join(tmpDir, 'http_routes.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func main() {',
        '    http.HandleFunc("/hello", helloHandler)',
        '    http.HandleFunc("/api/data", dataHandler)',
        '}',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].path).toBe('/hello');
      expect(apis[0].method).toBe('GET');
      expect(apis[0].handlerClass).toBe('http');
      expect(apis[0].handlerMethod).toBe('helloHandler');
      expect(apis[1].path).toBe('/api/data');
    });

    it('extracts Gin path parameters with :param and *param', () => {
      const filePath = path.join(tmpDir, 'gin_params.go');
      fs.writeFileSync(filePath, [
        'package main',
        '',
        'func setup(r *gin.Engine) {',
        '    r.GET("/users/:userId/posts/:postId", getPost)',
        '    r.GET("/files/*filepath", serveFile)',
        '}',
      ].join('\n'));

      const apis = plugin.identifyApis(filePath);
      expect(apis).toHaveLength(2);
      expect(apis[0].parameters).toHaveLength(2);
      expect(apis[0].parameters[0].name).toBe('userId');
      expect(apis[0].parameters[1].name).toBe('postId');
      expect(apis[1].parameters).toHaveLength(1);
      expect(apis[1].parameters[0].name).toBe('filepath');
    });

    it('returns empty array for non-existent file', () => {
      expect(plugin.identifyApis('/nonexistent/file.go')).toEqual([]);
    });

    it('returns empty array for file with no routes', () => {
      const filePath = path.join(tmpDir, 'no_routes.go');
      fs.writeFileSync(filePath, 'package main\n\nfunc main() {}\n');
      expect(plugin.identifyApis(filePath)).toEqual([]);
    });
  });

  describe('identifyModules', () => {
    it('identifies Go packages (directories with .go files)', () => {
      const projDir = path.join(tmpDir, 'go-mod-proj');
      fs.mkdirSync(path.join(projDir, 'cmd', 'server'), { recursive: true });
      fs.mkdirSync(path.join(projDir, 'internal', 'handler'), { recursive: true });
      fs.mkdirSync(path.join(projDir, 'pkg', 'utils'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'cmd', 'server', 'main.go'), 'package main');
      fs.writeFileSync(path.join(projDir, 'internal', 'handler', 'user.go'), 'package handler');
      fs.writeFileSync(path.join(projDir, 'pkg', 'utils', 'helper.go'), 'package utils');
      // Root go file should not be a module
      fs.writeFileSync(path.join(projDir, 'main.go'), 'package main');

      const modules = plugin.identifyModules(projDir);
      const names = modules.map((m) => m.name).sort();
      expect(names).toContain('server');
      expect(names).toContain('handler');
      expect(names).toContain('utils');
      expect(modules.every((m) => m.isInferred)).toBe(true);
    });

    it('skips test files from key files', () => {
      const projDir = path.join(tmpDir, 'go-test-proj');
      fs.mkdirSync(path.join(projDir, 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'pkg', 'service.go'), 'package pkg');
      fs.writeFileSync(path.join(projDir, 'pkg', 'service_test.go'), 'package pkg');

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].keyFiles).toHaveLength(1);
      expect(modules[0].keyFiles[0]).toContain('service.go');
    });

    it('skips ignored directories', () => {
      const projDir = path.join(tmpDir, 'go-ignore-proj');
      fs.mkdirSync(path.join(projDir, 'vendor', 'lib'), { recursive: true });
      fs.mkdirSync(path.join(projDir, 'api'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'vendor', 'lib', 'dep.go'), 'package lib');
      fs.writeFileSync(path.join(projDir, 'api', 'handler.go'), 'package api');

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe('api');
    });

    it('returns empty array for non-existent directory', () => {
      expect(plugin.identifyModules('/nonexistent/path')).toEqual([]);
    });

    it('returns empty array for directory with no Go files', () => {
      const projDir = path.join(tmpDir, 'no-go-proj');
      fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'src', 'readme.md'), '# Hello');

      const modules = plugin.identifyModules(projDir);
      expect(modules).toHaveLength(0);
    });
  });
});
