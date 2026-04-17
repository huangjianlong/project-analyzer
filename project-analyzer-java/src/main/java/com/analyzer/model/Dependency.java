package com.analyzer.model;

/**
 * Dependency — 依赖信息数据模型
 */
public class Dependency {
    private String name;
    private String version;
    private String group; // nullable, Java: groupId
    private DependencyCategory category;
    private DependencyScope scope;

    public Dependency() {}

    public Dependency(String name, String version, String group,
                      DependencyCategory category, DependencyScope scope) {
        this.name = name;
        this.version = version;
        this.group = group;
        this.category = category;
        this.scope = scope;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getGroup() { return group; }
    public void setGroup(String group) { this.group = group; }

    public DependencyCategory getCategory() { return category; }
    public void setCategory(DependencyCategory category) { this.category = category; }

    public DependencyScope getScope() { return scope; }
    public void setScope(DependencyScope scope) { this.scope = scope; }

    public enum DependencyCategory {
        WEB_FRAMEWORK("web-framework"),
        DATABASE("database"),
        CACHE("cache"),
        MESSAGE_QUEUE("message-queue"),
        SECURITY("security"),
        TESTING("testing"),
        LOGGING("logging"),
        UTILITY("utility"),
        OTHER("other");

        private final String value;

        DependencyCategory(String value) { this.value = value; }
        public String getValue() { return value; }

        public static DependencyCategory fromValue(String value) {
            for (DependencyCategory c : values()) {
                if (c.value.equals(value)) return c;
            }
            return OTHER;
        }
    }

    public enum DependencyScope {
        COMPILE("compile"),
        RUNTIME("runtime"),
        TEST("test"),
        PROVIDED("provided");

        private final String value;

        DependencyScope(String value) { this.value = value; }
        public String getValue() { return value; }

        public static DependencyScope fromValue(String value) {
            for (DependencyScope s : values()) {
                if (s.value.equals(value)) return s;
            }
            return COMPILE;
        }
    }
}
