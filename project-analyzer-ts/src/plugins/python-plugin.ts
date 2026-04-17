/**
 * PythonPlugin — Python 语言插件（基于正则解析）
 *
 * 提供 Python 源码的深度分析能力：
 * - parseFile: 提取类、函数/方法、装饰器、import 语句
 * - extractDependencies: 解析 requirements.txt / setup.py / pyproject.toml 提取 pip 依赖并分类
 * - identifyApis: 识别 Flask 路由（@app.route）和 Django URL 配置（urlpatterns）
 * - identifyModules: 基于 __init__.py 识别 Python 包作为模块
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

export class PythonPlugin implements LanguagePlugin {
  getLanguageId(): string {
    return 'python';
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
      if (trimmed.startsWith('#') || trimmed === '') continue;

      // Collect decorators above current line
      const decorators = this.collectDecorators(lines, i);

      // Class declarations: class Foo(Bar, Baz):
      const classMatch = line.match(
        /^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/,
      );
      if (classMatch) {
        const indent = classMatch[1].length;
        const className = classMatch[2];
        const bases = classMatch[3]
          ? classMatch[3].split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        const endLine = this.findBlockEnd(lines, i, indent);
        const children = this.extractClassMembers(lines, i, endLine, indent, filePath);

        nodes.push({
          type: 'class',
          name: className,
          filePath,
          startLine: lineNum,
          endLine: endLine + 1,
          modifiers: [],
          annotations: decorators,
          children,
          superClass: bases[0] || undefined,
          interfaces: bases.length > 1 ? bases.slice(1) : [],
        });
        continue;
      }

      // Top-level function declarations: def foo(...): or async def foo(...):
      const funcMatch = line.match(
        /^(\s*)(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\S+))?\s*:/,
      );
      if (funcMatch) {
        const indent = funcMatch[1].length;
        // Only capture top-level functions (indent 0) here; methods are captured inside classes
        if (indent === 0) {
          const isAsync = !!funcMatch[2];
          const funcName = funcMatch[3];
          const params = funcMatch[4];
          const returnType = funcMatch[5];
          const endLine = this.findBlockEnd(lines, i, indent);

          const modifiers: string[] = [];
          if (isAsync) modifiers.push('async');

          nodes.push({
            type: 'function',
            name: funcName,
            filePath,
            startLine: lineNum,
            endLine: endLine + 1,
            modifiers,
            annotations: decorators,
            children: [],
            parameters: this.parseParameters(params),
            returnType: returnType || undefined,
          });
        }
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
    const deps: Dependency[] = [];

    // 1. Parse requirements.txt
    const reqPath = path.join(projectRoot, 'requirements.txt');
    try {
      const content = fs.readFileSync(reqPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_-]+(?:\[[^\]]*\])?)\s*([><=!~]+\s*[\d.*]+(?:\s*,\s*[><=!~]+\s*[\d.*]+)*)?/);
        if (match) {
          deps.push({
            name: match[1].replace(/\[.*\]/, ''),
            version: match[2] ? match[2].trim() : '*',
            category: categorizePythonDep(match[1].replace(/\[.*\]/, '')),
            scope: 'runtime',
          });
        }
      }
    } catch {
      // no requirements.txt
    }

    // 2. Parse setup.py install_requires
    const setupPath = path.join(projectRoot, 'setup.py');
    try {
      const content = fs.readFileSync(setupPath, 'utf-8');
      const installMatch = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
      if (installMatch) {
        const items = installMatch[1].match(/['"]([^'"]+)['"]/g);
        if (items) {
          for (const item of items) {
            const raw = item.replace(/['"]/g, '');
            const parsed = raw.match(/^([a-zA-Z0-9_-]+)\s*(.*)?$/);
            if (parsed && !deps.some((d) => d.name === parsed[1])) {
              deps.push({
                name: parsed[1],
                version: parsed[2] ? parsed[2].trim() : '*',
                category: categorizePythonDep(parsed[1]),
                scope: 'runtime',
              });
            }
          }
        }
      }
    } catch {
      // no setup.py
    }

    // 3. Parse pyproject.toml dependencies
    const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const depsMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
      if (depsMatch) {
        const items = depsMatch[1].match(/['"]([^'"]+)['"]/g);
        if (items) {
          for (const item of items) {
            const raw = item.replace(/['"]/g, '');
            const parsed = raw.match(/^([a-zA-Z0-9_-]+)\s*(.*)?$/);
            if (parsed && !deps.some((d) => d.name === parsed[1])) {
              deps.push({
                name: parsed[1],
                version: parsed[2] ? parsed[2].trim() : '*',
                category: categorizePythonDep(parsed[1]),
                scope: 'runtime',
              });
            }
          }
        }
      }
    } catch {
      // no pyproject.toml
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

    // Flask routes: @app.route('/path', methods=['GET', 'POST']) or @blueprint.route(...)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Flask-style decorator routes
      const flaskMatch = line.match(
        /@(\w+)\.(route)\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]*)\])?\s*\)/,
      );
      if (flaskMatch) {
        const handlerClass = flaskMatch[1];
        const routePath = flaskMatch[3];
        const methodsStr = flaskMatch[4];
        const methods: HttpMethod[] = methodsStr
          ? (methodsStr.match(/['"](\w+)['"]/g) || []).map(
              (m) => m.replace(/['"]/g, '').toUpperCase() as HttpMethod,
            )
          : ['GET'];

        // Find the handler function name on the next non-decorator, non-empty line
        const handlerName = this.findNextFunctionName(lines, i + 1);

        // Extract Flask path parameters like <id> or <int:id>
        const parameters = extractFlaskPathParams(routePath);

        for (const method of methods) {
          endpoints.push({
            path: routePath,
            method,
            handlerClass,
            handlerMethod: handlerName,
            parameters,
            tags: [],
          });
        }
        continue;
      }
    }

    // Django URL patterns: path('url/', view) or url(r'^pattern/', view)
    const urlPatternRegex =
      /(?:path|re_path|url)\s*\(\s*[r]?['"]([^'"]+)['"]\s*,\s*(?:(\w+(?:\.\w+)*)|\w+\.as_view\(\))/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlPatternRegex.exec(content)) !== null) {
      const urlPath = urlMatch[1];
      const viewName = urlMatch[2] || 'view';

      // Extract Django path parameters like <int:pk> or <slug:name>
      const parameters = extractDjangoPathParams(urlPath);

      endpoints.push({
        path: urlPath,
        method: 'GET',
        handlerClass: 'urlpatterns',
        handlerMethod: viewName.includes('.') ? viewName.split('.').pop()! : viewName,
        parameters,
        tags: [],
      });
    }

    return endpoints;
  }

  identifyModules(projectRoot: string): ModuleInfo[] {
    const modules: ModuleInfo[] = [];

    // Look for Python packages (directories with __init__.py)
    const sourceDirs = ['src', 'lib', 'app', '.'];

    for (const dirName of sourceDirs) {
      const dirPath = dirName === '.' ? projectRoot : path.join(projectRoot, dirName);
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
        const initPath = path.join(modulePath, '__init__.py');

        // Only consider directories with __init__.py as Python packages
        if (!fileExists(initPath)) continue;

        const keyFiles = listPythonFiles(modulePath);

        modules.push({
          name: entry.name,
          path: modulePath,
          description: `Python package: ${dirName === '.' ? '' : dirName + '/'}${entry.name}`,
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
        const decMatch = prev.match(/@(\w+(?:\.\w+)*)(?:\(([^)]*)\))?/);
        if (decMatch) {
          decorators.push({
            name: decMatch[1],
            attributes: decMatch[2] ? { value: decMatch[2] } : {},
          });
        }
        j--;
      } else if (prev === '' || prev.startsWith('#')) {
        j--;
      } else {
        break;
      }
    }
    return decorators;
  }

  private parseParameters(paramStr: string): AstNode['parameters'] {
    if (!paramStr.trim()) return [];

    return paramStr.split(',').map((p) => {
      const trimmed = p.trim();
      // Handle type annotations: name: type = default
      const parts = trimmed.split(/\s*:\s*/);
      const name = parts[0].replace(/\s*=.*/, '').replace(/^\*+/, '').trim();
      const type = parts[1] ? parts[1].replace(/\s*=.*/, '').trim() : 'unknown';
      return {
        name,
        type,
        annotations: [],
      };
    }).filter((p) => p.name.length > 0 && p.name !== 'self' && p.name !== 'cls');
  }

  private findBlockEnd(lines: string[], startIndex: number, baseIndent: number): number {
    // Python uses indentation-based blocks
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) continue;

      // Calculate indent
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  private extractClassMembers(
    lines: string[],
    classStart: number,
    classEnd: number,
    classIndent: number,
    filePath: string,
  ): AstNode[] {
    const members: AstNode[] = [];
    const memberIndent = classIndent + 4; // standard Python indent

    for (let i = classStart + 1; i <= classEnd && i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;
      // Only look at direct children (one indent level deeper)
      if (indent < memberIndent) continue;
      if (indent > memberIndent) continue;

      // Collect decorators for this member
      const decorators = this.collectDecorators(lines, i);

      // Method: def method_name(self, ...): or async def method_name(self, ...):
      const methodMatch = trimmed.match(
        /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*(\S+))?\s*:/,
      );
      if (methodMatch) {
        const isAsync = !!methodMatch[1];
        const methodName = methodMatch[2];
        const params = methodMatch[3];
        const returnType = methodMatch[4];
        const endLine = this.findBlockEnd(lines, i, indent);

        const modifiers: string[] = [];
        if (isAsync) modifiers.push('async');

        // Check for staticmethod/classmethod decorators
        for (const dec of decorators) {
          if (dec.name === 'staticmethod') modifiers.push('static');
          if (dec.name === 'classmethod') modifiers.push('classmethod');
          if (dec.name === 'property') modifiers.push('property');
        }
        if (methodName.startsWith('_') && !methodName.startsWith('__')) {
          modifiers.push('private');
        }

        const type = methodName === '__init__' ? 'constructor' : 'method';

        members.push({
          type,
          name: methodName,
          filePath,
          startLine: i + 1,
          endLine: endLine + 1,
          modifiers,
          annotations: decorators,
          children: [],
          parameters: this.parseParameters(params),
          returnType: returnType || undefined,
        });
        i = endLine;
        continue;
      }

      // Class-level field assignment: name = value or name: type = value
      const fieldMatch = trimmed.match(/^(\w+)\s*(?::\s*\S+)?\s*=/);
      if (fieldMatch) {
        members.push({
          type: 'field',
          name: fieldMatch[1],
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

  private findNextFunctionName(lines: string[], startIndex: number): string {
    for (let i = startIndex; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('@')) continue;
      const match = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
      if (match) return match[1];
      break;
    }
    return 'anonymous';
  }
}

// ── Module-level helpers ──────────────────────────────────────────

/** Well-known Python package → category mapping */
const PYTHON_CATEGORY_MAP: Record<string, DependencyCategory> = {
  // Web frameworks
  flask: 'web-framework',
  django: 'web-framework',
  fastapi: 'web-framework',
  tornado: 'web-framework',
  sanic: 'web-framework',
  bottle: 'web-framework',
  starlette: 'web-framework',
  aiohttp: 'web-framework',
  // Database
  sqlalchemy: 'database',
  psycopg2: 'database',
  'psycopg2-binary': 'database',
  pymysql: 'database',
  pymongo: 'database',
  mongoengine: 'database',
  peewee: 'database',
  tortoise: 'database',
  alembic: 'database',
  // Cache
  redis: 'cache',
  'django-redis': 'cache',
  'flask-caching': 'cache',
  memcached: 'cache',
  pylibmc: 'cache',
  // Message queue
  celery: 'message-queue',
  kombu: 'message-queue',
  pika: 'message-queue',
  'kafka-python': 'message-queue',
  // Security
  pyjwt: 'security',
  cryptography: 'security',
  bcrypt: 'security',
  passlib: 'security',
  'python-jose': 'security',
  'flask-login': 'security',
  'django-allauth': 'security',
  // Testing
  pytest: 'testing',
  unittest: 'testing',
  nose: 'testing',
  mock: 'testing',
  hypothesis: 'testing',
  tox: 'testing',
  coverage: 'testing',
  faker: 'testing',
  // Logging
  loguru: 'logging',
  structlog: 'logging',
  'python-json-logger': 'logging',
};

function categorizePythonDep(name: string): DependencyCategory {
  const lower = name.toLowerCase();
  if (PYTHON_CATEGORY_MAP[lower]) return PYTHON_CATEGORY_MAP[lower];

  // Pattern-based fallback
  if (/test|pytest|mock|spec|assert|coverage/.test(lower)) return 'testing';
  if (/log|logger|logging/.test(lower)) return 'logging';
  if (/db|database|sql|mongo|redis|cache/.test(lower)) return 'database';
  if (/auth|jwt|oauth|security|crypt/.test(lower)) return 'security';
  if (/queue|amqp|kafka|rabbit|celery/.test(lower)) return 'message-queue';
  if (/flask|django|fastapi|tornado|web|http/.test(lower)) return 'web-framework';

  return 'other';
}

function extractFlaskPathParams(routePath: string): ApiEndpoint['parameters'] {
  const params: ApiEndpoint['parameters'] = [];
  // Flask uses <name> or <type:name> syntax
  const paramRegex = /<(?:(\w+):)?(\w+)>/g;
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(routePath)) !== null) {
    params.push({
      name: match[2],
      type: match[1] || 'string',
      in: 'path',
      required: true,
    });
  }

  return params;
}

function extractDjangoPathParams(urlPath: string): ApiEndpoint['parameters'] {
  const params: ApiEndpoint['parameters'] = [];

  // Django path() uses <type:name> syntax
  const pathParamRegex = /<(?:(\w+):)?(\w+)>/g;
  let match: RegExpExecArray | null;
  while ((match = pathParamRegex.exec(urlPath)) !== null) {
    params.push({
      name: match[2],
      type: match[1] || 'string',
      in: 'path',
      required: true,
    });
  }

  // Django url() uses regex named groups (?P<name>pattern)
  const regexParamRegex = /\(\?P<(\w+)>/g;
  while ((match = regexParamRegex.exec(urlPath)) !== null) {
    if (!params.some((p) => p.name === match![1])) {
      params.push({
        name: match[1],
        type: 'string',
        in: 'path',
        required: true,
      });
    }
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

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
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
  '__tests__', '__mocks__', '.tox', '.eggs',
  'venv', '.venv', 'env', '.env',
  '.mypy_cache', '.pytest_cache',
]);

function listPythonFiles(dirPath: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.py'))
      .map((e) => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}
