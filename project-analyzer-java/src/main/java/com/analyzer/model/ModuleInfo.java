package com.analyzer.model;

import java.util.List;

/**
 * ModuleInfo — 模块信息数据模型
 */
public class ModuleInfo {
    private String name;
    private String path;
    private String description;
    private boolean isInferred;
    private List<String> keyClasses;
    private List<String> keyFiles;
    private List<String> dependencies;

    public ModuleInfo() {}

    public ModuleInfo(String name, String path, String description, boolean isInferred,
                      List<String> keyClasses, List<String> keyFiles, List<String> dependencies) {
        this.name = name;
        this.path = path;
        this.description = description;
        this.isInferred = isInferred;
        this.keyClasses = keyClasses;
        this.keyFiles = keyFiles;
        this.dependencies = dependencies;
    }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public boolean isInferred() { return isInferred; }
    public void setInferred(boolean inferred) { isInferred = inferred; }

    public List<String> getKeyClasses() { return keyClasses; }
    public void setKeyClasses(List<String> keyClasses) { this.keyClasses = keyClasses; }

    public List<String> getKeyFiles() { return keyFiles; }
    public void setKeyFiles(List<String> keyFiles) { this.keyFiles = keyFiles; }

    public List<String> getDependencies() { return dependencies; }
    public void setDependencies(List<String> dependencies) { this.dependencies = dependencies; }
}
