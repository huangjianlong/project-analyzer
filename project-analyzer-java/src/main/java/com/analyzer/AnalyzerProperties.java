package com.analyzer;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 从 application.yml 中读取 analyzer.* 配置。
 */
@ConfigurationProperties(prefix = "analyzer")
public class AnalyzerProperties {

    /** 要分析的项目路径 */
    private String projectPath = ".";

    /** 报告输出目录 */
    private String outputDir = "./analysis-reports";

    /** 逗号分隔的模块列表，留空表示全部 */
    private String modules = "";

    /** 覆盖语言检测 */
    private String lang = "";

    /** 反模式检测阈值 */
    private Thresholds thresholds = new Thresholds();

    /** AI 大模型配置 */
    private Ai ai = new Ai();

    // ── getters / setters ──

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public String getOutputDir() { return outputDir; }
    public void setOutputDir(String outputDir) { this.outputDir = outputDir; }

    public String getModules() { return modules; }
    public void setModules(String modules) { this.modules = modules; }

    public String getLang() { return lang; }
    public void setLang(String lang) { this.lang = lang; }

    public Thresholds getThresholds() { return thresholds; }
    public void setThresholds(Thresholds thresholds) { this.thresholds = thresholds; }

    public Ai getAi() { return ai; }
    public void setAi(Ai ai) { this.ai = ai; }

    public static class Thresholds {
        private int maxMethodLines = 80;
        private int maxNestingDepth = 4;
        private int maxClassMethods = 20;
        private int maxClassLines = 500;
        private int maxFileLines = 1000;

        public int getMaxMethodLines() { return maxMethodLines; }
        public void setMaxMethodLines(int v) { this.maxMethodLines = v; }

        public int getMaxNestingDepth() { return maxNestingDepth; }
        public void setMaxNestingDepth(int v) { this.maxNestingDepth = v; }

        public int getMaxClassMethods() { return maxClassMethods; }
        public void setMaxClassMethods(int v) { this.maxClassMethods = v; }

        public int getMaxClassLines() { return maxClassLines; }
        public void setMaxClassLines(int v) { this.maxClassLines = v; }

        public int getMaxFileLines() { return maxFileLines; }
        public void setMaxFileLines(int v) { this.maxFileLines = v; }
    }

    public static class Ai {
        private boolean enabled = false;
        private String baseUrl = "http://localhost:1234/v1";
        private String model = "qwen3-8b";
        private String apiKey = "";
        private int timeout = 120;
        private int maxTokens = 2048;
        private double temperature = 0.3;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }

        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }

        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }

        public int getTimeout() { return timeout; }
        public void setTimeout(int timeout) { this.timeout = timeout; }

        public int getMaxTokens() { return maxTokens; }
        public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

        public double getTemperature() { return temperature; }
        public void setTemperature(double temperature) { this.temperature = temperature; }
    }
}
