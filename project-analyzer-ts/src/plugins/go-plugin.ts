/**
 * GoPlugin — Go 语言插件（基于正则解析）
 *
 * 提供 Go 源码的深度分析能力：
 * - parseFile: 提取 package 声明、struct、interface、函数/方法、import 语句
 * - extractDependencies: 解析 go.mod 提取 Go 模块依赖并分类
 * - identifyApis: 识别 Gin 路由（router.GET 等）和 net/http 路由（http.HandleFunc）
 * - identifyModules: 基于目录结构识别 Go 包作为模块
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LanguagePlugin } from './language-plugin.js';
import type {
  AstNode,
  Dependency,
  DependencyCategory,
  ApiEndpoint,
  HttpMethod,
  ModuleInfo,
} from '../models/index.js';

export class GoPlugin implements LanguagePlugin {
  getLanguageId(): string {
    return 'go';
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
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') continue;

      // Package declaration
      const pkgMatch = trimmed.match(/^package\s+(\w+)/);
      if (pkgMatch) {
        nodes.push({
          type: 'namespace',
          name: pkgMatch[1],
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          modifiers: [],
          annotations: [],
          children: [],
        });
        continue;
      }

      // Import block: import ( ... )
      if (trimmed === 'import (' || trimmed.startsWith('import (')) {
        const endLine = this.findClosingParen(lines, i);
        nodes.push({
          type: 'module',
          name: 'imports',
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: ['import'],
          annotations: [],
          children: [],
        });
        i = endLine;
        continue;
      }

      // Single import: import "fmt"
      const singleImportMatch = trimmed.match(/^import\s+(?:\w+\s+)?["']([^"']+)["']/);
      if (singleImportMatch) {
        nodes.push({
          type: 'module',
          name: 'imports',
          filePath,
          startLine: lineNum,
          endLine: lineNum,
          modifiers: ['import'],
          annotations: [],
          children: [],
        });
        continue;
      }

      // Struct declaration: type Foo struct { ... }
      const structMatch = trimmed.match(/^type\s+(\w+)\s+struct\b/);
      if (structMatch) {
        const structName = structMatch[1];
        const endLine = this.findBlockEnd(lines, i);
        const children = this.extractStructFields(lines, i, endLine, filePath);
        const modifiers = this.extractGoModifiers(structName);

        nodes.push({
          type: 'class',
          name: structName,
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers,
          annotations: [],
          children,
        });
        i = endLine;
        continue;
      }

      // Interface declaration: type Foo interface { ... }
      const ifaceMatch = trimmed.match(/^type\s+(\w+)\s+interface\b/);
      if (ifaceMatch) {
        const ifaceName = ifaceMatch[1];
        const endLine = this.findBlockEnd(lines, i);
        const children = this.extractInterfaceMethods(lines, i, endLine, filePath);
        const modifiers = this.extractGoModifiers(ifaceName);

        nodes.push({
          type: 'interface',
          name: ifaceName,
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers,
          annotations: [],
          children,
        });
        i = endLine;
        continue;
      }

      // Method with receiver: func (r *Receiver) MethodName(params) returnType { ... }
      const methodMatch = trimmed.match(
        /^func\s+\(\s*(\w+)\s+\*?(\w+)\s*\)\s+(\w+)\s*\(([^)]*)\)\s*(.*)/,
      );
      if (methodMatch) {
        const receiverName = methodMatch[1];
        const receiverType = methodMatch[2];
        const methodName = methodMatch[3];
        const params = methodMatch[4];
        const rest = methodMatch[5];
        const endLine = this.findBlockEnd(lines, i);
        const returnType = this.extractGoReturnType(rest);
        const modifiers = this.extractGoModifiers(methodName);

        nodes.push({
          type: 'method',
          name: methodName,
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers,
          annotations: [{ name: 'receiver', attributes: { name: receiverName, type: receiverType } }],
          children: [],
          parameters: this.parseGoParameters(params),
          returnType: returnType || undefined,
          superClass: receiverType,
        });
        i = endLine;
        continue;
      }

      // Function declaration: func FuncName(params) returnType { ... }
      const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(([^)]*)\)\s*(.*)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2];
        const rest = funcMatch[3];
        const endLine = this.findBlockEnd(lines, i);
        const returnType = this.extractGoReturnType(rest);
        const modifiers = this.extractGoModifiers(funcName);

        nodes.push({
          type: 'function',
          name: funcName,
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers,
          annotations: [],
          children: [],
          parameters: this.parseGoParameters(params),
          returnType: returnType || undefined,
        });
        i = endLine;
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
    const goModPath = path.join(projectRoot, 'go.mod');
    let content: string;
    try {
      content = fs.readFileSync(goModPath, 'utf-8');
    } catch {
      return [];
    }

    const deps: Dependency[] = [];
    const lines = content.split('\n');
    let inRequireBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('//') || trimmed === '') continue;

      // Start of require block
      if (trimmed.startsWith('require (') || trimmed === 'require (') {
        inRequireBlock = true;
        continue;
      }

      // End of require block
      if (inRequireBlock && trimmed === ')') {
        inRequireBlock = false;
        continue;
      }

      // Single-line require: require module/path v1.2.3
      const singleReqMatch = trimmed.match(/^require\s+(\S+)\s+(\S+)/);
      if (singleReqMatch) {
        const modulePath = singleReqMatch[1];
        const version = singleReqMatch[2];
        deps.push({
          name: modulePath,
          version,
          category: categorizeGoDep(modulePath),
          scope: 'runtime',
        });
        continue;
      }

      // Inside require block: module/path v1.2.3
      if (inRequireBlock) {
        const depMatch = trimmed.match(/^(\S+)\s+(\S+)/);
        if (depMatch) {
          const modulePath = depMatch[1];
          const version = depMatch[2];
          // Skip indirect dependencies
          const isIndirect = trimmed.includes('// indirect');
          deps.push({
            name: modulePath,
            version,
            category: categorizeGoDep(modulePath),
            scope: isIndirect ? 'provided' : 'runtime',
          });
        }
      }
    }

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

    // Gin-style routes: router.GET("/path", handler), r.POST("/path", handler), group.PUT(...)
    const ginRouteRegex =
      /\b(\w+)\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(\s*["']([^"']+)["'](?:\s*,\s*(\w+))?/gi;

    // net/http patterns: http.HandleFunc("/path", handler)
    const httpHandleFuncRegex =
      /\bhttp\.HandleFunc\s*\(\s*["']([^"']+)["']\s*,\s*(\w+)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Gin routes
      ginRouteRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ginRouteRegex.exec(line)) !== null) {
        const routerVar = match[1];
        const httpMethod = match[2].toUpperCase() as HttpMethod;
        const routePath = match[3];
        const handlerName = match[4] || 'anonymous';

        const parameters = extractGinPathParams(routePath);

        endpoints.push({
          path: routePath,
          method: httpMethod,
          handlerClass: routerVar,
          handlerMethod: handlerName,
          parameters,
          tags: [],
        });
      }

      // net/http HandleFunc
      httpHandleFuncRegex.lastIndex = 0;
      while ((match = httpHandleFuncRegex.exec(line)) !== null) {
        const routePath = match[1];
        const handlerName = match[2];

        endpoints.push({
          path: routePath,
          method: 'GET',
          handlerClass: 'http',
          handlerMethod: handlerName,
          parameters: [],
          tags: [],
        });
      }
    }

    return endpoints;
  }

  identifyModules(projectRoot: string): ModuleInfo[] {
    const modules: ModuleInfo[] = [];
    this.findGoPackages(projectRoot, projectRoot, modules);
    return modules;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private findGoPackages(dir: string, projectRoot: string, modules: ModuleInfo[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if this directory contains .go files
    const goFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.go') && !e.name.endsWith('_test.go'))
      .map((e) => path.join(dir, e.name));

    if (goFiles.length > 0 && dir !== projectRoot) {
      const relPath = path.relative(projectRoot, dir);
      const pkgName = path.basename(dir);

      modules.push({
        name: pkgName,
        path: dir,
        description: `Go 包: ${relPath}`,
        isInferred: true,
        keyClasses: [],
        keyFiles: goFiles,
        dependencies: [],
      });
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;
      this.findGoPackages(path.join(dir, entry.name), projectRoot, modules);
    }
  }

  private findClosingParen(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].trim() === ')') return i;
    }
    return startIndex;
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

    return startIndex;
  }

  private extractGoModifiers(name: string): string[] {
    // In Go, exported identifiers start with an uppercase letter
    if (name.length > 0 && name[0] >= 'A' && name[0] <= 'Z') {
      return ['export'];
    }
    return ['private'];
  }

  private extractGoReturnType(rest: string): string | undefined {
    // rest is everything after the closing paren of params
    // Could be: "error {", "(string, error) {", "string {", "{"
    const trimmed = rest.trim();

    // Multiple return values: (type1, type2) {
    const multiMatch = trimmed.match(/^\(([^)]+)\)/);
    if (multiMatch) return multiMatch[1].trim();

    // Single return value: type {
    const singleMatch = trimmed.match(/^(\S+)\s*\{/);
    if (singleMatch && singleMatch[1] !== '{') return singleMatch[1];

    return undefined;
  }

  private parseGoParameters(paramStr: string): AstNode['parameters'] {
    if (!paramStr.trim()) return [];

    const params: AstNode['parameters'] = [];
    // Go params: name type, name type or name, name type (grouped)
    const parts = paramStr.split(',').map((p) => p.trim()).filter(Boolean);

    for (const part of parts) {
      const tokens = part.split(/\s+/);
      if (tokens.length >= 2) {
        params.push({
          name: tokens[0],
          type: tokens.slice(1).join(' '),
          annotations: [],
        });
      } else if (tokens.length === 1) {
        // Could be just a type (unnamed) or a name waiting for type
        params.push({
          name: tokens[0],
          type: 'unknown',
          annotations: [],
        });
      }
    }

    return params;
  }

  private extractStructFields(
    lines: string[],
    structStart: number,
    structEnd: number,
    filePath: string,
  ): AstNode[] {
    const fields: AstNode[] = [];

    for (let i = structStart + 1; i <= structEnd && i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed.startsWith('//')) continue;

      // Field: Name Type `json:"name"` or embedded type
      const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        // Skip if it looks like a closing brace or keyword
        if (fieldName === '}') continue;

        fields.push({
          type: 'field',
          name: fieldName,
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: this.extractGoModifiers(fieldName),
          annotations: this.extractStructTags(trimmed),
          children: [],
          returnType: fieldMatch[2],
        });
      }
    }

    return fields;
  }

  private extractStructTags(line: string): AstNode['annotations'] {
    const tagMatch = line.match(/`([^`]+)`/);
    if (!tagMatch) return [];

    const annotations: AstNode['annotations'] = [];
    // Parse struct tags like `json:"name" xml:"name"`
    const tagRegex = /(\w+):"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(tagMatch[1])) !== null) {
      annotations.push({
        name: match[1],
        attributes: { value: match[2] },
      });
    }
    return annotations;
  }

  private extractInterfaceMethods(
    lines: string[],
    ifaceStart: number,
    ifaceEnd: number,
    filePath: string,
  ): AstNode[] {
    const methods: AstNode[] = [];

    for (let i = ifaceStart + 1; i <= ifaceEnd && i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed.startsWith('//')) continue;

      // Method signature: MethodName(params) returnType
      const methodMatch = trimmed.match(/^(\w+)\s*\(([^)]*)\)\s*(.*)/);
      if (methodMatch) {
        const methodName = methodMatch[1];
        const params = methodMatch[2];
        const rest = methodMatch[3];
        const returnType = this.extractGoReturnType(rest + ' {') || rest.trim() || undefined;

        methods.push({
          type: 'method',
          name: methodName,
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: this.extractGoModifiers(methodName),
          annotations: [],
          children: [],
          parameters: this.parseGoParameters(params),
          returnType,
        });
      }
    }

    return methods;
  }
}

// ── Module-level helpers ──────────────────────────────────────────

/** Well-known Go module → category mapping */
const GO_CATEGORY_MAP: Record<string, DependencyCategory> = {
  // Web frameworks
  'github.com/gin-gonic/gin': 'web-framework',
  'github.com/labstack/echo': 'web-framework',
  'github.com/labstack/echo/v4': 'web-framework',
  'github.com/gorilla/mux': 'web-framework',
  'github.com/gofiber/fiber': 'web-framework',
  'github.com/gofiber/fiber/v2': 'web-framework',
  'github.com/beego/beego': 'web-framework',
  'github.com/go-chi/chi': 'web-framework',
  'github.com/go-chi/chi/v5': 'web-framework',
  // Database
  'gorm.io/gorm': 'database',
  'gorm.io/driver/mysql': 'database',
  'gorm.io/driver/postgres': 'database',
  'gorm.io/driver/sqlite': 'database',
  'github.com/go-sql-driver/mysql': 'database',
  'github.com/lib/pq': 'database',
  'github.com/jackc/pgx': 'database',
  'github.com/jackc/pgx/v5': 'database',
  'github.com/jmoiron/sqlx': 'database',
  'go.mongodb.org/mongo-driver': 'database',
  // Cache
  'github.com/go-redis/redis': 'cache',
  'github.com/go-redis/redis/v8': 'cache',
  'github.com/redis/go-redis/v9': 'cache',
  'github.com/bradfitz/gomemcache': 'cache',
  // Message queue
  'github.com/streadway/amqp': 'message-queue',
  'github.com/rabbitmq/amqp091-go': 'message-queue',
  'github.com/segmentio/kafka-go': 'message-queue',
  'github.com/Shopify/sarama': 'message-queue',
  'github.com/IBM/sarama': 'message-queue',
  'github.com/nats-io/nats.go': 'message-queue',
  // Security
  'github.com/golang-jwt/jwt': 'security',
  'github.com/golang-jwt/jwt/v5': 'security',
  'github.com/dgrijalva/jwt-go': 'security',
  'golang.org/x/crypto': 'security',
  'github.com/casbin/casbin': 'security',
  // Testing
  'github.com/stretchr/testify': 'testing',
  'github.com/onsi/ginkgo': 'testing',
  'github.com/onsi/gomega': 'testing',
  'github.com/golang/mock': 'testing',
  // Logging
  'go.uber.org/zap': 'logging',
  'github.com/sirupsen/logrus': 'logging',
  'github.com/rs/zerolog': 'logging',
  'log/slog': 'logging',
};

