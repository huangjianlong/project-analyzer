package com.analyzer;

import com.analyzer.error.*;
import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.module.*;
import com.analyzer.plugin.*;
import com.analyzer.report.*;
import com.analyzer.scanner.*;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.function.Consumer;

public class ProjectAnalyzer {

    private static final String VERSION = "0.1.0";
    private static final List<String> ALL_MODULE_NAMES = List.of(
            "architecture", "business", "flow", "api", "structure", "ops", "pitfall", "quickstart", "ai-memory"
    );

    private final Consumer<String> onProgress;

    public ProjectAnalyzer() { this.onProgress = msg -> {}; }
    public ProjectAnalyzer(Consumer<String> onProgress) { this.onProgress = onProgress != null ? onProgress : msg -> {}; }

    public AnalyzerResult run(AnalyzerConfig config) throws AnalysisException {
        DefaultErrorCollector errorCollector = new DefaultErrorCollector();
        List<String> selectedModules = config.getModules() != null && !config.getModules().isEmpty()
                ? config.getModules() : new ArrayList<>(ALL_MODULE_NAMES);

        // Step 1: Scan project
        onProgress.accept("扫描项目目录...");
        DefaultProjectScanner scanner = new DefaultProjectScanner();
        ProjectProfile profile = scanner.scan(config.getProjectPath());

        // Step 2: Load plugins
        onProgress.accept("加载语言插件...");
        List<LanguagePlugin> plugins = loadPlugins(profile.getPrimaryLanguage(), config.getLang());

        // Step 3: Build report
        AnalysisReport report = new AnalysisReport();
        ReportMetadata meta = new ReportMetadata();
        meta.setGeneratedAt(Instant.now().toString());
        meta.setAnalyzerVersion(VERSION);
        meta.setAnalyzerType("java");
        meta.setProjectName(profile.getProjectName());
        report.setMetadata(meta);
        report.setProfile(profile);

        // Step 4: Execute modules
        Map<String, AnalysisModuleInterface> moduleInstances = createModuleInstances();

        for (String moduleName : selectedModules) {
            AnalysisModuleInterface moduleInstance = moduleInstances.get(moduleName);
            if (moduleInstance == null) {
                errorCollector.addWarning(new AnalysisException(
                        AnalysisErrorCode.MODULE_ERROR, "Unknown module: " + moduleName, true));
                continue;
            }
            onProgress.accept("执行分析模块: " + moduleName + "...");
            try {
                if ("quickstart".equals(moduleName)) {
                    QuickstartGuideGenerator gen = (QuickstartGuideGenerator) moduleInstance;
                    report.setQuickstart(gen.generateGuide(report));
                } else if ("ai-memory".equals(moduleName)) {
                    AiMemoryGenerator gen = (AiMemoryGenerator) moduleInstance;
                    AiMemoryData memoryData = gen.generateMemoryData(report);
                    AiMemoryResult amr = new AiMemoryResult();
                    amr.setMemoryData(memoryData);
                    amr.setJsonFilePath("");
                    amr.setMarkdownFilePath("");
                    report.setAiMemory(amr);
                } else {
                    Object result = moduleInstance.analyze(profile, plugins);
                    assignResult(report, moduleName, result);
                }
            } catch (Exception e) {
                errorCollector.addError(new AnalysisException(
                        AnalysisErrorCode.MODULE_ERROR,
                        "Module \"" + moduleName + "\" failed: " + e.getMessage(),
                        true, moduleName, null, e));
            }
        }

        // Step 5: Generate reports
        onProgress.accept("生成分析报告...");
        ReportFiles reportFiles;
        try {
            ReportGenerator reportGenerator = new ReportGenerator();
            reportFiles = reportGenerator.generate(report, config.getOutputDir());
        } catch (IOException e) {
            throw new AnalysisException(AnalysisErrorCode.REPORT_WRITE_ERROR,
                    "Failed to write reports: " + e.getMessage(), false);
        }

        return new AnalyzerResult(report, reportFiles, errorCollector.getErrors(), errorCollector.getWarnings());
    }

    private List<LanguagePlugin> loadPlugins(String detectedLanguage, String overrideLang) {
        String lang = (overrideLang != null ? overrideLang : detectedLanguage).toLowerCase();
        List<LanguagePlugin> plugins = new ArrayList<>();
        if ("java".equals(lang) || "kotlin".equals(lang)) {
            plugins.add(new JavaPlugin());
        }
        plugins.add(new GenericPlugin());
        return plugins;
    }

    private Map<String, AnalysisModuleInterface> createModuleInstances() {
        Map<String, AnalysisModuleInterface> map = new LinkedHashMap<>();
        map.put("architecture", new ArchitectureAnalyzer());
        map.put("business", new BusinessAnalyzer());
        map.put("flow", new FlowAnalyzer());
        map.put("api", new ApiAnalyzer());
        map.put("structure", new StructureMapper());
        map.put("ops", new OpsDocGenerator());
        map.put("pitfall", new PitfallDetector());
        map.put("quickstart", new QuickstartGuideGenerator());
        map.put("ai-memory", new AiMemoryGenerator());
        return map;
    }

    private void assignResult(AnalysisReport report, String moduleName, Object result) {
        switch (moduleName) {
            case "architecture" -> report.setArchitecture((ArchitectureResult) result);
            case "business" -> report.setBusiness((BusinessResult) result);
            case "flow" -> report.setFlows((FlowResult) result);
            case "api" -> report.setApis((ApiResult) result);
            case "structure" -> report.setStructure((StructureResult) result);
            case "ops" -> report.setOps((OpsResult) result);
            case "pitfall" -> report.setPitfalls((PitfallResult) result);
        }
    }

    public static class AnalyzerResult {
        private final AnalysisReport report;
        private final ReportFiles reportFiles;
        private final List<AnalysisException> errors;
        private final List<AnalysisException> warnings;

        public AnalyzerResult(AnalysisReport report, ReportFiles reportFiles,
                              List<AnalysisException> errors, List<AnalysisException> warnings) {
            this.report = report;
            this.reportFiles = reportFiles;
            this.errors = errors;
            this.warnings = warnings;
        }

        public AnalysisReport getReport() { return report; }
        public ReportFiles getReportFiles() { return reportFiles; }
        public List<AnalysisException> getErrors() { return errors; }
        public List<AnalysisException> getWarnings() { return warnings; }
    }
}
