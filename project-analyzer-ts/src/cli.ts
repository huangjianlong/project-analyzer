#!/usr/bin/env node

/**
 * CLI entry point for project-analyzer.
 * Usage: project-analyzer <path> [options]
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { version } from './version.js';
import { ProjectAnalyzer } from './analyzer/index.js';
import type { AnalyzerConfig } from './analyzer/index.js';

const VALID_MODULES = [
  'architecture', 'business', 'flow', 'api', 'structure',
  'ops', 'pitfall', 'quickstart', 'ai-memory',
];

function createProgram(): Command {
  const program = new Command();

  program
    .name('project-analyzer')
    .description('自动化项目分析工具 — 生成结构化 Markdown 报告和 AI 知识库')
    .version(version, '-v, --version')
    .argument('<path>', '项目根目录路径')
    .option('-o, --output <dir>', '输出目录', './analysis-reports/')
    .option('-m, --modules <list>', '逗号分隔的分析模块列表')
    .option('-l, --lang <language>', '覆盖自动检测的语言')
    .action(async (projectPath: string, options: { output: string; modules?: string; lang?: string }) => {
      await runAnalysis(projectPath, options);
    });

  program.exitOverride();

  return program;
}

async function runAnalysis(
  projectPath: string,
  options: { output: string; modules?: string; lang?: string },
): Promise<void> {
  const resolvedPath = path.resolve(projectPath);

  // Parse and validate --modules
  let modules: string[] = [];
  if (options.modules) {
    modules = options.modules.split(',').map(m => m.trim()).filter(Boolean);
    const invalid = modules.filter(m => !VALID_MODULES.includes(m));
    if (invalid.length > 0) {
      console.error(`错误: 未知的分析模块: ${invalid.join(', ')}`);
      console.error(`可用模块: ${VALID_MODULES.join(', ')}`);
      process.exit(2);
    }
  }

  const config: AnalyzerConfig = {
    projectPath: resolvedPath,
    outputDir: path.resolve(options.output),
    modules,
    lang: options.lang,
  };

  console.log(`\n🔍 Project Analyzer v${version}`);
  console.log(`   项目路径: ${config.projectPath}`);
  console.log(`   输出目录: ${config.outputDir}`);
  if (modules.length > 0) {
    console.log(`   分析模块: ${modules.join(', ')}`);
  } else {
    console.log(`   分析模块: 全部`);
  }
  console.log('');

  const startTime = Date.now();

  const analyzer = new ProjectAnalyzer((message) => {
    console.log(`  ⏳ ${message}`);
  });

  try {
    const result = await analyzer.run(config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Print warnings
    for (const w of result.warnings) {
      console.warn(`  ⚠️  ${w.message}`);
    }

    // Print errors (non-fatal, since we got here)
    for (const e of result.errors) {
      console.error(`  ❌ ${e.message}`);
    }

    // Summary
    console.log('');
    console.log(`✅ 分析完成 (${elapsed}s)`);
    console.log(`   项目名称: ${result.report.profile.projectName}`);
    console.log(`   主要语言: ${result.report.profile.primaryLanguage}`);
    console.log(`   报告索引: ${result.reportFiles.indexFile}`);
    console.log(`   报告文件: ${result.reportFiles.reportFiles.length} 个`);

    if (result.errors.length > 0) {
      console.log(`   ⚠️  ${result.errors.length} 个模块出现错误（已降级处理）`);
    }

    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 分析失败: ${message}`);
    process.exit(1);
  }
}

// ── Main ──

const program = createProgram();

try {
  await program.parseAsync(process.argv);
} catch (err: unknown) {
  // Commander throws on --help, --version, and parse errors
  if (err && typeof err === 'object' && 'exitCode' in err) {
    const exitCode = (err as { exitCode: number }).exitCode;
    process.exit(exitCode === 0 ? 0 : 2);
  }
  console.error('错误: 命令行参数解析失败');
  program.outputHelp();
  process.exit(2);
}
