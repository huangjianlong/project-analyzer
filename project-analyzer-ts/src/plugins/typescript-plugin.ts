/**
 * TypeScriptPlugin — TypeScript/JavaScript 语言插件（基于正则解析）
 *
 * 提供 TS/JS 源码的深度分析能力：
 * - parseFile: 提取类、函数、方法、接口、类型、装饰器、import/export
 * - extractDependencies: 解析 package.json 提取 npm 依赖并分类
 * - identifyApis: 识别 Express 路由（app.get/post/put/delete, router.get 等）
 * - identifyModules: 基于 src/lib 等目录结构识别模块
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LanguagePlugin } from './language-plugin.js';
import type {
  AstNode,
  Dependency,
  DependencyCategory,
  DependencyScope,
  ApiEndpoint,
  HttpMethod,
  ModuleInfo,
} from '../models/index.js';

export class TypeScriptPlugin implements LanguagePlugin {
  getLanguageId(): string {
    return 'typescript';
  }

  parseFile(filePath: string): AstNode[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    const nodes: AstNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip single-line comments and empty lines
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed === '') continue;

      // Collect decorators on the line(s) above
      const decorators = this.collectDecorators(lines, i);

      // Interface declarations
      const interfaceMatch = line.match(
        /^\s*(?:export\s+)?(?:default\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/,
      );
      if (interfaceMatch) {
        const endLine = this.findBlockEnd(lines, i);
        const children = this.extractInterfaceMembers(lines, i, endLine, filePath);
        nodes.push({
          type: 'interface',
          name: interfaceMatch[1],
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children,
          interfaces: interfaceMatch[2]
            ? interfaceMatch[2].split(',').map((s) => s.trim())
            : [],
        });
        continue;
      }

      // Class declarations
      const classMatch = line.match(
        /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/,
      );
      if (classMatch) {
        const endLine = this.findBlockEnd(lines, i);
        const children = this.extractClassMembers(lines, i, endLine, filePath);
        nodes.push({
          type: 'class',
          name: classMatch[1],
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children,
          superClass: classMatch[2] || undefined,
          interfaces: classMatch[3]
            ? classMatch[3].split(',').map((s) => s.trim())
            : [],
        });
        continue;
      }

      // Type alias declarations
      const typeMatch = line.match(
        /^\s*(?:export\s+)?type\s+(\w+)/,
      );
      if (typeMatch) {
        nodes.push({
          type: 'interface', // treat type aliases as interface-like
          name: typeMatch[1],
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children: [],
        });
        continue;
      }

      // Enum declarations
      const enumMatch = line.match(
        /^\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+)/,
      );
      if (enumMatch) {
        const endLine = this.findBlockEnd(lines, i);
        nodes.push({
          type: 'enum',
          name: enumMatch[1],
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children: [],
        });
        continue;
      }

      // Function declarations: function foo(...) or export default function foo(...)
      const funcMatch = line.match(
        /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+(\w+)\s*\(/,
      );
      if (funcMatch) {
        const endLine = this.findBlockEnd(lines, i);
        nodes.push({
          type: 'function',
          name: funcMatch[1],
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children: [],
          parameters: this.extractParameters(line),
          returnType: this.extractReturnType(line),
        });
        continue;
      }

      // Arrow function / const declarations: const foo = (...) => or const foo = function(...)
      const arrowMatch = line.match(
        /^\s*(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\S+\s*)?=\s*(?:async\s+)?(?:\(|function)/,
      );
      if (arrowMatch) {
        const endLine = this.findBlockEnd(lines, i);
        nodes.push({
          type: 'function',
          name: arrowMatch[1],
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: decorators,
          children: [],
          parameters: this.extractParameters(line),
          returnType: this.extractReturnType(line),
        });
        continue;
      }
    }

    // If no constructs found, return a file-level module node
    if (nodes.length === 0) {
      nodes.push({
        type: 'module',
        name: path.basename(filePath),
        filePath,
        startLine: 1,
        endLine: lines.length,
        modifiers: [],
        annotations: [],
        children: [],
      });
    }

    return nodes;
  }

  extractDependencies(projectRoot: string): Dependency[] {
    const pkgPath = path.join(projectRoot, 'package.json');
    let pkgContent: string;
    try {
      pkgContent = fs.readFileSync(pkgPath, 'utf-8');
    } catch {
      return [];
    }

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(pkgContent) as Record<string, unknown>;
    } catch {
      return [];
    }

    const deps: Dependency[] = [];

    const addDeps = (
      section: Record<string, string> | undefined,
      scope: DependencyScope,
    ) => {
      if (!section || typeof section !== 'object') return;
      for (const [name, version] of Object.entries(section)) {
        deps.push({
          name,
          version: String(version),
          category: categorizeDependency(name),
          scope,
        });
      }
    };

    addDeps(pkg.dependencies as Record<string, string> | undefined, 'runtime');
    addDeps(pkg.devDependencies as Record<string, string> | undefined, 'test');
    addDeps(pkg.peerDependencies as Record<string, string> | undefined, 'provided');

    return deps;
  }

  identifyApis(filePath: string): ApiEndpoint[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    const endpoints: ApiEndpoint[] = [];

    // Match Express-style routes: app.get('/path', handler) or router.post('/path', handler)
    const routeRegex =
      /\b(app|router)\.(get|post|put|delete|patch|head|options)\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*(\w+))?/gi;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpExecArray | null;
      routeRegex.lastIndex = 0;

      while ((match = routeRegex.exec(line)) !== null) {
        const routerVar = match[1];
        const httpMethod = match[2].toUpperCase() as HttpMethod;
        const routePath = match[3];
        const handlerName = match[4] || 'anonymous';

        // Extract path parameters like :id
        const parameters = extractPathParams(routePath);

        endpoints.push({
          path: routePath,
          method: httpMethod,
          handlerClass: routerVar,
          handlerMethod: handlerName,
          parameters,
          tags: [],
        });
      }
    }

    return endpoints;
  }

  identifyModules(projectRoot: string): ModuleInfo[] {
    const modules: ModuleInfo[] = [];

    // Look for common TS/JS source directories
    const sourceDirs = ['src', 'lib', 'app', 'packages', 'modules'];

    for (const dirName of sourceDirs) {
      const dirPath = path.join(projectRoot, dirName);
      if (!isDirectory(dirPath)) continue;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

        const modulePath = path.join(dirPath, entry.name);
        const keyFiles = listSourceFiles(modulePath);

        modules.push({
          name: entry.name,
          path: modulePath,
          description: `基于目录推断的模块: ${dirName}/${entry.name}`,
          isInferred: true,
          keyClasses: [],
          keyFiles,
          dependencies: [],
        });
      }
    }

    // If no source dirs found, fall back to top-level directories
    if (modules.length === 0) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(projectRoot, { withFileTypes: true });
      } catch {
        return [];
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

        const dirPath = path.join(projectRoot, entry.name);
        const keyFiles = listSourceFiles(dirPath);

        modules.push({
          name: entry.name,
          path: dirPath,
          description: `基于目录推断的模块: ${entry.name}`,
          isInferred: true,
          keyClasses: [],
          keyFiles,
          dependencies: [],
        });
      }
    }

    return modules;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private collectDecorators(lines: string[], currentIndex: number): AstNode['annotations'] {
    const decorators: AstNode['annotations'] = [];
    let j = currentIndex - 1;
    while (j >= 0) {
      const prev = lines[j].trim();
      if (prev.startsWith('@')) {
        const decMatch = prev.match(/@(\w+)(?:\(([^)]*)\))?/);
        if (decMatch) {
          decorators.push({
            name: decMatch[1],
            attributes: decMatch[2] ? { value: decMatch[2] } : {},
          });
        }
        j--;
      } else {
        break;
      }
    }
    return decorators;
  }

  private extractModifiers(line: string): string[] {
    const mods: string[] = [];
    if (/\bexport\b/.test(line)) mods.push('export');
    if (/\bdefault\b/.test(line)) mods.push('default');
    if (/\basync\b/.test(line)) mods.push('async');
    if (/\babstract\b/.test(line)) mods.push('abstract');
    if (/\bstatic\b/.test(line)) mods.push('static');
    if (/\bprivate\b/.test(line)) mods.push('private');
    if (/\bprotected\b/.test(line)) mods.push('protected');
    if (/\bpublic\b/.test(line)) mods.push('public');
    if (/\breadonly\b/.test(line)) mods.push('readonly');
    return mods;
  }

  private extractParameters(line: string): AstNode['parameters'] {
    const paramMatch = line.match(/\(([^)]*)\)/);
    if (!paramMatch || !paramMatch[1].trim()) return [];

    return paramMatch[1].split(',').map((p) => {
      const parts = p.trim().split(/\s*:\s*/);
      return {
        name: parts[0].replace(/[?=].*/, '').trim(),
        type: parts[1] || 'unknown',
        annotations: [],
      };
    }).filter((p) => p.name.length > 0);
  }

  private extractReturnType(line: string): string | undefined {
    // Match ): ReturnType or ): ReturnType => or ): ReturnType {
    const match = line.match(/\)\s*:\s*([^=>{]+)/);
    return match ? match[1].trim() || undefined : undefined;
  }

  private findBlockEnd(lines: string[], startIndex: number): number {
    let depth = 0;
    let foundOpen = false;

    for (let i = startIndex; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++;
          foundOpen = true;
        } else if (ch === '}') {
          depth--;
          if (foundOpen && depth === 0) {
            return i;
          }
        }
      }
    }

    // If no block found (e.g., single-line or type alias), return start
    return startIndex;
  }

  private extractClassMembers(
    lines: string[],
    classStart: number,
    classEnd: number,
    filePath: string,
  ): AstNode[] {
    const members: AstNode[] = [];

    for (let i = classStart + 1; i <= classEnd && i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

      // Constructor
      if (/^\s*constructor\s*\(/.test(line)) {
        const endLine = this.findBlockEnd(lines, i);
        members.push({
          type: 'constructor',
          name: 'constructor',
          filePath,
          startLine: i + 1,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: this.collectDecorators(lines, i),
          children: [],
          parameters: this.extractParameters(line),
        });
        i = endLine;
        continue;
      }

      // Method declarations: public/private/protected/static/async methodName(...)
      const methodMatch = line.match(
        /^\s*(?:(?:public|private|protected|static|async|readonly|abstract|override|get|set)\s+)*(\w+)\s*\(/,
      );
      if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' &&
          methodMatch[1] !== 'while' && methodMatch[1] !== 'switch' &&
          methodMatch[1] !== 'catch' && methodMatch[1] !== 'constructor') {
        const endLine = this.findBlockEnd(lines, i);
        members.push({
          type: 'method',
          name: methodMatch[1],
          filePath,
          startLine: i + 1,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: this.collectDecorators(lines, i),
          children: [],
          parameters: this.extractParameters(line),
          returnType: this.extractReturnType(line),
        });
        i = endLine;
        continue;
      }

      // Arrow function property: name = (...) => or name = async (...) =>
      const arrowPropMatch = line.match(
        /^\s*(?:(?:public|private|protected|static|readonly)\s+)*(\w+)\s*=\s*(?:async\s+)?(?:\(|function)/,
      );
      if (arrowPropMatch) {
        const endLine = this.findBlockEnd(lines, i);
        members.push({
          type: 'method',
          name: arrowPropMatch[1],
          filePath,
          startLine: i + 1,
          endLine: endLine + 1,
          modifiers: this.extractModifiers(line),
          annotations: this.collectDecorators(lines, i),
          children: [],
          parameters: this.extractParameters(line),
        });
        i = endLine;
        continue;
      }

      // Field declarations: name: type or name = value
      const fieldMatch = line.match(
        /^\s*(?:(?:public|private|protected|static|readonly|declare|abstract|override)\s+)*(\w+)\s*[?!]?\s*[:=]/,
      );
      if (fieldMatch && fieldMatch[1] !== 'if' && fieldMatch[1] !== 'return' &&
          fieldMatch[1] !== 'const' && fieldMatch[1] !== 'let' && fieldMatch[1] !== 'var') {
        members.push({
          type: 'field',
          name: fieldMatch[1],
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: this.extractModifiers(line),
          annotations: this.collectDecorators(lines, i),
          children: [],
        });
      }
    }

    return members;
  }

  private extractInterfaceMembers(
    lines: string[],
    ifaceStart: number,
    ifaceEnd: number,
    filePath: string,
  ): AstNode[] {
    const members: AstNode[] = [];

    for (let i = ifaceStart + 1; i <= ifaceEnd && i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed === '}') continue;

      // Method signature: name(...): ReturnType
      const methodMatch = trimmed.match(/^(?:readonly\s+)?(\w+)\s*\(/);
      if (methodMatch) {
        members.push({
          type: 'method',
          name: methodMatch[1],
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: [],
          annotations: [],
          children: [],
          parameters: this.extractParameters(trimmed),
          returnType: this.extractReturnType(trimmed),
        });
        continue;
      }

      // Property signature: name: type or name?: type
      const propMatch = trimmed.match(/^(?:readonly\s+)?(\w+)\s*[?]?\s*:/);
      if (propMatch) {
        members.push({
          type: 'field',
          name: propMatch[1],
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: [],
          annotations: [],
          children: [],
        });
      }
    }

    return members;
  }
}

// ── Module-level helpers ──────────────────────────────────────────

/** Well-known npm package → category mapping */
const CATEGORY_MAP: Record<string, DependencyCategory> = {
  // Web frameworks
  express: 'web-framework',
  koa: 'web-framework',
  fastify: 'web-framework',
  hapi: 'web-framework',
  'next': 'web-framework',
  nuxt: 'web-framework',
  react: 'web-framework',
  vue: 'web-framework',
  angular: 'web-framework',
  '@angular/core': 'web-framework',
  svelte: 'web-framework',
  nestjs: 'web-framework',
  '@nestjs/core': 'web-framework',
  // Database
  mysql: 'database',
  mysql2: 'database',
  pg: 'database',
  mongodb: 'database',
  mongoose: 'database',
  sequelize: 'database',
  typeorm: 'database',
  prisma: 'database',
  '@prisma/client': 'database',
  knex: 'database',
  sqlite3: 'database',
  'better-sqlite3': 'database',
  // Cache
  redis: 'cache',
  ioredis: 'cache',
  memcached: 'cache',
  'node-cache': 'cache',
  // Message queue
  amqplib: 'message-queue',
  kafkajs: 'message-queue',
  bullmq: 'message-queue',
  bull: 'message-queue',
  // Security
  helmet: 'security',
  cors: 'security',
  jsonwebtoken: 'security',
  bcrypt: 'security',
  bcryptjs: 'security',
  passport: 'security',
  // Testing
  jest: 'testing',
  mocha: 'testing',
  vitest: 'testing',
  chai: 'testing',
  sinon: 'testing',
  supertest: 'testing',
  '@testing-library/react': 'testing',
  cypress: 'testing',
  playwright: 'testing',
  'fast-check': 'testing',
  // Logging
  winston: 'logging',
  pino: 'logging',
  bunyan: 'logging',
  morgan: 'logging',
  log4js: 'logging',
};

function categorizeDependency(name: string): DependencyCategory {
  if (CATEGORY_MAP[name]) return CATEGORY_MAP[name];

  // Pattern-based fallback
  if (/^@?types\//.test(name)) return 'utility';
  if (/eslint|prettier|lint/.test(name)) return 'utility';
  if (/test|spec|mock|stub|fake|assert/.test(name)) return 'testing';
  if (/log|logger|logging/.test(name)) return 'logging';
  if (/db|database|sql|mongo|redis|cache/.test(name)) return 'database';
  if (/auth|jwt|oauth|passport|security/.test(name)) return 'security';
  if (/queue|amqp|kafka|rabbit|bull/.test(name)) return 'message-queue';

  return 'other';
}

function extractPathParams(routePath: string): ApiEndpoint['parameters'] {
  const params: ApiEndpoint['parameters'] = [];
  const paramRegex = /:(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(routePath)) !== null) {
    params.push({
      name: match[1],
      type: 'string',
      in: 'path',
      required: true,
    });
  }

  return params;
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Directories to skip when identifying modules */
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg',
  '__pycache__', '.gradle', '.idea', '.vscode',
  'vendor', 'coverage', '.next', '.nuxt',
  '__tests__', '__mocks__',
]);

function listSourceFiles(dirPath: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}
