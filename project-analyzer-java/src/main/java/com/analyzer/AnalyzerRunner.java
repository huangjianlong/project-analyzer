package com.analyzer;

import com.analyzer.ai.AiEnhancedAnalyzer;
import com.analyzer.ai.LlmService;
import com.analyzer.error.AnalysisException;
import com.analyzer.model.OpsConfig;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/**
 * Spring Boot 启动后自动执行项目分析。
 * 从 application.yml 读取 analyzer.* 配置。
 */
@Component
public class AnalyzerRunner implements CommandLineRunner {

    private final AnalyzerProperties props;

    public AnalyzerRunner(AnalyzerProperties props) {
        this.props = props;
    }

    @Override
    public void run(String... args) throws Exception {
        System.out.println();
        System.out.println("🔍 Project Analyzer Java v0.1.0 (Spring Boot)");
        System.out.println("   项目路径: " + Path.of(props.getProjectPath()).toAbsolutePath());
        System.out.println("   输出目录: " + Path.of(props.getOutputDir()).toAbsolutePath());

        // 解析模块列表
        List<String> modules = List.of();
        if (props.getModules() != null && !props.getModules().isBlank()) {
            modules = Arrays.stream(props.getModules().split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
            System.out.println("   分析模块: " + String.join(", ", modules));
        } else {
            System.out.println("   分析模块: 全部");
        }
        System.out.println();

        // 构建配置
        var config = new AnalyzerConfig();
        config.setProjectPath(Path.of(props.getProjectPath()).toAbsolutePath().toString());
        config.setOutputDir(Path.of(props.getOutputDir()).toAbsolutePath().toString());
        config.setModules(modules);
        if (props.getLang() != null && !props.getLang().isBlank()) {
            config.setLang(props.getLang());
        }

        // 应用阈值配置
        applyThresholds();

        long startTime = System.currentTimeMillis();

        try {
            var analyzer = new ProjectAnalyzer(msg -> System.out.println("  ⏳ " + msg));
            var result = analyzer.run(config);

            // AI 增强分析
            if (props.getAi().isEnabled()) {
                System.out.println("  🤖 尝试连接 AI: " + props.getAi().getBaseUrl() + " 模型: " + props.getAi().getModel());
                var llmService = new LlmService(props.getAi());
                if (llmService.isAvailable()) {
                    System.out.println("  🤖 AI 大模型已连接 (" + props.getAi().getModel() + ")");
                    var aiAnalyzer = new AiEnhancedAnalyzer(llmService);

                    // 增强业务模块描述
                    System.out.println("  🤖 AI 分析业务模块...");
                    aiAnalyzer.enhanceBusinessModules(result.getReport().getBusiness());

                    // 增强 API 描述
                    System.out.println("  🤖 AI 分析接口语义...");
                    aiAnalyzer.enhanceApiDescriptions(result.getReport().getApis());

                    // 增强坑点建议
                    System.out.println("  🤖 AI 生成修复建议...");
                    aiAnalyzer.enhancePitfallSuggestions(result.getReport().getPitfalls());

                    // 增强入口点方法描述
                    System.out.println("  🤖 AI 分析入口点方法...");
                    aiAnalyzer.enhanceFlowDescriptions(result.getReport().getFlows());

                    // 生成项目总结
                    System.out.println("  🤖 AI 生成项目总结...");
                    String summary = aiAnalyzer.generateProjectSummary(result.getReport());
                    if (summary != null && !summary.isBlank()) {
                        result.getReport().setAiSummary(summary);
                        System.out.println("  📝 " + summary);
                    }

                    // AI 增强后重新生成报告
                    System.out.println("  ⏳ 重新生成分析报告...");
                    var reportGen = new com.analyzer.report.ReportGenerator();
                    var newReportFiles = reportGen.generate(result.getReport(), config.getOutputDir());
                    result = new ProjectAnalyzer.AnalyzerResult(
                            result.getReport(), newReportFiles,
                            result.getErrors(), result.getWarnings());
                } else {
                    System.out.println("  ⚠️ AI 大模型不可用，跳过 AI 增强分析");
                }
            }

            // 输出警告
            for (var w : result.getWarnings()) {
                System.err.println("  ⚠️  " + w.getMessage());
            }

            // 输出非致命错误
            for (var e : result.getErrors()) {
                System.err.println("  ❌ " + e.getMessage());
            }

            double elapsed = (System.currentTimeMillis() - startTime) / 1000.0;
            System.out.println();
            System.out.println("✅ 分析完成 (" + String.format("%.1f", elapsed) + "s)");
            System.out.println("   项目名称: " + result.getReport().getProfile().getProjectName());
            System.out.println("   主要语言: " + result.getReport().getProfile().getPrimaryLanguage());
            System.out.println("   报告索引: " + result.getReportFiles().getIndexFile());
            System.out.println("   报告文件: " + result.getReportFiles().getReportFiles().size() + " 个");

            if (!result.getErrors().isEmpty()) {
                System.out.println("   ⚠️  " + result.getErrors().size() + " 个模块出现错误（已降级处理）");
            }

        } catch (AnalysisException e) {
            System.err.println();
            System.err.println("❌ 分析失败: " + e.getMessage());
            System.exit(1);
        }
    }

    private void applyThresholds() {
        var t = props.getThresholds();
        var opsConfig = new OpsConfig();
        var at = opsConfig.getAntiPatternThresholds();
        at.setMaxMethodLines(t.getMaxMethodLines());
        at.setMaxNestingDepth(t.getMaxNestingDepth());
        at.setMaxClassMethods(t.getMaxClassMethods());
        at.setMaxClassLines(t.getMaxClassLines());
        at.setMaxFileLines(t.getMaxFileLines());
        // OpsConfig is used by PitfallDetector via default constructor
    }
}
