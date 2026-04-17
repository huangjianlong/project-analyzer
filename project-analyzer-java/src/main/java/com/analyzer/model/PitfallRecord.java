package com.analyzer.model;

/**
 * PitfallRecord — 坑点记录数据模型
 */
public class PitfallRecord {
    private PitfallCategory category;
    private Severity severity;
    private String filePath;
    private Integer line; // nullable
    private String description;
    private String suggestion;

    public PitfallRecord() {}

    public PitfallRecord(PitfallCategory category, Severity severity, String filePath,
                         Integer line, String description, String suggestion) {
        this.category = category;
        this.severity = severity;
        this.filePath = filePath;
        this.line = line;
        this.description = description;
        this.suggestion = suggestion;
    }

    public PitfallCategory getCategory() { return category; }
    public void setCategory(PitfallCategory category) { this.category = category; }

    public Severity getSeverity() { return severity; }
    public void setSeverity(Severity severity) { this.severity = severity; }

    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }

    public Integer getLine() { return line; }
    public void setLine(Integer line) { this.line = line; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getSuggestion() { return suggestion; }
    public void setSuggestion(String suggestion) { this.suggestion = suggestion; }

    public enum PitfallCategory {
        ANTI_PATTERN("anti-pattern"),
        DEPRECATED_DEP("deprecated-dep"),
        SECURITY_RISK("security-risk"),
        TODO_MARKER("todo-marker"),
        CODE_STYLE("code-style"),
        HARDCODED_CONFIG("hardcoded-config"),
        MISSING_TEST("missing-test");

        private final String value;

        PitfallCategory(String value) { this.value = value; }
        public String getValue() { return value; }

        public static PitfallCategory fromValue(String value) {
            for (PitfallCategory c : values()) {
                if (c.value.equals(value)) return c;
            }
            return ANTI_PATTERN;
        }
    }

    public enum Severity {
        HIGH("high"),
        MEDIUM("medium"),
        LOW("low");

        private final String value;

        Severity(String value) { this.value = value; }
        public String getValue() { return value; }

        public static Severity fromValue(String value) {
            for (Severity s : values()) {
                if (s.value.equals(value)) return s;
            }
            return MEDIUM;
        }
    }
}
