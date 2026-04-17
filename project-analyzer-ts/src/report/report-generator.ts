/**
 * ReportGenerator — 报告生成器
 *
 * 将 AnalysisReport 转换为 Markdown 报告文件集合，输出到指定目录。
 * 每份报告包含通用头部（项目名称、生成时间、分析工具版本）。
 * 模块未产生有效结果时在报告中说明原因。
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnalysisReport,
  ReportMetadata,
  ArchitectureResult,
  BusinessResult,
  FlowResult,
  ApiResult,
  StructureResult,
  DirectoryNode,
  OpsResult,
  PitfallResult,
  QuickstartResult,
  AiMemoryResult,
} from '../models/index.js';

/** Paths returned after generation. */
export interface ReportFiles {
  indexFile: string;
  reportFiles: string[];
}

const NO_DATA_MSG = '该模块未产生有效结果';
const DEFAULT_OUTPUT_DIR = 'analysis-reports';

/**
 * Build the standard Markdown header shared by every report.
 */
function buildHeader(title: string, meta: ReportMetadata): string {
  return [
    `# ${title}`,
    '',
    `> 项目名称: ${meta.projectName}`,
    `> 生成时间: ${meta.generatedAt}`,
    `> 分析工具: Project Analyzer ${meta.analyzerType} v${meta.analyzerVersion}`,
    '',
    '---',
    '',
  ].join('\n');
}

// ─── Individual report renderers ───

function renderProjectOverview(report: AnalysisReport): string {
  const md: string[] = [buildHeader('项目概览', report.metadata)];
  const p = report.profile;

  md.push('## 基本信息\n');
  md.push(`- 项目名称: ${p.projectName}`);
  md.push(`- 项目路径: ${p.projectPath}`);
  md.push(`- 主要语言: ${p.primaryLanguage}`);
  md.push(`- 构建工具: ${p.buildTool}`);

  md.push('\n## 语言统计\n');
  md.push('| 语言 | 文件数 | 代码行数 | 占比 |');
  md.push('|------|--------|----------|------|');
  for (const lang of p.languages) {
    md.push(`| ${lang.language} | ${lang.fileCount} | ${lang.lineCount} | ${lang.percentage}% |`);
  }

  md.push('\n## 文件统计\n');
  md.push(`- 总文件数: ${p.fileStats.totalFiles}`);
  md.push(`- 源码文件: ${p.fileStats.sourceFiles}`);
  md.push(`- 测试文件: ${p.fileStats.testFiles}`);
  md.push(`- 配置文件: ${p.fileStats.configFiles}`);
  md.push(`- 总代码行数: ${p.fileStats.totalLines}`);

  md.push('\n## 子模块列表\n');
  if (p.modules.length === 0) {
    md.push('无子模块。');
  } else {
    md.push('| 模块名 | 路径 | 语言 | 构建工具 |');
    md.push('|--------|------|------|----------|');
    for (const m of p.modules) {
      md.push(`| ${m.name} | ${m.path} | ${m.language} | ${m.buildTool} |`);
    }
  }
  md.push('');
  return md.join('\n');
}

