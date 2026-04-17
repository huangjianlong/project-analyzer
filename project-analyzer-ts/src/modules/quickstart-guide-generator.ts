/**
 * QuickstartGuideGenerator — 接手速查手册生成模块
 *
 * 基于完整的 AnalysisReport 生成综合性快速参考手册，包含：
 * - 5 分钟速览
 * - 开发环境搭建
 * - 核心业务速览
 * - 注意事项（仅高严重程度坑点）
 * - 接口速查表
 */

import type {
  ProjectProfile,
  AnalysisReport,
  QuickstartResult,
  BusinessOverviewEntry,
  ApiQuickRefEntry,
  BuildToolType,
} from '../models/index.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';

const INSUFFICIENT_DATA = '信息不足，建议手动补充';

export class QuickstartGuideGenerator implements AnalysisModuleInterface {
  getName(): string {
    return 'quickstart';
  }

  /**
   * AnalysisModuleInterface.analyze — returns a placeholder QuickstartResult.
   * The real work is done by generateGuide() which needs the full AnalysisReport.
   */
  async analyze(_profile: ProjectProfile, _plugins: LanguagePlugin[]): Promise<ModuleResult> {
    return this.emptyResult();
  }

  /**
   * Generate the quickstart guide from the full analysis report.
   */
  generateGuide(report: AnalysisReport): QuickstartResult {
    return {
      fiveMinuteOverview: this.buildFiveMinuteOverview(report),
      devSetupSteps: this.buildDevSetupSteps(report),
      businessOverview: this.buildBusinessOverview(report),
      warnings: this.buildWarnings(report),
      apiQuickRef: this.buildApiQuickRef(report),
    };
  }

  // ─── Private helpers ───

  private buildFiveMinuteOverview(report: AnalysisReport): QuickstartResult['fiveMinuteOverview'] {
    const purpose = `${report.profile.projectName} — ${report.profile.primaryLanguage} 项目`;

    const techStack: string[] = report.architecture?.frameworks?.map(f => f.name) ?? [];

    const coreModules: string[] = report.business?.modules?.map(m => m.name) ?? [];

    const startupCommand: string = report.ops?.startup?.[0]?.command ?? INSUFFICIENT_DATA;

    return {
      purpose: purpose || INSUFFICIENT_DATA,
      techStack: techStack.length > 0 ? techStack : [INSUFFICIENT_DATA],
      coreModules: coreModules.length > 0 ? coreModules : [INSUFFICIENT_DATA],
      startupCommand,
    };
  }

  private buildDevSetupSteps(report: AnalysisReport): string[] {
    const steps: string[] = [];
    const buildTool = report.profile.buildTool;

    const installCmd = this.getInstallCommand(buildTool);
    if (installCmd) {
      steps.push(installCmd);
    }

    const startupCmd = report.ops?.startup?.[0]?.command;
    if (startupCmd) {
      steps.push(startupCmd);
    }

    return steps.length > 0 ? steps : [INSUFFICIENT_DATA];
  }

  private getInstallCommand(buildTool: BuildToolType): string | undefined {
    const map: Partial<Record<BuildToolType, string>> = {
      npm: 'npm install',
      yarn: 'yarn install',
      pnpm: 'pnpm install',
      pip: 'pip install -r requirements.txt',
      poetry: 'poetry install',
      maven: 'mvn install',
      gradle: './gradlew build',
      'go-mod': 'go mod download',
    };
    return map[buildTool];
  }

  private buildBusinessOverview(report: AnalysisReport): BusinessOverviewEntry[] {
    const modules = report.business?.modules;
    if (!modules || modules.length === 0) {
      return [{
        moduleName: INSUFFICIENT_DATA,
        description: INSUFFICIENT_DATA,
        keyFiles: [],
        relatedApis: [],
      }];
    }

    const endpoints = report.apis?.endpoints ?? [];

    return modules.map(mod => {
      // Find APIs related to this module by matching file paths
      const relatedApis = endpoints
        .filter(ep => {
          const modPath = mod.path.replace(/\\/g, '/');
          const handlerPath = (ep.handlerClass || '').replace(/\\/g, '/');
          return handlerPath.includes(modPath) || modPath.includes(handlerPath);
        })
        .map(ep => `${ep.method} ${ep.path}`);

      return {
        moduleName: mod.name,
        description: mod.description || INSUFFICIENT_DATA,
        keyFiles: mod.keyFiles.length > 0 ? mod.keyFiles : [],
        relatedApis,
      };
    });
  }

  private buildWarnings(report: AnalysisReport): QuickstartResult['warnings'] {
    const records = report.pitfalls?.records;
    if (!records || records.length === 0) {
      return [];
    }
    return records.filter(r => r.severity === 'high');
  }

  private buildApiQuickRef(report: AnalysisReport): ApiQuickRefEntry[] | undefined {
    const endpoints = report.apis?.endpoints;
    if (!endpoints || endpoints.length === 0) {
      return undefined;
    }

    return endpoints.map(ep => ({
      path: ep.path,
      method: ep.method,
      description: ep.description || INSUFFICIENT_DATA,
    }));
  }

  private emptyResult(): QuickstartResult {
    return {
      fiveMinuteOverview: {
        purpose: INSUFFICIENT_DATA,
        techStack: [INSUFFICIENT_DATA],
        coreModules: [INSUFFICIENT_DATA],
        startupCommand: INSUFFICIENT_DATA,
      },
      devSetupSteps: [INSUFFICIENT_DATA],
      businessOverview: [{
        moduleName: INSUFFICIENT_DATA,
        description: INSUFFICIENT_DATA,
        keyFiles: [],
        relatedApis: [],
      }],
      warnings: [],
    };
  }
}
