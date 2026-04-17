/**
 * AiMemoryGenerator — AI 项目记忆生成模块
 *
 * 基于完整的 AnalysisReport 生成：
 * - JSON 格式知识库文件（含项目元数据、模块信息、接口定义、术语表、代码导航索引）
 * - Markdown 格式 AI 上下文摘要
 * - 版本差异对比功能
 */

import type {
  ProjectProfile,
  AnalysisReport,
  AiMemoryData,
  AiModuleInfo,
  AiApiInfo,
  GlossaryEntry,
  CodeNavEntry,
  AiMemoryResult,
} from '../models/index.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';

export interface AiMemoryDiff {
  modules: {
    added: AiModuleInfo[];
    modified: { old: AiModuleInfo; new: AiModuleInfo }[];
    removed: AiModuleInfo[];
  };
  apis: {
    added: AiApiInfo[];
    modified: { old: AiApiInfo; new: AiApiInfo }[];
    removed: AiApiInfo[];
  };
  glossary: {
    added: GlossaryEntry[];
    removed: GlossaryEntry[];
  };
}

export class AiMemoryGenerator implements AnalysisModuleInterface {
  getName(): string {
    return 'ai-memory';
  }

  /**
   * AnalysisModuleInterface.analyze — returns a placeholder AiMemoryResult.
   * The real work is done by generateMemoryData() which needs the full AnalysisReport.
   */
  async analyze(_profile: ProjectProfile, _plugins: LanguagePlugin[]): Promise<ModuleResult> {
    return this.emptyResult();
  }