function renderArchitecture(report: AnalysisReport): string {
  const md: string[] = [buildHeader('技术架构分析', report.metadata)];
  const arch = report.architecture;
  if (!arch) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 核心框架与技术\n');
  if (arch.frameworks.length === 0) {
    md.push('未识别到核心框架。\n');
  } else {
    md.push('| 框架 | 版本 | 类别 | 识别依据 |');
    md.push('|------|------|------|----------|');
    for (const f of arch.frameworks) {
      md.push(`| ${f.name} | ${f.version ?? '-'} | ${f.category} | ${f.evidence.join(', ')} |`);
    }
  }

  md.push('\n## 依赖清单\n');
  const groups = arch.dependencyGroups;
  const cats = Object.keys(groups) as (keyof typeof groups)[];
  if (cats.length === 0) {
    md.push('未检测到依赖。\n');
  } else {
    for (const cat of cats) {
      const deps = groups[cat];
      if (!deps || deps.length === 0) continue;
      md.push(`### ${cat}\n`);
      md.push('| 依赖名 | 版本 | 作用域 |');
      md.push('|--------|------|--------|');
      for (const d of deps) {
        md.push(`| ${d.name} | ${d.version} | ${d.scope} |`);
      }
      md.push('');
    }
  }

  md.push('## 分层结构\n');
  if (arch.layers.length === 0) {
    md.push('未识别到分层结构。\n');
  } else {
    md.push('| 层级 | 匹配模式 | 包含类/文件数 |');
    md.push('|------|----------|---------------|');
    for (const l of arch.layers) {
      md.push(`| ${l.name} | ${l.pattern} | ${l.classes.length + l.files.length} |`);
    }
  }

  if (arch.moduleDependencyGraph) {
    md.push('\n## 模块依赖图\n');
    md.push('```mermaid');
    md.push(arch.moduleDependencyGraph.syntax);
    md.push('```');
  }
  md.push('');
  return md.join('\n');
}

function renderBusiness(report: AnalysisReport): string {
  const md: string[] = [buildHeader('业务功能分析', report.metadata)];
  const biz = report.business;
  if (!biz) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 业务模块\n');
  if (biz.modules.length === 0) {
    md.push('未识别到业务模块。\n');
  } else {
    for (const m of biz.modules) {
      md.push(`### ${m.name}\n`);
      md.push(`- 功能描述: ${m.description}`);
      md.push(`- 关键类/文件: ${m.keyFiles.join(', ') || '-'}`);
      md.push(`- 依赖模块: ${m.dependencies.join(', ') || '-'}`);
      md.push('');
    }
  }

  md.push('## 数据模型\n');
  if (biz.dataModels.length === 0) {
    md.push('未检测到数据模型。\n');
  } else {
    for (const dm of biz.dataModels) {
      md.push(`### ${dm.name}\n`);
      md.push('| 字段名 | 类型 | 注解 | 说明 |');
      md.push('|--------|------|------|------|');
      for (const f of dm.fields) {
        md.push(`| ${f.name} | ${f.type} | ${f.annotations.join(', ') || '-'} | ${f.description ?? '-'} |`);
      }
      md.push('');
    }
  }
  return md.join('\n');
}

function renderFlows(report: AnalysisReport): string {
  const md: string[] = [buildHeader('主要流程分析', report.metadata)];
  const flows = report.flows;
  if (!flows) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 入口点列表\n');
  if (flows.entryPoints.length === 0) {
    md.push('未识别到入口点。\n');
  } else {
    md.push('| 类型 | 类名 | 方法名 | 文件 | HTTP 路径 |');
    md.push('|------|------|--------|------|-----------|');
    for (const ep of flows.entryPoints) {
      md.push(`| ${ep.type} | ${ep.className} | ${ep.methodName} | ${ep.filePath} | ${ep.httpPath ?? '-'} |`);
    }
  }

  md.push('\n## 流程详情\n');
  if (flows.flows.length === 0) {
    md.push('未生成流程详情。\n');
  } else {
    for (const f of flows.flows) {
      md.push(`### ${f.description}\n`);
      md.push('调用链:');
      for (const step of f.callChain) {
        const ext = step.isExternal ? ' [外部依赖]' : '';
        md.push(`${step.depth}. ${step.className}.${step.methodName} (depth=${step.depth})${ext}`);
      }
      md.push('');
    }
  }
  return md.join('\n');
}

function renderApis(report: AnalysisReport): string {
  const md: string[] = [buildHeader('接口路径分析', report.metadata)];
  const apis = report.apis;
  if (!apis) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 接口统计\n');
  md.push(`- 总接口数: ${apis.totalCount}\n`);

  md.push('## 接口列表\n');
  if (apis.groups.length === 0) {
    md.push('未检测到接口分组。\n');
  } else {
    for (const g of apis.groups) {
      const base = g.basePath ? ` (${g.basePath})` : '';
      md.push(`### ${g.name}${base}\n`);
      md.push('| 路径 | 方法 | 参数 | 响应类型 | 描述 |');
      md.push('|------|------|------|----------|------|');
      for (const ep of g.endpoints) {
        const params = ep.parameters.map(p => `${p.name}:${p.type}`).join(', ') || '-';
        md.push(`| ${ep.path} | ${ep.method} | ${params} | ${ep.responseType ?? '-'} | ${ep.description ?? '-'} |`);
      }
      md.push('');
    }
  }
  return md.join('\n');
}

