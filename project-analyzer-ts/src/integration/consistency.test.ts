/**
 * Dual-version consistency integration test.
 *
 * Runs both the Java and TypeScript analyzers on the same sample project,
 * then compares the structural consistency of their outputs:
 *   - Same set of output files
 *   - Same top-level (H1) section headers in each Markdown report
 *   - Same required H2 section headers (optional/conditional sections may differ)
 *   - Same ai-memory.json top-level keys
 *   - Same number of report links in README.md
 *
 * Validates: Requirements 14.1, 14.2, 14.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_DIR = path.join(WORKSPACE_ROOT, 'test-fixtures', 'sample-java-project');
const TS_OUTPUT = path.join(WORKSPACE_ROOT, 'test-output-ts');
const JAVA_OUTPUT = path.join(WORKSPACE_ROOT, 'test-output-java');

const JAVA_HOME = String.raw`C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot`;
const MAVEN_BIN = String.raw`C:\tools\apache-maven-3.9.9\bin`;

/**
 * Required H2 sections per report file. These MUST appear in both versions.
 * Sections that are conditionally rendered (e.g. 接口速查表 depends on API
 * detection) are intentionally excluded — they are checked separately.
 */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  '01-project-overview.md': ['# 项目概览', '## 基本信息', '## 语言统计', '## 文件统计', '## 子模块列表'],
  '02-architecture.md': ['# 技术架构分析', '## 核心框架与技术', '## 依赖清单', '## 分层结构'],
  '03-business.md': ['# 业务功能分析', '## 业务模块', '## 数据模型'],
  '04-flows.md': ['# 主要流程分析', '## 入口点列表', '## 流程详情'],
  '05-apis.md': ['# 接口路径分析', '## 接口统计', '## 接口列表'],
  '06-structure.md': ['# 项目结构地图', '## 目录树', '## 模块关系图'],
  '07-ops.md': ['# 启动/部署/配置说明书', '## 启动方式', '## 容器化部署', '## 配置项清单', '## 外部依赖服务'],
  '08-pitfalls.md': ['# 坑点笔记', '## 统计摘要', '## 坑点详情'],
  '09-quickstart.md': ['# 接手速查手册', '## 5 分钟速览', '## 开发环境搭建', '## 核心业务速览', '## 注意事项'],
  'ai-context.md': ['# AI 上下文摘要', '## 项目元数据', '## 模块概览', '## 术语表', '## 代码导航'],
  'README.md': ['# 项目分析报告索引', '## 报告列表'],
};

/** Extract # and ## section headers from a Markdown string. */
function extractSectionHeaders(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => /^#{1,2}\s/.test(line))
    .map((line) => line.trim());
}

/** List filenames (not full paths) in a directory. */
function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort();
}

/** Count Markdown links that point to .md or .json files. */
function countReportLinks(readme: string): number {
  const matches = readme.match(/\[.*?\]\(.*?\.(md|json)\)/g);
  return matches ? matches.length : 0;
}

