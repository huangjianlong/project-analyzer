/**
 * ProjectAnalyzer — Analyzer 协调器
 *
 * 按顺序调用 Scanner → 分析模块 → ReportGenerator，
 * 集成 ErrorCollector 实现降级策略。
 *
 * 支持通过 modules 参数选择性执行分析模块，默认执行所有模块。
 */

import type { AnalysisReport, AnalysisError } from '../models/index.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type { AnalysisModuleInterface } from '../plugins/analysis-module.js';
import { DefaultProjectScanner } from '../scanner/index.js';
import { DefaultErrorCollector } from '../errors/index.js';
import { ReportGenerator } from '../report/index.js';
import { version } from '../version.js';

// Analysis modules
import {
  ArchitectureAnalyzer,
  BusinessAnalyzer,
  FlowAnalyzer,
  ApiAnalyzer,
  StructureMapper,
  OpsDocGenerator,
  PitfallDetector,
  QuickstartGuideGenerator,
  AiMemoryGenerator,
} from '../modules/index.js';

// Language plugins
import {
  TypeScriptPlugin,
  PythonPlugin,
  GoPlugin,
  GenericPlugin,
} from '../plugins/index.js';

/** Configuration for the analyzer coordinator. */
export interface AnalyzerConfig {
  projectPath: string;
  outputDir: string;
  modules: string[];   // module names to execute, empty = all
  lang?: string;        // override detected language
}

/** Result returned by the analyzer. */
export interface AnalyzerResult {
  report: AnalysisReport;
  reportFiles: { indexFile: string; reportFiles: string[] };
  errors: AnalysisError[];
  warnings: AnalysisError[];
}

/** Ordered list of all available module names. */
const ALL_MODULE_NAMES = [
  'architecture',
  'business',
  'flow',
  'api',
  'structure',
  'ops',
  'pitfall',
  'quickstart',
  'ai-memory',
] as const;

/** Progress callback type. */
export type ProgressCallback = (message: string) => void;

export class ProjectAnalyzer {
  private readonly onProgress: ProgressCallback;

  constructor(onProgress?: ProgressCallback) {
    this.onProgress = onProgress ?? (() => {});
  }

  async run(config: AnalyzerConfig): Promise<AnalyzerResult> {
    const errorCollector = new DefaultErrorCollector();

    // Determine which modules to run
    const selectedModules = config.modules.length > 0
      ? config.modules
      : [...ALL_MODULE_NAMES];

    // ── Step 1: Scan project (fatal on error) ──
    this.onProgress('扫描项目目录...');
    const scanner = new DefaultProjectScanner();
    const profile = scanner.scan(config.projectPath);

    // ── Step 2: Load language plugins ──
    this.onProgress('加载语言插件...');
    const plugins = this.loadPlugins(profile.primaryLanguage, config.lang);

    // ── Step 3: Build analysis report ──
    const report: AnalysisReport = {
      metadata: {
        generatedAt: new Date().toISOString(),
        analyzerVersion: version,
        analyzerType: 'ts',
        projectName: profile.projectName,
      },
      profile,
    };

    // ── Step 4: Execute analysis modules in order ──
    const moduleInstances = this.createModuleInstances();

    for (const moduleName of selectedModules) {
      const moduleInstance = moduleInstances.get(moduleName);
      if (!moduleInstance) {
        errorCollector.addWarning({
          code: 'MODULE_ERROR',
          message: `Unknown module: ${moduleName}`,
          module: moduleName,
          recoverable: true,
        });
        continue;
      }

      this.onProgress(`执行分析模块: ${moduleName}...`);

      try {
        // Special handling for quickstart and ai-memory: they need the full report
        if (moduleName === 'quickstart') {
          const gen = moduleInstance as QuickstartGuideGenerator;
          report.quickstart = gen.generateGuide(report);
        } else if (moduleName === 'ai-memory') {
          const gen = moduleInstance as AiMemoryGenerator;
          const memoryData = gen.generateMemoryData(report);
          report.aiMemory = {
            memoryData,
            jsonFilePath: '',
            markdownFilePath: '',
          };
        } else {
          const result = await moduleInstance.analyze(profile, plugins);
          this.assignResult(report, moduleName, result);
        }
      } catch (err: unknown) {
        // Degradation: catch module errors, record, and continue
        const message = err instanceof Error ? err.message : String(err);
        errorCollector.addError({
          code: 'MODULE_ERROR',
          message: `Module "${moduleName}" failed: ${message}`,
          module: moduleName,
          cause: err instanceof Error ? err : undefined,
          recoverable: true,
        });
      }
    }

    // ── Step 5: Generate reports ──
    this.onProgress('生成分析报告...');
    const reportGenerator = new ReportGenerator();
    const reportFiles = await reportGenerator.generate(report, config.outputDir);

    return {
      report,
      reportFiles,
      errors: errorCollector.getErrors(),
      warnings: errorCollector.getWarnings(),
    };
  }

  /** Load language plugins based on detected/specified language. */
  private loadPlugins(detectedLanguage: string, overrideLang?: string): LanguagePlugin[] {
    const lang = (overrideLang ?? detectedLanguage).toLowerCase();
    const plugins: LanguagePlugin[] = [];

    // Always include the plugin matching the primary language
    switch (lang) {
      case 'typescript':
      case 'javascript':
        plugins.push(new TypeScriptPlugin());
        break;
      case 'python':
        plugins.push(new PythonPlugin());
        break;
      case 'go':
        plugins.push(new GoPlugin());
        break;
      default:
        break;
    }

    // Always include the generic plugin as fallback
    plugins.push(new GenericPlugin());
    return plugins;
  }

  /** Create instances of all analysis modules. */
  private createModuleInstances(): Map<string, AnalysisModuleInterface> {
    const map = new Map<string, AnalysisModuleInterface>();
    map.set('architecture', new ArchitectureAnalyzer());
    map.set('business', new BusinessAnalyzer());
    map.set('flow', new FlowAnalyzer());
    map.set('api', new ApiAnalyzer());
    map.set('structure', new StructureMapper());
    map.set('ops', new OpsDocGenerator());
    map.set('pitfall', new PitfallDetector());
    map.set('quickstart', new QuickstartGuideGenerator());
    map.set('ai-memory', new AiMemoryGenerator());
    return map;
  }

  /** Assign a module result to the correct field on the report. */
  private assignResult(report: AnalysisReport, moduleName: string, result: unknown): void {
    switch (moduleName) {
      case 'architecture':
        report.architecture = result as AnalysisReport['architecture'];
        break;
      case 'business':
        report.business = result as AnalysisReport['business'];
        break;
      case 'flow':
        report.flows = result as AnalysisReport['flows'];
        break;
      case 'api':
        report.apis = result as AnalysisReport['apis'];
        break;
      case 'structure':
        report.structure = result as AnalysisReport['structure'];
        break;
      case 'ops':
        report.ops = result as AnalysisReport['ops'];
        break;
      case 'pitfall':
        report.pitfalls = result as AnalysisReport['pitfalls'];
        break;
      // quickstart and ai-memory are handled separately
    }
  }
}