function renderDirectoryTree(node: DirectoryNode, prefix: string = ''): string {
  const lines: string[] = [];
  const annotation = node.annotation ? ` — ${node.annotation}` : '';
  const count = node.type === 'directory' ? ` (${node.fileCount} files)` : '';
  lines.push(`${prefix}${node.name}${count}${annotation}`);

  if (node.type === 'directory' && !node.isCollapsed) {
    for (const child of node.children) {
      lines.push(renderDirectoryTree(child, prefix + '  '));
    }
  }
  return lines.join('\n');
}

function renderStructure(report: AnalysisReport): string {
  const md: string[] = [buildHeader('项目结构地图', report.metadata)];
  const st = report.structure;
  if (!st) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 目录树\n');
  md.push('```');
  md.push(renderDirectoryTree(st.directoryTree));
  md.push('```\n');

  if (st.moduleDiagram) {
    md.push('## 模块关系图\n');
    md.push('```mermaid');
    md.push(st.moduleDiagram.syntax);
    md.push('```\n');
  }

  if (st.subModuleDependencies) {
    md.push('## 子模块依赖图\n');
    md.push('```mermaid');
    md.push(st.subModuleDependencies.syntax);
    md.push('```\n');
  }
  return md.join('\n');
}

function renderOps(report: AnalysisReport): string {
  const md: string[] = [buildHeader('启动/部署/配置说明书', report.metadata)];
  const ops = report.ops;
  if (!ops) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 启动方式\n');
  if (ops.startup.length === 0) {
    md.push('未识别到启动方式。\n');
  } else {
    for (const s of ops.startup) {
      const inferred = s.isInferred ? ' (推断结果)' : '';
      md.push(`### ${s.method}${inferred}\n`);
      md.push(`- 命令: ${s.command}`);
      md.push(`- 说明: ${s.description}`);
      md.push(`- 来源: ${s.filePath}`);
      md.push('');
    }
  }

  if (ops.containers && ops.containers.length > 0) {
    md.push('## 容器化部署\n');
    for (const c of ops.containers) {
      md.push(`### ${c.type}\n`);
      if (c.baseImage) md.push(`- 基础镜像: ${c.baseImage}`);
      md.push(`- 端口: ${c.ports.join(', ') || '-'}`);
      md.push(`- 卷挂载: ${c.volumes.join(', ') || '-'}`);
      md.push(`- 环境变量: ${c.envVars.join(', ') || '-'}`);
      if (c.services) md.push(`- 服务: ${c.services.join(', ')}`);
      md.push(`- 说明: ${c.description}`);
      md.push('');
    }
  }

  if (ops.cicd && ops.cicd.length > 0) {
    md.push('## CI/CD 流水线\n');
    for (const ci of ops.cicd) {
      md.push(`### ${ci.type}\n`);
      md.push('| 阶段 | 步骤 | 触发条件 |');
      md.push('|------|------|----------|');
      for (const stage of ci.stages) {
        const triggers = stage.triggers?.join(', ') ?? '-';
        md.push(`| ${stage.name} | ${stage.steps.join(', ')} | ${triggers} |`);
      }
      md.push('');
    }
  }

  md.push('## 配置项清单\n');
  if (ops.configItems.length === 0) {
    md.push('未检测到配置项。\n');
  } else {
    md.push('| 配置项 | 默认值 | 说明 | 必填 | 来源 |');
    md.push('|--------|--------|------|------|------|');
    for (const ci of ops.configItems) {
      md.push(`| ${ci.key} | ${ci.defaultValue ?? '-'} | ${ci.description} | ${ci.required ? '是' : '否'} | ${ci.source} |`);
    }
  }

  md.push('\n## 外部依赖服务\n');
  if (ops.externalServices.length === 0) {
    md.push('未检测到外部依赖服务。\n');
  } else {
    md.push('| 服务名 | 类型 | 识别依据 | 连接配置 |');
    md.push('|--------|------|----------|----------|');
    for (const es of ops.externalServices) {
      md.push(`| ${es.name} | ${es.type} | ${es.evidence.join(', ')} | ${es.connectionConfig ?? '-'} |`);
    }
  }

  if (ops.envComparison) {
    md.push('\n## 环境配置对照表\n');
    const envs = ops.envComparison.environments;
    md.push(`| 配置项 | ${envs.join(' | ')} | 差异 |`);
    md.push(`|--------|${envs.map(() => '------').join('|')}|------|`);
    for (const item of ops.envComparison.items) {
      const vals = envs.map(e => item.values[e] ?? '-').join(' | ');
      md.push(`| ${item.key} | ${vals} | ${item.isDifferent ? '是' : '否'} |`);
    }
  }
  md.push('');
  return md.join('\n');
}