describe('Dual-version consistency', () => {
  beforeAll(() => {
    // Clean output directories
    if (fs.existsSync(TS_OUTPUT)) {
      fs.rmSync(TS_OUTPUT, { recursive: true });
    }
    if (fs.existsSync(JAVA_OUTPUT)) {
      fs.rmSync(JAVA_OUTPUT, { recursive: true });
    }

    // Run TypeScript version
    execSync(`npx tsx src/cli.ts "${FIXTURE_DIR}" -o "${TS_OUTPUT}"`, {
      cwd: path.join(WORKSPACE_ROOT, 'project-analyzer-ts'),
      timeout: 60_000,
      stdio: 'pipe',
    });

    // Run Java version
    const javaJar = path.join(
      WORKSPACE_ROOT,
      'project-analyzer-java',
      'target',
      'project-analyzer-java-0.1.0.jar',
    );
    const envPath = `${JAVA_HOME}\\bin;${MAVEN_BIN};${process.env.PATH}`;
    execSync(`java -jar "${javaJar}" "${FIXTURE_DIR}" -o "${JAVA_OUTPUT}"`, {
      cwd: path.join(WORKSPACE_ROOT, 'project-analyzer-java'),
      timeout: 60_000,
      stdio: 'pipe',
      env: { ...process.env, JAVA_HOME, PATH: envPath },
    });
  }, 120_000);

  it('should produce the same set of output files', () => {
    const tsFiles = listFiles(TS_OUTPUT);
    const javaFiles = listFiles(JAVA_OUTPUT);
    expect(tsFiles).toEqual(javaFiles);
  });

  it('should have all required section headers in both versions', () => {
    const missing: string[] = [];

    for (const [file, requiredHeaders] of Object.entries(REQUIRED_SECTIONS)) {
      const tsContent = fs.readFileSync(path.join(TS_OUTPUT, file), 'utf-8');
      const javaContent = fs.readFileSync(path.join(JAVA_OUTPUT, file), 'utf-8');

      const tsHeaders = extractSectionHeaders(tsContent);
      const javaHeaders = extractSectionHeaders(javaContent);

      for (const header of requiredHeaders) {
        if (!tsHeaders.includes(header)) {
          missing.push(`TS ${file} missing: "${header}"`);
        }
        if (!javaHeaders.includes(header)) {
          missing.push(`Java ${file} missing: "${header}"`);
        }
      }
    }

    expect(missing, `Missing required sections:\n${missing.join('\n')}`).toHaveLength(0);
  });

  it('should have the same H1 title in each report', () => {
    const tsFiles = listFiles(TS_OUTPUT).filter((f) => f.endsWith('.md'));
    const diffs: string[] = [];

    for (const file of tsFiles) {
      const tsContent = fs.readFileSync(path.join(TS_OUTPUT, file), 'utf-8');
      const javaContent = fs.readFileSync(path.join(JAVA_OUTPUT, file), 'utf-8');

      const tsH1 = extractSectionHeaders(tsContent).filter((h) => h.startsWith('# ') && !h.startsWith('## '));
      const javaH1 = extractSectionHeaders(javaContent).filter((h) => h.startsWith('# ') && !h.startsWith('## '));

      if (JSON.stringify(tsH1) !== JSON.stringify(javaH1)) {
        diffs.push(`${file}: TS=${JSON.stringify(tsH1)} Java=${JSON.stringify(javaH1)}`);
      }
    }

    expect(diffs, `H1 title differences:\n${diffs.join('\n')}`).toHaveLength(0);
  });

  it('should have the same top-level keys in ai-memory.json', () => {
    const tsJson = JSON.parse(fs.readFileSync(path.join(TS_OUTPUT, 'ai-memory.json'), 'utf-8'));
    const javaJson = JSON.parse(fs.readFileSync(path.join(JAVA_OUTPUT, 'ai-memory.json'), 'utf-8'));

    const tsKeys = Object.keys(tsJson).sort();
    const javaKeys = Object.keys(javaJson).sort();

    expect(tsKeys).toEqual(javaKeys);
  });

  it('should have the same number of report links in README.md', () => {
    const tsReadme = fs.readFileSync(path.join(TS_OUTPUT, 'README.md'), 'utf-8');
    const javaReadme = fs.readFileSync(path.join(JAVA_OUTPUT, 'README.md'), 'utf-8');

    const tsLinkCount = countReportLinks(tsReadme);
    const javaLinkCount = countReportLinks(javaReadme);

    expect(tsLinkCount).toBeGreaterThan(0);
    expect(tsLinkCount).toEqual(javaLinkCount);
  });

  it('should have matching ai-memory.json projectMeta keys', () => {
    const tsJson = JSON.parse(fs.readFileSync(path.join(TS_OUTPUT, 'ai-memory.json'), 'utf-8'));
    const javaJson = JSON.parse(fs.readFileSync(path.join(JAVA_OUTPUT, 'ai-memory.json'), 'utf-8'));

    const tsMetaKeys = Object.keys(tsJson.projectMeta ?? {}).sort();
    const javaMetaKeys = Object.keys(javaJson.projectMeta ?? {}).sort();

    expect(tsMetaKeys).toEqual(javaMetaKeys);
  });
});
