package com.analyzer.model;

import java.util.List;

/**
 * ProjectProfile — 项目概况数据模型
 */
public class ProjectProfile {
    private String projectName;
    private String projectPath;
    private String primaryLanguage;
    private List<LanguageStat> languages;
    private BuildToolType buildTool;
    private List<SubModule> modules;
    private FileStats fileStats;

    public ProjectProfile() {}

    public ProjectProfile(String projectName, String projectPath, String primaryLanguage,
                          List<LanguageStat> languages, BuildToolType buildTool,
                          List<SubModule> modules, FileStats fileStats) {
        this.projectName = projectName;
        this.projectPath = projectPath;
        this.primaryLanguage = primaryLanguage;
        this.languages = languages;
        this.buildTool = buildTool;
        this.modules = modules;
        this.fileStats = fileStats;
    }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getProjectPath() { return projectPath; }
    public void setProjectPath(String projectPath) { this.projectPath = projectPath; }

    public String getPrimaryLanguage() { return primaryLanguage; }
    public void setPrimaryLanguage(String primaryLanguage) { this.primaryLanguage = primaryLanguage; }

    public List<LanguageStat> getLanguages() { return languages; }
    public void setLanguages(List<LanguageStat> languages) { this.languages = languages; }

    public BuildToolType getBuildTool() { return buildTool; }
    public void setBuildTool(BuildToolType buildTool) { this.buildTool = buildTool; }

    public List<SubModule> getModules() { return modules; }
    public void setModules(List<SubModule> modules) { this.modules = modules; }

    public FileStats getFileStats() { return fileStats; }
    public void setFileStats(FileStats fileStats) { this.fileStats = fileStats; }

    public static class LanguageStat {
        private String language;
        private int fileCount;
        private int lineCount;
        private double percentage;

        public LanguageStat() {}

        public LanguageStat(String language, int fileCount, int lineCount, double percentage) {
            this.language = language;
            this.fileCount = fileCount;
            this.lineCount = lineCount;
            this.percentage = percentage;
        }

        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }

        public int getFileCount() { return fileCount; }
        public void setFileCount(int fileCount) { this.fileCount = fileCount; }

        public int getLineCount() { return lineCount; }
        public void setLineCount(int lineCount) { this.lineCount = lineCount; }

        public double getPercentage() { return percentage; }
        public void setPercentage(double percentage) { this.percentage = percentage; }
    }

    public enum BuildToolType {
        MAVEN("maven"),
        GRADLE("gradle"),
        NPM("npm"),
        YARN("yarn"),
        PNPM("pnpm"),
        PIP("pip"),
        POETRY("poetry"),
        GO_MOD("go-mod"),
        UNKNOWN("unknown");

        private final String value;

        BuildToolType(String value) { this.value = value; }
        public String getValue() { return value; }

        public static BuildToolType fromValue(String value) {
            for (BuildToolType t : values()) {
                if (t.value.equals(value)) return t;
            }
            return UNKNOWN;
        }
    }

    public static class SubModule {
        private String name;
        private String path;
        private String language;
        private BuildToolType buildTool;

        public SubModule() {}

        public SubModule(String name, String path, String language, BuildToolType buildTool) {
            this.name = name;
            this.path = path;
            this.language = language;
            this.buildTool = buildTool;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }

        public BuildToolType getBuildTool() { return buildTool; }
        public void setBuildTool(BuildToolType buildTool) { this.buildTool = buildTool; }
    }

    public static class FileStats {
        private int totalFiles;
        private int sourceFiles;
        private int testFiles;
        private int configFiles;
        private int totalLines;

        public FileStats() {}

        public FileStats(int totalFiles, int sourceFiles, int testFiles, int configFiles, int totalLines) {
            this.totalFiles = totalFiles;
            this.sourceFiles = sourceFiles;
            this.testFiles = testFiles;
            this.configFiles = configFiles;
            this.totalLines = totalLines;
        }

        public int getTotalFiles() { return totalFiles; }
        public void setTotalFiles(int totalFiles) { this.totalFiles = totalFiles; }

        public int getSourceFiles() { return sourceFiles; }
        public void setSourceFiles(int sourceFiles) { this.sourceFiles = sourceFiles; }

        public int getTestFiles() { return testFiles; }
        public void setTestFiles(int testFiles) { this.testFiles = testFiles; }

        public int getConfigFiles() { return configFiles; }
        public void setConfigFiles(int configFiles) { this.configFiles = configFiles; }

        public int getTotalLines() { return totalLines; }
        public void setTotalLines(int totalLines) { this.totalLines = totalLines; }
    }
}
