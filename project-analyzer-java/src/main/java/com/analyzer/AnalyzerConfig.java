package com.analyzer;

import java.util.List;

public class AnalyzerConfig {
    private String projectPath;
    private String outputDir;
    private List<String> modules;
    private String lang;

    public AnalyzerConfig() {
        this.outputDir = "analysis-reports";
        this.modules = List.of();
    }

    public AnalyzerConfig(String projectPath, String outputDir, List<String> modules, String lang) {
        this.projectPath = projectPath;
        this.outputDir = outputDir != null ? outputDir : "analysis-reports";
        this.modules = modules != null ? modules : List.of();
        this.lang = lang;
    }

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public String getOutputDir() { return outputDir; }
    public void setOutputDir(String outputDir) { this.outputDir = outputDir; }

    public List<String> getModules() { return modules; }
    public void setModules(List<String> modules) { this.modules = modules; }

    public String getLang() { return lang; }
    public void setLang(String lang) { this.lang = lang; }
}