function renderPitfalls(report: AnalysisReport): string {
  const md: string[] = [buildHeader('坑点笔记', report.metadata)];
  const pit = report.pitfalls;
  if (!pit) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 统计摘要\n');
  const byCat = pit.summary.byCategory;
  const bySev = pit.summary.bySeverity;
  md.push(`- 总计: ${pit.summary.total}`);
  md.push(`- 高: ${bySev.high ?? 0}, 中: ${bySev.medium ?? 0}, 低: ${bySev.low ?? 0}\n`);

  md.push('| 类别 | 数量 |');
  md.push('|------|------|');
  for (const [cat, count] of Object.entries(byCat)) {
    if (count > 0) md.push(`| ${cat} | ${count} |`);
  }

  md.push('\n## 坑点详情\n');
  if (pit.records.length === 0) {
    md.push('未检测到坑点。\n');
  } else {
    for (const r of pit.records) {
      const loc = r.line != null ? `${r.filePath}:${r.line}` : r.filePath;
      md.push(`### [${r.severity}] ${r.category}: ${r.description}\n`);
      md.push(`- 文件: ${loc}`);
      md.push(`- 建议: ${r.suggestion}`);
      md.push('');
    }
  }
  return md.join('\n');
}

function renderQuickstart(report: AnalysisReport): string {
  const md: string[] = [buildHeader('接手速查手册', report.metadata)];
  const qs = report.quickstart;
  if (!qs) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  md.push('## 5 分钟速览\n');
  md.push(`- 项目用途: ${qs.fiveMinuteOverview.purpose}`);
  md.push(`- 技术栈: ${qs.fiveMinuteOverview.techStack.join(', ')}`);
  md.push(`- 核心模块: ${qs.fiveMinuteOverview.coreModules.join(', ')}`);
  md.push(`- 启动方式: ${qs.fiveMinuteOverview.startupCommand}`);

  md.push('\n## 开发环境搭建\n');
  for (let i = 0; i < qs.devSetupSteps.length; i++) {
    md.push(`${i + 1}. ${qs.devSetupSteps[i]}`);
  }

  md.push('\n## 核心业务速览\n');
  md.push('| 模块 | 功能描述 | 关键文件 | 相关接口 |');
  md.push('|------|----------|----------|----------|');
  for (const b of qs.businessOverview) {
    md.push(`| ${b.moduleName} | ${b.description} | ${b.keyFiles.join(', ') || '-'} | ${b.relatedApis.join(', ') || '-'} |`);
  }

  md.push('\n## 注意事项\n');
  if (qs.warnings.length === 0) {
    md.push('无高严重程度的坑点。\n');
  } else {
    for (const w of qs.warnings) {
      md.push(`- **[${w.severity}]** ${w.description} (${w.filePath})`);
    }
  }

  if (qs.apiQuickRef && qs.apiQuickRef.length > 0) {
    md.push('\n## 接口速查表\n');
    md.push('| 路径 | 方法 | 功能描述 |');
    md.push('|------|------|----------|');
    for (const a of qs.apiQuickRef) {
      md.push(`| ${a.path} | ${a.method} | ${a.description} |`);
    }
  }
  md.push('');
  return md.join('\n');
}