  /**
   * Generate the AI memory data from the full analysis report.
   */
  generateMemoryData(report: AnalysisReport): AiMemoryData {
    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      projectMeta: this.buildProjectMeta(report),
      modules: this.buildModules(report),
      apis: this.buildApis(report),
      glossary: this.buildGlossary(report),
      codeNavigation: this.buildCodeNavigation(report),
    };
  }

  /**
   * Compare two versions of AiMemoryData and return a diff.
   */
  compareVersions(oldVersion: AiMemoryData, newVersion: AiMemoryData): AiMemoryDiff {
    return {
      modules: this.diffModules(oldVersion.modules, newVersion.modules),
      apis: this.diffApis(oldVersion.apis, newVersion.apis),
      glossary: this.diffGlossary(oldVersion.glossary, newVersion.glossary),
    };
  }

  // ─── Private helpers: data building ───

  private buildProjectMeta(report: AnalysisReport): AiMemoryData['projectMeta'] {
    const framework = report.architecture?.frameworks?.[0]?.name ?? '';
    return {
      name: report.profile.projectName,
      language: report.profile.primaryLanguage,
      framework,
      buildTool: report.profile.buildTool,
    };
  }

  private buildModules(report: AnalysisReport): AiModuleInfo[] {
    const modules = report.business?.modules;
    if (!modules || modules.length === 0) return [];

    return modules.map(mod => ({
      name: mod.name,
      purpose: mod.description || '',
      coreClasses: mod.keyClasses.map(cls => ({
        name: cls,
        publicMethods: [],
        dependencies: mod.dependencies,
      })),
    }));
  }

  private buildApis(report: AnalysisReport): AiApiInfo[] {
    const endpoints = report.apis?.endpoints;
    if (!endpoints || endpoints.length === 0) return [];

    const modules = report.business?.modules ?? [];

    return endpoints.map(ep => {
      // Find related module by matching handler class path against module paths
      const relatedModule = modules.find(mod => {
        const modPath = mod.path.replace(/\\/g, '/');
        const handler = (ep.handlerClass || '').replace(/\\/g, '/');
        return handler.includes(modPath) || modPath.includes(handler);
      });

      return {
        path: ep.path,
        method: ep.method,
        description: ep.description || '',
        parameters: ep.parameters.map(p => ({
          name: p.name,
          type: p.type,
          in: p.in,
        })),
        responseModel: ep.responseType,
        businessContext: ep.description || '',
        relatedModule: relatedModule?.name ?? '',
      };
    });
  }

  private buildGlossary(report: AnalysisReport): GlossaryEntry[] {
    const entries: GlossaryEntry[] = [];
    const seen = new Set<string>();

    // Generate glossary from module names
    const modules = report.business?.modules ?? [];
    for (const mod of modules) {
      const term = mod.name;
      if (!seen.has(term)) {
        seen.add(term);
        entries.push({
          term,
          definition: mod.description || `模块: ${term}`,
          relatedCode: [...mod.keyClasses, ...mod.keyFiles],
        });
      }
    }

    // Generate glossary from class names within modules
    for (const mod of modules) {
      for (const cls of mod.keyClasses) {
        if (!seen.has(cls)) {
          seen.add(cls);
          entries.push({
            term: cls,
            definition: `模块 ${mod.name} 中的类`,
            relatedCode: [cls],
          });
        }
      }
    }

    return entries;
  }

  private buildCodeNavigation(report: AnalysisReport): CodeNavEntry[] {
    const modules = report.business?.modules;
    if (!modules || modules.length === 0) return [];

    return modules.map(mod => ({
      feature: mod.name,
      files: mod.keyFiles,
      methods: [],
    }));
  }

  // ─── Private helpers: version diff ───

  private diffModules(
    oldModules: AiModuleInfo[],
    newModules: AiModuleInfo[],
  ): AiMemoryDiff['modules'] {
    const oldMap = new Map(oldModules.map(m => [m.name, m]));
    const newMap = new Map(newModules.map(m => [m.name, m]));

    const added: AiModuleInfo[] = [];
    const modified: { old: AiModuleInfo; new: AiModuleInfo }[] = [];
    const removed: AiModuleInfo[] = [];

    for (const [name, newMod] of newMap) {
      const oldMod = oldMap.get(name);
      if (!oldMod) {
        added.push(newMod);
      } else if (!this.modulesEqual(oldMod, newMod)) {
        modified.push({ old: oldMod, new: newMod });
      }
    }

    for (const [name, oldMod] of oldMap) {
      if (!newMap.has(name)) {
        removed.push(oldMod);
      }
    }

    return { added, modified, removed };
  }

  private diffApis(
    oldApis: AiApiInfo[],
    newApis: AiApiInfo[],
  ): AiMemoryDiff['apis'] {
    const apiKey = (a: AiApiInfo) => `${a.method} ${a.path}`;
    const oldMap = new Map(oldApis.map(a => [apiKey(a), a]));
    const newMap = new Map(newApis.map(a => [apiKey(a), a]));

    const added: AiApiInfo[] = [];
    const modified: { old: AiApiInfo; new: AiApiInfo }[] = [];
    const removed: AiApiInfo[] = [];

    for (const [key, newApi] of newMap) {
      const oldApi = oldMap.get(key);
      if (!oldApi) {
        added.push(newApi);
      } else if (!this.apisEqual(oldApi, newApi)) {
        modified.push({ old: oldApi, new: newApi });
      }
    }

    for (const [key, oldApi] of oldMap) {
      if (!newMap.has(key)) {
        removed.push(oldApi);
      }
    }

    return { added, modified, removed };
  }

  private diffGlossary(
    oldGlossary: GlossaryEntry[],
    newGlossary: GlossaryEntry[],
  ): AiMemoryDiff['glossary'] {
    const oldTerms = new Set(oldGlossary.map(g => g.term));
    const newTerms = new Set(newGlossary.map(g => g.term));

    const added = newGlossary.filter(g => !oldTerms.has(g.term));
    const removed = oldGlossary.filter(g => !newTerms.has(g.term));

    return { added, removed };
  }

  // ─── Private helpers: equality checks ───

  private modulesEqual(a: AiModuleInfo, b: AiModuleInfo): boolean {
    if (a.name !== b.name || a.purpose !== b.purpose) return false;
    if (a.coreClasses.length !== b.coreClasses.length) return false;
    for (let i = 0; i < a.coreClasses.length; i++) {
      const ac = a.coreClasses[i];
      const bc = b.coreClasses[i];
      if (ac.name !== bc.name) return false;
      if (JSON.stringify(ac.publicMethods) !== JSON.stringify(bc.publicMethods)) return false;
      if (JSON.stringify(ac.dependencies) !== JSON.stringify(bc.dependencies)) return false;
    }
    return true;
  }

  private apisEqual(a: AiApiInfo, b: AiApiInfo): boolean {
    return (
      a.path === b.path &&
      a.method === b.method &&
      a.description === b.description &&
      a.businessContext === b.businessContext &&
      a.relatedModule === b.relatedModule &&
      JSON.stringify(a.parameters) === JSON.stringify(b.parameters) &&
      a.responseModel === b.responseModel
    );
  }

  // ─── Placeholder result ───

  private emptyResult(): AiMemoryResult {
    return {
      memoryData: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        projectMeta: { name: '', language: '', framework: '', buildTool: '' },
        modules: [],
        apis: [],
        glossary: [],
        codeNavigation: [],
      },
      jsonFilePath: '',
      markdownFilePath: '',
    };
  }
}