function categorizeGoDep(modulePath: string): DependencyCategory {
  // Direct match
  if (GO_CATEGORY_MAP[modulePath]) return GO_CATEGORY_MAP[modulePath];

  // Check if any known prefix matches (for versioned modules)
  for (const [known, category] of Object.entries(GO_CATEGORY_MAP)) {
    if (modulePath.startsWith(known)) return category;
  }

  // Pattern-based fallback
  const lower = modulePath.toLowerCase();
  if (/test|mock|assert|spec/.test(lower)) return 'testing';
  if (/log|logger|logging|zap|logrus/.test(lower)) return 'logging';
  if (/sql|db|database|mongo|gorm|redis/.test(lower)) return 'database';
  if (/auth|jwt|oauth|crypto|security/.test(lower)) return 'security';
  if (/queue|amqp|kafka|rabbit|nats/.test(lower)) return 'message-queue';
  if (/cache|memcache/.test(lower)) return 'cache';
  if (/gin|echo|fiber|mux|chi|http|web|api/.test(lower)) return 'web-framework';

  return 'other';
}

function extractGinPathParams(routePath: string): ApiEndpoint['parameters'] {
  const params: ApiEndpoint['parameters'] = [];
  // Gin uses :param and *param syntax
  const paramRegex = /[:*](\w+)/g;
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

/** Directories to skip when identifying modules */
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg',
  '__pycache__', '.gradle', '.idea', '.vscode',
  'vendor', 'coverage', '.next', '.nuxt',
  'testdata', '.cache',
]);