function renderAiContext(report: AnalysisReport): string {
  const md: string[] = [buildHeader('AI 上下文摘要', report.metadata)];
  const mem = report.aiMemory;
  if (!mem) { md.push(NO_DATA_MSG + '\n'); return md.join('\n'); }

  const data = mem.memoryData;
  md.push('## 项目元数据\n');
  md.push(`- 名称: ${data.projectMeta.name}`);
  md.push(`- 语言: ${data.projectMeta.language}`);
  md.push(`- 框架: ${data.projectMeta.framework}`);
  md.push(`- 构建工具: ${data.projectMeta.buildTool}`);

  md.push('\n## 模块概览\n');
  for (const m of data.modules) {
    md.push(`### ${m.name}\n`);
    md.push(`${m.purpose}\n`);
    for (const cls of m.coreClasses) {
      md.push(`- **${cls.name}**: ${cls.publicMethods.join(', ')}`);
    }
    md.push('');
  }

  if (data.apis.length > 0) {
    md.push('## 接口摘要\n');
    md.push('| 路径 | 方法 | 描述 | 所属模块 |');
    md.push('|------|------|------|----------|');
    for (const a of data.apis) {
      md.push(`| ${a.path} | ${a.method} | ${a.description} | ${a.relatedModule} |`);
    }
  }

  if (data.glossary.length > 0) {
    md.push('\n## 术语表\n');
    md.push('| 术语 | 定义 | 相关代码 |');
    md.push('|------|------|----------|');
    for (const g of data.glossary) {
      md.push(`| ${g.term} | ${g.definition} | ${g.relatedCode.join(', ')} |`);
    }
  }

  if (data.codeNavigation.length > 0) {
    md.push('\n## 代码导航\n');
    md.push('| 功能 | 文件 | 方法 |');
    md.push('|------|------|------|');
    for (const nav of data.codeNavigation) {
      md.push(`| ${nav.feature} | ${nav.files.join(', ')} | ${nav.methods.join(', ')} |`);
    }
  }
  md.push('');
  return md.join('\n');
}

// ─── README index ───

function renderReadme(report: AnalysisReport, files: { name: string; title: string }[]): string {
  const md: string[] = [buildHeader('项目分析报告索引', report.metadata)];
  md.push('## 报告列表\n');
  md.push('| 报告 | 文件 | 说明 |');
  md.push('|------|------|------|');
  for (const f of files) {
    md.push(`| ${f.title} | [${f.name}](./${f.name}) | ${f.title} |`);
  }
  md.push('');
  return md.join('\n');
}

// ─── CLAUDE.md renderer (Claude Code context) ───

