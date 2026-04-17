/**
 * BusinessAnalyzer — 业务功能分析模块
 *
 * 基于目录结构识别业务功能模块，提取关键类和文件列表，
 * 推断模块功能描述，并提取数据模型（Entity/Model/DTO/VO）。
 */

import * as path from 'node:path';
import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  ModuleInfo,
  BusinessResult,
  DataModelInfo,
  DataFieldInfo,
  AstNode,
} from '../models/index.js';

/** Patterns that indicate a data model class. */
const DATA_MODEL_PATTERNS: { pattern: RegExp; type: DataModelInfo['type'] }[] = [
  { pattern: /entity/i, type: 'entity' },
  { pattern: /model/i, type: 'model' },
  { pattern: /dto/i, type: 'dto' },
  { pattern: /vo$/i, type: 'vo' },
  { pattern: /VO[A-Z]/i, type: 'vo' },
];

/** Common words to strip from directory names when generating descriptions. */
const NOISE_WORDS = new Set(['src', 'lib', 'app', 'main', 'java', 'kotlin']);

export class BusinessAnalyzer implements AnalysisModuleInterface {
  getName(): string {
    return 'business';
  }

  async analyze(profile: ProjectProfile, plugins: LanguagePlugin[]): Promise<ModuleResult> {
    // 1. Collect modules from all plugins
    const modules = this.collectModules(profile, plugins);

    // 2. Enrich modules with key classes from parsed AST
    this.enrichModulesWithClasses(modules, plugins);

    // 3. Infer descriptions for modules that lack them
    this.inferDescriptions(modules);

    // 4. Extract data models from parsed files
    const dataModels = this.extractDataModels(profile, plugins);

    const result: BusinessResult = {
      modules,
      dataModels,
    };

    return result;
  }

  /**
   * Collect modules from all language plugins, deduplicating by path.
   */
  private collectModules(profile: ProjectProfile, plugins: LanguagePlugin[]): ModuleInfo[] {
    const modules: ModuleInfo[] = [];
    const seen = new Set<string>();

    for (const plugin of plugins) {
      const pluginModules = plugin.identifyModules(profile.projectPath);
      for (const mod of pluginModules) {
        const normalizedPath = path.resolve(mod.path);
        if (!seen.has(normalizedPath)) {
          seen.add(normalizedPath);
          modules.push({ ...mod, isInferred: true });
        }
      }
    }

    return modules;
  }

  /**
   * Enrich each module with key class names extracted from parsed AST nodes.
   */
  private enrichModulesWithClasses(modules: ModuleInfo[], plugins: LanguagePlugin[]): void {
    for (const mod of modules) {
      const classNames: string[] = [];

      for (const filePath of mod.keyFiles) {
        for (const plugin of plugins) {
          const nodes = plugin.parseFile(filePath);
          for (const node of nodes) {
            if (node.type === 'class' || node.type === 'interface') {
              classNames.push(node.name);
            }
          }
        }
      }

      if (classNames.length > 0) {
        mod.keyClasses = [...new Set(classNames)];
      }
    }
  }

  /**
   * Infer human-readable descriptions from directory and class names.
   */
  private inferDescriptions(modules: ModuleInfo[]): void {
    for (const mod of modules) {
      if (!mod.description || mod.description.startsWith('Module inferred from')) {
        mod.description = this.generateDescription(mod);
        mod.isInferred = true;
      }
    }
  }

  /**
   * Generate a description for a module based on its name and key classes.
   */
  private generateDescription(mod: ModuleInfo): string {
    const humanName = this.humanize(mod.name);

    if (mod.keyClasses.length > 0) {
      const classHints = mod.keyClasses.slice(0, 3).join(', ');
      return `${humanName} module (key classes: ${classHints})`;
    }

    return `${humanName} module (inferred from directory structure)`;
  }

  /**
   * Convert a directory/module name into a human-readable label.
   * e.g. "user-management" → "User Management"
   */
  private humanize(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .split(' ')
      .filter((w) => !NOISE_WORDS.has(w.toLowerCase()))
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      || name;
  }

  /**
   * Extract data models (Entity/Model/DTO/VO) from all source files.
   */
  private extractDataModels(profile: ProjectProfile, plugins: LanguagePlugin[]): DataModelInfo[] {
    const models: DataModelInfo[] = [];
    const seen = new Set<string>();

    // Gather all source files from modules identified by plugins
    const allFiles = new Set<string>();
    for (const plugin of plugins) {
      const mods = plugin.identifyModules(profile.projectPath);
      for (const mod of mods) {
        for (const f of mod.keyFiles) {
          allFiles.add(f);
        }
      }
    }

    for (const filePath of allFiles) {
      for (const plugin of plugins) {
        const nodes = plugin.parseFile(filePath);
        for (const node of nodes) {
          if (node.type !== 'class' && node.type !== 'interface') continue;

          const modelType = this.classifyModelType(node.name, filePath);
          if (!modelType) continue;

          const key = `${filePath}:${node.name}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const fields = this.extractFields(node);

          models.push({
            name: node.name,
            type: modelType,
            filePath,
            fields,
            description: `${modelType.toUpperCase()} class: ${node.name}`,
          });
        }
      }
    }

    return models;
  }

  /**
   * Classify a class name as entity/model/dto/vo/other based on naming patterns.
   * Returns null if the name doesn't match any data model pattern.
   */
  private classifyModelType(className: string, filePath: string): DataModelInfo['type'] | null {
    // Check class name first
    for (const { pattern, type } of DATA_MODEL_PATTERNS) {
      if (pattern.test(className)) return type;
    }

    // Check file path as fallback
    const baseName = path.basename(filePath, path.extname(filePath));
    for (const { pattern, type } of DATA_MODEL_PATTERNS) {
      if (pattern.test(baseName)) return type;
    }

    return null;
  }

  /**
   * Extract field information from AST node children.
   */
  private extractFields(node: AstNode): DataFieldInfo[] {
    const fields: DataFieldInfo[] = [];

    for (const child of node.children) {
      if (child.type !== 'field') continue;

      fields.push({
        name: child.name,
        type: child.returnType ?? 'unknown',
        annotations: child.annotations.map((a) => a.name),
        description: undefined,
      });
    }

    return fields;
  }
}
