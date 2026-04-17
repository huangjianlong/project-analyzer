package com.analyzer.report;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

public class ReportGenerator {

    private static final String NO_DATA_MSG = "该模块未产生有效结果";
    private static final String DEFAULT_OUTPUT_DIR = "analysis-reports";

    public ReportFiles generate(AnalysisReport report, String outputDir) throws IOException {
        String dir = outputDir != null ? outputDir : DEFAULT_OUTPUT_DIR;
        Files.createDirectories(Path.of(dir));

        List<String> writtenFiles = new ArrayList<>();

        record Desc(String name, String title, java.util.function.Function<AnalysisReport, String> render) {}
        List<Desc> descriptors = List.of(
                new Desc("01-项目概览.md", "项目概览", ReportGenerator::renderProjectOverview),
                new Desc("02-技术架构.md", "技术架构分析", ReportGenerator::renderArchitecture),
                new Desc("03-业务功能.md", "业务功能分析", ReportGenerator::renderBusiness),
                new Desc("04-主要流程.md", "主要流程分析", ReportGenerator::renderFlows),
                new Desc("05-接口路径.md", "接口路径分析", ReportGenerator::renderApis),
                new Desc("06-项目结构地图.md", "项目结构地图", ReportGenerator::renderStructure),
                new Desc("07-启动部署配置.md", "启动/部署/配置说明书", ReportGenerator::renderOps),
                new Desc("08-坑点笔记.md", "坑点笔记", ReportGenerator::renderPitfalls),
                new Desc("09-接手速查手册.md", "接手速查手册", ReportGenerator::renderQuickstart),
                new Desc("AI上下文摘要.md", "AI 上下文摘要", ReportGenerator::renderAiContext)
        );

        for (Desc d : descriptors) {
            String content = d.render.apply(report);
            Path filePath = Path.of(dir, d.name);
            Files.writeString(filePath, content);
            writtenFiles.add(filePath.toString());
        }

        // AI知识库.json
        Path aiJsonPath = Path.of(dir, "AI知识库.json");
        String aiJson = report.getAiMemory() != null
                ? new GsonBuilder().setPrettyPrinting().create().toJson(report.getAiMemory().getMemoryData())
                : "{\"error\": \"" + NO_DATA_MSG + "\"}";
        Files.writeString(aiJsonPath, aiJson);
        writtenFiles.add(aiJsonPath.toString());

        // CLAUDE.md
        Path claudeMdPath = Path.of(dir, "CLAUDE.md");
        String claudeMd = renderClaudeMd(report);
        Files.writeString(claudeMdPath, claudeMd);
        writtenFiles.add(claudeMdPath.toString());

        // README.md
        StringBuilder readme = new StringBuilder(buildHeader("项目分析报告索引", report.getMetadata()));
        readme.append("## 报告列表\n\n");
        readme.append("| 报告 | 文件 | 说明 |\n|------|------|------|\n");
        for (Desc d : descriptors) {
            readme.append("| ").append(d.title).append(" | [").append(d.name).append("](./").append(d.name).append(") | ").append(d.title).append(" |\n");
        }
        readme.append("| AI 项目记忆 (JSON) | [AI知识库.json](./AI知识库.json) | AI 项目记忆 (JSON) |\n");
        readme.append("| Claude Code 上下文 | [CLAUDE.md](./CLAUDE.md) | Claude Code 项目上下文 |\n");
        Path readmePath = Path.of(dir, "报告索引.md");
        Files.writeString(readmePath, readme.toString());

        return new ReportFiles(readmePath.toString(), writtenFiles);
    }

    private static String buildHeader(String title, ReportMetadata meta) {
        return "# " + title + "\n\n"
                + "> 项目名称: " + meta.getProjectName() + "\n"
                + "> 生成时间: " + meta.getGeneratedAt() + "\n"
                + "> 分析工具: Project Analyzer " + meta.getAnalyzerType() + " v" + meta.getAnalyzerVersion() + "\n\n"
                + "---\n\n";
    }