function renderClaudeMd(report: AnalysisReport): string {
  const md: string[] = [];
  const p = report.profile;

  // Project overview (1-2 lines)
  const frameworks = report.architecture?.frameworks?.map(f => f.name).join(', ') || '';
  const techDesc = frameworks ? ` (${frameworks})` : '';
  md.push(`# ${p.projectName}`);
  md.push('');
  md.push(`${p.primaryLanguage} project${techDesc}, built with ${p.buildTool}.`);
  if (p.fileStats) {
    md.push(`${p.fileStats.sourceFiles} source files, ${p.fileStats.totalLines} lines of code.`);
  }
  md.push('');

  // Commands
  md.push('## Commands');
  md.push('');
  md.push('```bash');
  const ops = report.ops;
  if (ops && ops.startup.length > 0) {
    for (const s of ops.startup.slice(0, 5)) {
      const comment = s.description ? `  # ${s.description}` : '';
      md.push(`${s.command}${comment}`);
    }
  } else {
    // Infer from build tool
    switch (p.buildTool) {
      case 'npm': case 'yarn': case 'pnpm':
        md.push(`${p.buildTool} install`);
        md.push(`${p.buildTool} run build`);
        md.push(`${p.buildTool} test`);
        break;
      case 'maven':
        md.push('mvn install');
        md.push('mvn test');
        break;
      case 'gradle':
        md.push('./gradlew build');
        md.push('./gradlew test');
        break;
      case 'pip':
        md.push('pip install -r requirements.txt');
        md.push('pytest');
        break;
      case 'poetry':
        md.push('poetry install');
        md.push('poetry run pytest');
        break;
      case 'go-mod':
        md.push('go mod download');
        md.push('go build ./...');
        md.push('go test ./...');
        break;
      default:
        md.push('# No build commands detected');
    }
  }
  md.push('```');
  md.push('');

  // Project structure
  md.push('## Project Structure');
  md.push('');
  md.push('```');
  const modules = report.business?.modules;
  if (modules && modules.length > 0) {
    for (const m of modules) {
      const desc = m.description && !m.description.includes('inferred from directory')
        ? ` — ${m.description}`
        : '';
      md.push(`${m.path}/${desc}`);
    }
  } else {
    // Fallback: show layers
    const layers = report.architecture?.layers;
    if (layers && layers.length > 0) {
      for (const l of layers) {
        md.push(`${l.pattern}  # ${l.name} (${l.files.length} files)`);
      }
    } else {
      md.push(`src/  # Source code`);
    }
  }
  md.push('```');
  md.push('');

  // Tech stack
  if (report.architecture?.frameworks && report.architecture.frameworks.length > 0) {
    md.push('## Tech Stack');
    md.push('');
    for (const f of report.architecture.frameworks) {
      const ver = f.version ? ` ${f.version}` : '';
      md.push(`- ${f.name}${ver} (${f.category})`);
    }
    md.push('');
  }

  // Key dependencies
  if (report.architecture?.dependencies && report.architecture.dependencies.length > 0) {
    const keyDeps = report.architecture.dependencies
      .filter(d => d.scope !== 'test' && d.category !== 'other' && d.category !== 'utility')
      .slice(0, 15);
    if (keyDeps.length > 0) {
      md.push('## Key Dependencies');
      md.push('');
      for (const d of keyDeps) {
        md.push(`- ${d.name} ${d.version} (${d.category})`);
      }
      md.push('');
    }
  }

  // API endpoints (compact table)
  if (report.apis?.endpoints && report.apis.endpoints.length > 0) {
    md.push('## API Endpoints');
    md.push('');
    const eps = report.apis.endpoints.slice(0, 30);
    for (const ep of eps) {
      const desc = ep.description ? ` — ${ep.description}` : '';
      md.push(`- \`${ep.method} ${ep.path}\`${desc}`);
    }
    if (report.apis.endpoints.length > 30) {
      md.push(`- ... and ${report.apis.endpoints.length - 30} more`);
    }
    md.push('');
  }

  // Warnings (high severity pitfalls only)
  const highPitfalls = report.pitfalls?.records?.filter(r => r.severity === 'high') ?? [];
  if (highPitfalls.length > 0) {
    md.push('## Known Issues');
    md.push('');
    for (const p of highPitfalls.slice(0, 10)) {
      md.push(`- ⚠️ ${p.description} (${p.filePath})`);
    }
    md.push('');
  }

  // Code navigation
  if (modules && modules.length > 0) {
    md.push('## Code Navigation');
    md.push('');
    md.push('| Feature | Key Files |');
    md.push('|---------|-----------|');
    for (const m of modules.slice(0, 15)) {
      const files = m.keyFiles.slice(0, 3).map(f => {
        // Use relative paths
        const rel = f.replace(/\\/g, '/');
        const parts = rel.split('/');
        return parts.length > 3 ? parts.slice(-3).join('/') : rel;
      }).join(', ');
      md.push(`| ${m.name} | ${files} |`);
    }
    md.push('');
  }

  // External services
  if (report.ops?.externalServices && report.ops.externalServices.length > 0) {
    md.push('## External Services');
    md.push('');
    for (const svc of report.ops.externalServices) {
      md.push(`- ${svc.name} (${svc.type})`);
    }
    md.push('');
  }

  // Config items (important ones only)
  if (report.ops?.configItems && report.ops.configItems.length > 0) {
    const required = report.ops.configItems.filter(c => c.required);
    if (required.length > 0) {
      md.push('## Required Configuration');
      md.push('');
      for (const c of required.slice(0, 15)) {
        const val = c.defaultValue ? ` (default: ${c.defaultValue})` : '';
        md.push(`- \`${c.key}\`${val} — ${c.description}`);
      }
      md.push('');
    }
  }

  return md.join('\n');
}

