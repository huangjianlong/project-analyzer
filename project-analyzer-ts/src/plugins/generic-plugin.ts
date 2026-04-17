/**
 * GenericPlugin — 通用语言插件（基于文件模式匹配）
 *
 * 当没有对应语言插件时使用此插件，提供基础的文件分析能力：
 * - parseFile: 使用简单正则提取函数/类名
 * - extractDependencies: 返回空数组
 * - identifyApis: 返回空数组
 * - identifyModules: 基于顶层目录结构识别模块
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LanguagePlugin } from './language-plugin.js';
import type { AstNode, Dependency, ApiEndpoint, ModuleInfo } from '../models/index.js';

export class GenericPlugin implements LanguagePlugin {
  getLanguageId(): string {
    return 'generic';
  }

  parseFile(filePath: string): AstNode[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    const totalLines = lines.length;
    const nodes: AstNode[] = [];

    // Extract class-like declarations
    const classRegex = /^\s*(?:export\s+)?(?:abstract\s+)?(?:class|struct)\s+(\w+)/;
    // Extract function/method declarations (various styles)
    const funcRegex = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+|def\s+|func\s+|fn\s+)(\w+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const classMatch = line.match(classRegex);
      if (classMatch) {
        nodes.push({
          type: 'class',
          name: classMatch[1],
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: [],
          annotations: [],
          children: [],
        });
        continue;
      }

      const funcMatch = line.match(funcRegex);
      if (funcMatch) {
        nodes.push({
          type: 'function',
          name: funcMatch[1],
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          modifiers: [],
          annotations: [],
          children: [],
        });
      }
    }

    // If no specific constructs found, return a file-level module node
    if (nodes.length === 0) {
      nodes.push({
        type: 'module',
        name: path.basename(filePath),
        filePath,
        startLine: 1,
        endLine: totalLines,
        modifiers: [],
        annotations: [],
        children: [],
      });
    }

    return nodes;
  }

  extractDependencies(_projectRoot: string): Dependency[] {
    return [];
  }

  identifyApis(_filePath: string): ApiEndpoint[] {
    return [];
  }

  identifyModules(projectRoot: string): ModuleInfo[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    } catch {
      return [];
    }

    const modules: ModuleInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirName = entry.name;
      // Skip hidden dirs and common non-module dirs
      if (dirName.startsWith('.') || IGNORED_DIRS.has(dirName)) continue;

      const dirPath = path.join(projectRoot, dirName);
      const keyFiles = listSourceFiles(dirPath);

      modules.push({
        name: dirName,
        path: dirPath,
        description: `基于目录推断的模块: ${dirName}`,
        isInferred: true,
        keyClasses: [],
        keyFiles,
        dependencies: [],
      });
    }

    return modules;
  }
}

/** Directories to skip when identifying modules */
const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target',
  '.git', '.svn', '.hg',
  '__pycache__', '.gradle', '.idea', '.vscode',
  'vendor', 'coverage', '.next', '.nuxt',
]);

/**
 * List source files in a directory (non-recursive, top-level only).
 */
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