    private static String renderProjectOverview(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("项目概览", report.getMetadata()));
        var p = report.getProfile();

        // AI 项目总结
        if (report.getAiSummary() != null && !report.getAiSummary().isBlank()) {
            sb.append("## AI 项目总结\n\n");
            sb.append("> ").append(report.getAiSummary()).append("\n\n");
        }

        sb.append("## 基本信息\n\n");
        sb.append("- 项目名称: ").append(p.getProjectName()).append("\n");
        sb.append("- 项目路径: ").append(p.getProjectPath()).append("\n");
        sb.append("- 主要语言: ").append(p.getPrimaryLanguage()).append("\n");
        sb.append("- 构建工具: ").append(p.getBuildTool().getValue()).append("\n");
        sb.append("\n## 语言统计\n\n| 语言 | 文件数 | 代码行数 | 占比 |\n|------|--------|----------|------|\n");
        for (var lang : p.getLanguages()) {
            sb.append("| ").append(lang.getLanguage()).append(" | ").append(lang.getFileCount())
                    .append(" | ").append(lang.getLineCount()).append(" | ").append(lang.getPercentage()).append("% |\n");
        }
        sb.append("\n## 文件统计\n\n");
        sb.append("- 总文件数: ").append(p.getFileStats().getTotalFiles()).append("\n");
        sb.append("- 源码文件: ").append(p.getFileStats().getSourceFiles()).append("\n");
        sb.append("- 测试文件: ").append(p.getFileStats().getTestFiles()).append("\n");
        sb.append("- 配置文件: ").append(p.getFileStats().getConfigFiles()).append("\n");
        sb.append("- 总代码行数: ").append(p.getFileStats().getTotalLines()).append("\n");
        sb.append("\n## 子模块列表\n\n");
        if (p.getModules().isEmpty()) sb.append("无子模块。\n");
        else {
            sb.append("| 模块名 | 路径 | 语言 | 构建工具 |\n|--------|------|------|----------|\n");
            for (var m : p.getModules()) {
                sb.append("| ").append(m.getName()).append(" | ").append(m.getPath())
                        .append(" | ").append(m.getLanguage()).append(" | ").append(m.getBuildTool().getValue()).append(" |\n");
            }
        }
        return sb.toString();
    }

    private static String renderArchitecture(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("技术架构分析", report.getMetadata()));
        var arch = report.getArchitecture();
        if (arch == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 核心框架与技术\n\n");
        if (arch.getFrameworks().isEmpty()) sb.append("未识别到核心框架。\n");
        else {
            sb.append("| 框架 | 版本 | 类别 | 识别依据 |\n|------|------|------|----------|\n");
            for (var f : arch.getFrameworks()) {
                sb.append("| ").append(f.getName()).append(" | ").append(f.getVersion() != null ? f.getVersion() : "-")
                        .append(" | ").append(f.getCategory()).append(" | ").append(String.join(", ", f.getEvidence())).append(" |\n");
            }
        }
        sb.append("\n## 依赖清单\n\n");
        for (var entry : arch.getDependencyGroups().entrySet()) {
            if (entry.getValue().isEmpty()) continue;
            sb.append("### ").append(entry.getKey().getValue()).append("\n\n");
            sb.append("| 依赖名 | 版本 | 作用域 |\n|--------|------|--------|\n");
            for (var d : entry.getValue()) {
                sb.append("| ").append(d.getName()).append(" | ").append(d.getVersion())
                        .append(" | ").append(d.getScope().getValue()).append(" |\n");
            }
            sb.append("\n");
        }
        sb.append("## 分层结构\n\n");
        if (arch.getLayers().isEmpty()) sb.append("未识别到分层结构。\n");
        else {
            sb.append("| 层级 | 匹配模式 | 包含类/文件数 |\n|------|----------|---------------|\n");
            for (var l : arch.getLayers()) {
                sb.append("| ").append(l.getName()).append(" | ").append(l.getPattern())
                        .append(" | ").append(l.getClasses().size() + l.getFiles().size()).append(" |\n");
            }
        }
        if (arch.getModuleDependencyGraph() != null) {
            sb.append("\n## 模块依赖图\n\n```mermaid\n").append(arch.getModuleDependencyGraph().getSyntax()).append("\n```\n");
        }
        return sb.toString();
    }

    private static String renderBusiness(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("业务功能分析", report.getMetadata()));
        var biz = report.getBusiness();
        if (biz == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 业务模块\n\n");
        if (biz.getModules().isEmpty()) sb.append("未识别到业务模块。\n");
        else {
            for (var m : biz.getModules()) {
                sb.append("### ").append(m.getName()).append("\n\n");
                sb.append("- 功能描述: ").append(m.getDescription()).append("\n");
                sb.append("- 关键类/文件: ").append(m.getKeyFiles() != null ? String.join(", ", m.getKeyFiles()) : "-").append("\n");
                sb.append("- 依赖模块: ").append(m.getDependencies() != null ? String.join(", ", m.getDependencies()) : "-").append("\n\n");
            }
        }
        sb.append("## 数据模型\n\n");
        if (biz.getDataModels().isEmpty()) sb.append("未检测到数据模型。\n");
        else {
            for (var dm : biz.getDataModels()) {
                sb.append("### ").append(dm.getName()).append("\n\n");
                sb.append("| 字段名 | 类型 | 注解 | 说明 |\n|--------|------|------|------|\n");
                for (var f : dm.getFields()) {
                    sb.append("| ").append(f.getName()).append(" | ").append(f.getType())
                            .append(" | ").append(f.getAnnotations() != null ? String.join(", ", f.getAnnotations()) : "-")
                            .append(" | ").append(f.getDescription() != null ? f.getDescription() : "-").append(" |\n");
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    private static String renderFlows(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("主要流程分析", report.getMetadata()));
        var flows = report.getFlows();
        if (flows == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 入口点列表\n\n");
        if (flows.getEntryPoints().isEmpty()) sb.append("未识别到入口点。\n");
        else {
            sb.append("| 类型 | 类名 | 方法名 | 文件 | HTTP 路径 | 方法描述 |\n|------|------|--------|------|----------|----------|\n");
            for (var ep : flows.getEntryPoints()) {
                sb.append("| ").append(ep.getType().getValue()).append(" | ").append(ep.getClassName())
                        .append(" | ").append(ep.getMethodName()).append(" | ").append(ep.getFilePath())
                        .append(" | ").append(ep.getHttpPath() != null ? ep.getHttpPath() : "-")
                        .append(" | ").append(ep.getDescription() != null ? ep.getDescription() : "-").append(" |\n");
            }
        }
        sb.append("\n## 流程详情\n\n");
        if (flows.getFlows().isEmpty()) sb.append("未生成流程详情。\n");
        else {
            for (var f : flows.getFlows()) {
                sb.append("### ").append(f.getDescription()).append("\n\n调用链:\n");
                for (var step : f.getCallChain()) {
                    String ext = step.isExternal() ? " [外部依赖]" : "";
                    sb.append(step.getDepth()).append(". ").append(step.getClassName()).append(".")
                            .append(step.getMethodName()).append(" (depth=").append(step.getDepth()).append(")").append(ext).append("\n");
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    private static String renderApis(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("接口路径分析", report.getMetadata()));
        var apis = report.getApis();
        if (apis == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 接口统计\n\n- 总接口数: ").append(apis.getTotalCount()).append("\n\n");
        sb.append("## 接口列表\n\n");
        if (apis.getGroups().isEmpty()) sb.append("未检测到接口分组。\n");
        else {
            for (var g : apis.getGroups()) {
                String base = g.getBasePath() != null ? " (" + g.getBasePath() + ")" : "";
                sb.append("### ").append(g.getName()).append(base).append("\n\n");
                sb.append("| 路径 | 方法 | 参数 | 响应类型 | 描述 |\n|------|------|------|----------|------|\n");
                for (var ep : g.getEndpoints()) {
                    String params = ep.getParameters() != null
                            ? ep.getParameters().stream().map(p -> p.getName() + ":" + p.getType()).reduce((a, b) -> a + ", " + b).orElse("-")
                            : "-";
                    sb.append("| ").append(ep.getPath()).append(" | ").append(ep.getMethod())
                            .append(" | ").append(params).append(" | ").append(ep.getResponseType() != null ? ep.getResponseType() : "-")
                            .append(" | ").append(ep.getDescription() != null ? ep.getDescription() : "-").append(" |\n");
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    private static String renderStructure(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("项目结构地图", report.getMetadata()));
        var st = report.getStructure();
        if (st == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 目录树\n\n```\n");
        renderDirectoryTree(st.getDirectoryTree(), "", sb);
        sb.append("```\n\n");
        if (st.getModuleDiagram() != null) {
            sb.append("## 模块关系图\n\n```mermaid\n").append(st.getModuleDiagram().getSyntax()).append("\n```\n\n");
        }
        if (st.getSubModuleDependencies() != null) {
            sb.append("## 子模块依赖图\n\n```mermaid\n").append(st.getSubModuleDependencies().getSyntax()).append("\n```\n\n");
        }
        return sb.toString();
    }

    private static void renderDirectoryTree(DirectoryNode node, String prefix, StringBuilder sb) {
        String annotation = node.getAnnotation() != null ? " — " + node.getAnnotation() : "";
        String count = "directory".equals(node.getType()) ? " (" + node.getFileCount() + " files)" : "";
        sb.append(prefix).append(node.getName()).append(count).append(annotation).append("\n");
        if ("directory".equals(node.getType()) && !node.isCollapsed() && node.getChildren() != null) {
            for (var child : node.getChildren()) {
                renderDirectoryTree(child, prefix + "  ", sb);
            }
        }
    }

    private static String renderOps(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("启动/部署/配置说明书", report.getMetadata()));
        var ops = report.getOps();
        if (ops == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 启动方式\n\n");
        if (ops.getStartup().isEmpty()) sb.append("未识别到启动方式。\n");
        else {
            for (var s : ops.getStartup()) {
                String inferred = s.isInferred() ? " (推断结果)" : "";
                sb.append("### ").append(s.getMethod()).append(inferred).append("\n\n");
                sb.append("- 命令: ").append(s.getCommand()).append("\n");
                sb.append("- 说明: ").append(s.getDescription()).append("\n");
                sb.append("- 来源: ").append(s.getFilePath()).append("\n\n");
            }
        }
        if (ops.getContainers() != null && !ops.getContainers().isEmpty()) {
            sb.append("## 容器化部署\n\n");
            for (var c : ops.getContainers()) {
                sb.append("### ").append(c.getType()).append("\n\n");
                if (c.getBaseImage() != null) sb.append("- 基础镜像: ").append(c.getBaseImage()).append("\n");
                sb.append("- 端口: ").append(String.join(", ", c.getPorts())).append("\n");
                sb.append("- 说明: ").append(c.getDescription()).append("\n\n");
            }
        }
        if (ops.getCicd() != null && !ops.getCicd().isEmpty()) {
            sb.append("## CI/CD 流水线\n\n");
            for (var ci : ops.getCicd()) {
                sb.append("### ").append(ci.getType()).append("\n\n");
                sb.append("| 阶段 | 步骤 | 触发条件 |\n|------|------|----------|\n");
                for (var stage : ci.getStages()) {
                    String triggers = stage.getTriggers() != null ? String.join(", ", stage.getTriggers()) : "-";
                    sb.append("| ").append(stage.getName()).append(" | ").append(String.join(", ", stage.getSteps()))
                            .append(" | ").append(triggers).append(" |\n");
                }
                sb.append("\n");
            }
        }
        sb.append("## 配置项清单\n\n");
        if (ops.getConfigItems().isEmpty()) sb.append("未检测到配置项。\n");
        else {
            sb.append("| 配置项 | 默认值 | 说明 | 必填 | 来源 |\n|--------|--------|------|------|------|\n");
            for (var ci : ops.getConfigItems()) {
                sb.append("| ").append(ci.getKey()).append(" | ").append(ci.getDefaultValue() != null ? ci.getDefaultValue() : "-")
                        .append(" | ").append(ci.getDescription()).append(" | ").append(ci.isRequired() ? "是" : "否")
                        .append(" | ").append(ci.getSource()).append(" |\n");
            }
        }
        sb.append("\n## 外部依赖服务\n\n");
        if (ops.getExternalServices().isEmpty()) sb.append("未检测到外部依赖服务。\n");
        else {
            sb.append("| 服务名 | 类型 | 识别依据 | 连接配置 |\n|--------|------|----------|----------|\n");
            for (var es : ops.getExternalServices()) {
                sb.append("| ").append(es.getName()).append(" | ").append(es.getType())
                        .append(" | ").append(String.join(", ", es.getEvidence()))
                        .append(" | ").append(es.getConnectionConfig() != null ? es.getConnectionConfig() : "-").append(" |\n");
            }
        }
        if (ops.getEnvComparison() != null) {
            sb.append("\n## 环境配置对照表\n\n");
            var envs = ops.getEnvComparison().getEnvironments();
            sb.append("| 配置项 | ").append(String.join(" | ", envs)).append(" | 差异 |\n");
            sb.append("|--------|").append(envs.stream().map(e -> "------").reduce((a, b) -> a + "|" + b).orElse("")).append("|------|\n");
            for (var item : ops.getEnvComparison().getItems()) {
                sb.append("| ").append(item.getKey());
                for (String env : envs) {
                    sb.append(" | ").append(item.getValues().getOrDefault(env, "-"));
                }
                sb.append(" | ").append(item.isDifferent() ? "是" : "否").append(" |\n");
            }
        }
        return sb.toString();
    }

    private static String renderPitfalls(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("坑点笔记", report.getMetadata()));
        var pit = report.getPitfalls();
        if (pit == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 统计摘要\n\n");
        sb.append("- 总计: ").append(pit.getSummary().getTotal()).append("\n");
        sb.append("- 高: ").append(pit.getSummary().getBySeverity().getOrDefault(PitfallRecord.Severity.HIGH, 0));
        sb.append(", 中: ").append(pit.getSummary().getBySeverity().getOrDefault(PitfallRecord.Severity.MEDIUM, 0));
        sb.append(", 低: ").append(pit.getSummary().getBySeverity().getOrDefault(PitfallRecord.Severity.LOW, 0)).append("\n\n");
        sb.append("| 类别 | 数量 |\n|------|------|\n");
        for (var entry : pit.getSummary().getByCategory().entrySet()) {
            if (entry.getValue() > 0) sb.append("| ").append(entry.getKey().getValue()).append(" | ").append(entry.getValue()).append(" |\n");
        }
        sb.append("\n## 坑点详情\n\n");
        if (pit.getRecords().isEmpty()) sb.append("未检测到坑点。\n");
        else {
            for (var r : pit.getRecords()) {
                String loc = r.getLine() != null ? r.getFilePath() + ":" + r.getLine() : r.getFilePath();
                sb.append("### [").append(r.getSeverity().getValue()).append("] ").append(r.getCategory().getValue())
                        .append(": ").append(r.getDescription()).append("\n\n");
                sb.append("- 文件: ").append(loc).append("\n");
                sb.append("- 建议: ").append(r.getSuggestion()).append("\n\n");
            }
        }
        return sb.toString();
    }

    private static String renderQuickstart(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("接手速查手册", report.getMetadata()));
        var qs = report.getQuickstart();
        if (qs == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        sb.append("## 5 分钟速览\n\n");
        sb.append("- 项目用途: ").append(qs.getFiveMinuteOverview().getPurpose()).append("\n");
        sb.append("- 技术栈: ").append(String.join(", ", qs.getFiveMinuteOverview().getTechStack())).append("\n");
        sb.append("- 核心模块: ").append(String.join(", ", qs.getFiveMinuteOverview().getCoreModules())).append("\n");
        sb.append("- 启动方式: ").append(qs.getFiveMinuteOverview().getStartupCommand()).append("\n");
        sb.append("\n## 开发环境搭建\n\n");
        for (int i = 0; i < qs.getDevSetupSteps().size(); i++) {
            sb.append(i + 1).append(". ").append(qs.getDevSetupSteps().get(i)).append("\n");
        }
        sb.append("\n## 核心业务速览\n\n| 模块 | 功能描述 | 关键文件 | 相关接口 |\n|------|----------|----------|----------|\n");
        for (var b : qs.getBusinessOverview()) {
            sb.append("| ").append(b.getModuleName()).append(" | ").append(b.getDescription())
                    .append(" | ").append(b.getKeyFiles() != null ? String.join(", ", b.getKeyFiles()) : "-")
                    .append(" | ").append(b.getRelatedApis() != null ? String.join(", ", b.getRelatedApis()) : "-").append(" |\n");
        }
        sb.append("\n## 注意事项\n\n");
        if (qs.getWarnings().isEmpty()) sb.append("无高严重程度的坑点。\n");
        else {
            for (var w : qs.getWarnings()) {
                sb.append("- **[").append(w.getSeverity().getValue()).append("]** ").append(w.getDescription())
                        .append(" (").append(w.getFilePath()).append(")\n");
            }
        }
        if (qs.getApiQuickRef() != null && !qs.getApiQuickRef().isEmpty()) {
            sb.append("\n## 接口速查表\n\n| 路径 | 方法 | 功能描述 |\n|------|------|----------|\n");
            for (var a : qs.getApiQuickRef()) {
                sb.append("| ").append(a.getPath()).append(" | ").append(a.getMethod())
                        .append(" | ").append(a.getDescription()).append(" |\n");
            }
        }
        return sb.toString();
    }

    private static String renderAiContext(AnalysisReport report) {
        var sb = new StringBuilder(buildHeader("AI 上下文摘要", report.getMetadata()));
        var mem = report.getAiMemory();
        if (mem == null) { sb.append(NO_DATA_MSG).append("\n"); return sb.toString(); }
        var data = mem.getMemoryData();
        sb.append("## 项目元数据\n\n");
        sb.append("- 名称: ").append(data.getProjectMeta().getName()).append("\n");
        sb.append("- 语言: ").append(data.getProjectMeta().getLanguage()).append("\n");
        sb.append("- 框架: ").append(data.getProjectMeta().getFramework()).append("\n");
        sb.append("- 构建工具: ").append(data.getProjectMeta().getBuildTool()).append("\n");
        sb.append("\n## 模块概览\n\n");
        for (var m : data.getModules()) {
            sb.append("### ").append(m.getName()).append("\n\n").append(m.getPurpose()).append("\n\n");
            for (var cls : m.getCoreClasses()) {
                sb.append("- **").append(cls.getName()).append("**: ").append(String.join(", ", cls.getPublicMethods())).append("\n");
            }
            sb.append("\n");
        }
        if (!data.getApis().isEmpty()) {
            sb.append("## 接口摘要\n\n| 路径 | 方法 | 描述 | 所属模块 |\n|------|------|------|----------|\n");
            for (var a : data.getApis()) {
                sb.append("| ").append(a.getPath()).append(" | ").append(a.getMethod())
                        .append(" | ").append(a.getDescription()).append(" | ").append(a.getRelatedModule()).append(" |\n");
            }
        }
        if (!data.getGlossary().isEmpty()) {
            sb.append("\n## 术语表\n\n| 术语 | 定义 | 相关代码 |\n|------|------|----------|\n");
            for (var g : data.getGlossary()) {
                sb.append("| ").append(g.getTerm()).append(" | ").append(g.getDefinition())
                        .append(" | ").append(String.join(", ", g.getRelatedCode())).append(" |\n");
            }
        }
        if (!data.getCodeNavigation().isEmpty()) {
            sb.append("\n## 代码导航\n\n| 功能 | 文件 | 方法 |\n|------|------|------|\n");
            for (var nav : data.getCodeNavigation()) {
                sb.append("| ").append(nav.getFeature()).append(" | ").append(String.join(", ", nav.getFiles()))
                        .append(" | ").append(String.join(", ", nav.getMethods())).append(" |\n");
            }
        }
        return sb.toString();
    }

    private static String renderClaudeMd(AnalysisReport report) {
        var sb = new StringBuilder();
        var p = report.getProfile();

        // Project overview (1-2 lines)
        var frameworks = report.getArchitecture() != null && report.getArchitecture().getFrameworks() != null
                ? report.getArchitecture().getFrameworks().stream().map(FrameworkInfo::getName).toList()
                : List.<String>of();
        String techDesc = !frameworks.isEmpty() ? " (" + String.join(", ", frameworks) + ")" : "";
        sb.append("# ").append(p.getProjectName()).append("\n\n");
        sb.append(p.getPrimaryLanguage()).append(" project").append(techDesc)
                .append(", built with ").append(p.getBuildTool().getValue()).append(".\n");
        if (p.getFileStats() != null) {
            sb.append(p.getFileStats().getSourceFiles()).append(" source files, ")
                    .append(p.getFileStats().getTotalLines()).append(" lines of code.\n");
        }
        sb.append("\n");

        // Commands
        sb.append("## Commands\n\n```bash\n");
        var ops = report.getOps();
        if (ops != null && ops.getStartup() != null && !ops.getStartup().isEmpty()) {
            for (var s : ops.getStartup().subList(0, Math.min(5, ops.getStartup().size()))) {
                String comment = s.getDescription() != null && !s.getDescription().isEmpty()
                        ? "  # " + s.getDescription() : "";
                sb.append(s.getCommand()).append(comment).append("\n");
            }
        } else {
            switch (p.getBuildTool()) {
                case MAVEN -> { sb.append("mvn install\nmvn test\n"); }
                case GRADLE -> { sb.append("./gradlew build\n./gradlew test\n"); }
                case NPM -> { sb.append("npm install\nnpm run build\nnpm test\n"); }
                case PIP -> { sb.append("pip install -r requirements.txt\npytest\n"); }
                case GO_MOD -> { sb.append("go mod download\ngo build ./...\ngo test ./...\n"); }
                default -> sb.append("# No build commands detected\n");
            }
        }
        sb.append("```\n\n");

        // Project structure
        sb.append("## Project Structure\n\n```\n");
        var modules = report.getBusiness() != null ? report.getBusiness().getModules() : null;
        if (modules != null && !modules.isEmpty()) {
            String projectRoot = p.getProjectPath().replace("\\", "/");
            for (var m : modules) {
                String modPath = m.getPath().replace("\\", "/");
                // Convert absolute path to relative
                if (modPath.startsWith(projectRoot)) {
                    modPath = modPath.substring(projectRoot.length());
                    if (modPath.startsWith("/")) modPath = modPath.substring(1);
                }
                if (modPath.isEmpty()) modPath = ".";
                String desc = m.getDescription() != null && !m.getDescription().contains("inferred from directory")
                        ? " — " + m.getDescription() : "";
                sb.append(modPath).append("/").append(desc).append("\n");
            }
        } else {
            var layers = report.getArchitecture() != null ? report.getArchitecture().getLayers() : null;
            if (layers != null && !layers.isEmpty()) {
                for (var l : layers) {
                    sb.append(l.getPattern()).append("  # ").append(l.getName())
                            .append(" (").append(l.getFiles().size()).append(" files)\n");
                }
            } else {
                sb.append("src/  # Source code\n");
            }
        }
        sb.append("```\n\n");

        // Tech stack
        if (!frameworks.isEmpty()) {
            sb.append("## Tech Stack\n\n");
            for (var f : report.getArchitecture().getFrameworks()) {
                String ver = f.getVersion() != null ? " " + f.getVersion() : "";
                sb.append("- ").append(f.getName()).append(ver).append(" (").append(f.getCategory()).append(")\n");
            }
            sb.append("\n");
        }

        // Key dependencies
        if (report.getArchitecture() != null && report.getArchitecture().getDependencies() != null) {
            var keyDeps = report.getArchitecture().getDependencies().stream()
                    .filter(d -> d.getScope() != Dependency.DependencyScope.TEST
                            && d.getCategory() != Dependency.DependencyCategory.OTHER
                            && d.getCategory() != Dependency.DependencyCategory.UTILITY)
                    .limit(15).toList();
            if (!keyDeps.isEmpty()) {
                sb.append("## Key Dependencies\n\n");
                for (var d : keyDeps) {
                    sb.append("- ").append(d.getName()).append(" ").append(d.getVersion())
                            .append(" (").append(d.getCategory().getValue()).append(")\n");
                }
                sb.append("\n");
            }
        }

        // API endpoints
        if (report.getApis() != null && report.getApis().getEndpoints() != null && !report.getApis().getEndpoints().isEmpty()) {
            sb.append("## API Endpoints\n\n");
            var eps = report.getApis().getEndpoints().subList(0, Math.min(30, report.getApis().getEndpoints().size()));
            for (var ep : eps) {
                String desc = ep.getDescription() != null ? " — " + ep.getDescription() : "";
                sb.append("- `").append(ep.getMethod()).append(" ").append(ep.getPath()).append("`").append(desc).append("\n");
            }
            if (report.getApis().getEndpoints().size() > 30) {
                sb.append("- ... and ").append(report.getApis().getEndpoints().size() - 30).append(" more\n");
            }
            sb.append("\n");
        }

        // Warnings
        if (report.getPitfalls() != null && report.getPitfalls().getRecords() != null) {
            var highPitfalls = report.getPitfalls().getRecords().stream()
                    .filter(r -> r.getSeverity() == PitfallRecord.Severity.HIGH).limit(10).toList();
            if (!highPitfalls.isEmpty()) {
                sb.append("## Known Issues\n\n");
                String projRoot = p.getProjectPath().replace("\\", "/");
                for (var pit : highPitfalls) {
                    String fp = pit.getFilePath().replace("\\", "/");
                    if (fp.startsWith(projRoot)) {
                        fp = fp.substring(projRoot.length());
                        if (fp.startsWith("/")) fp = fp.substring(1);
                    }
                    sb.append("- ⚠️ ").append(pit.getDescription()).append(" (").append(fp).append(")\n");
                }
                sb.append("\n");
            }
        }

        // Code navigation
        if (modules != null && !modules.isEmpty()) {
            sb.append("## Code Navigation\n\n");
            sb.append("| Feature | Key Files |\n|---------|----------|\n");
            for (var m : modules.subList(0, Math.min(15, modules.size()))) {
                var files = m.getKeyFiles().stream().limit(3)
                        .map(f -> {
                            String rel = f.replace("\\", "/");
                            String[] parts = rel.split("/");
                            return parts.length > 3 ? String.join("/", java.util.Arrays.copyOfRange(parts, parts.length - 3, parts.length)) : rel;
                        }).toList();
                sb.append("| ").append(m.getName()).append(" | ").append(String.join(", ", files)).append(" |\n");
            }
            sb.append("\n");
        }

        // External services
        if (ops != null && ops.getExternalServices() != null && !ops.getExternalServices().isEmpty()) {
            sb.append("## External Services\n\n");
            for (var svc : ops.getExternalServices()) {
                sb.append("- ").append(svc.getName()).append(" (").append(svc.getType()).append(")\n");
            }
            sb.append("\n");
        }

        // Required config
        if (ops != null && ops.getConfigItems() != null) {
            var required = ops.getConfigItems().stream().filter(ConfigItem::isRequired).limit(15).toList();
            if (!required.isEmpty()) {
                sb.append("## Required Configuration\n\n");
                for (var c : required) {
                    String val = c.getDefaultValue() != null ? " (default: " + c.getDefaultValue() + ")" : "";
                    sb.append("- `").append(c.getKey()).append("`").append(val).append(" — ").append(c.getDescription()).append("\n");
                }
                sb.append("\n");
            }
        }

        return sb.toString();
    }
}