// ─── Public API ───

/** File descriptors for all generated reports. */
const REPORT_DESCRIPTORS: { name: string; title: string; render: (r: AnalysisReport) => string }[] = [
  { name: '01-项目概览.md', title: '项目概览', render: renderProjectOverview },
  { name: '02-技术架构.md', title: '技术架构分析', render: renderArchitecture },
  { name: '03-业务功能.md', title: '业务功能分析', render: renderBusiness },
  { name: '04-主要流程.md', title: '主要流程分析', render: renderFlows },
  { name: '05-接口路径.md', title: '接口路径分析', render: renderApis },
  { name: '06-项目结构地图.md', title: '项目结构地图', render: renderStructure },
  { name: '07-启动部署配置.md', title: '启动/部署/配置说明书', render: renderOps },
  { name: '08-坑点笔记.md', title: '坑点笔记', render: renderPitfalls },
  { name: '09-接手速查手册.md', title: '接手速查手册', render: renderQuickstart },
  { name: 'AI上下文摘要.md', title: 'AI 上下文摘要', render: renderAiContext },
];

export class ReportGenerator {
  /**
   * Generate all report files into `outputDir`.
   * Creates the directory if it does not exist.
   * Returns paths of all generated files.
   */
  async generate(report: AnalysisReport, outputDir?: string): Promise<ReportFiles> {
    const dir = outputDir || DEFAULT_OUTPUT_DIR;

    // Ensure output directory exists (recursive)
    await mkdir(dir, { recursive: true });

    const writtenFiles: string[] = [];

    // Write each Markdown report
    for (const desc of REPORT_DESCRIPTORS) {
      const content = desc.render(report);
      const filePath = join(dir, desc.name);
      await writeFile(filePath, content, 'utf-8');
      writtenFiles.push(filePath);
    }

    // Write ai-memory.json
    const aiJsonPath = join(dir, 'AI知识库.json');
    const aiJsonContent = report.aiMemory
      ? JSON.stringify(report.aiMemory.memoryData, null, 2)
      : JSON.stringify({ error: NO_DATA_MSG }, null, 2);
    await writeFile(aiJsonPath, aiJsonContent, 'utf-8');
    writtenFiles.push(aiJsonPath);

    // Write CLAUDE.md (Claude Code context file)
    const claudeMdPath = join(dir, 'CLAUDE.md');
    const claudeMdContent = renderClaudeMd(report);
    await writeFile(claudeMdPath, claudeMdContent, 'utf-8');
    writtenFiles.push(claudeMdPath);

    // Write README.md index
    const allFileDescriptors = [
      ...REPORT_DESCRIPTORS.map(d => ({ name: d.name, title: d.title })),
      { name: 'AI知识库.json', title: 'AI 项目记忆 (JSON)' },
      { name: 'CLAUDE.md', title: 'Claude Code 项目上下文' },
    ];
    const readmeContent = renderReadme(report, allFileDescriptors);
    const readmePath = join(dir, '报告索引.md');
    await writeFile(readmePath, readmeContent, 'utf-8');

    return {
      indexFile: readmePath,
      reportFiles: writtenFiles,
    };
  }
}
