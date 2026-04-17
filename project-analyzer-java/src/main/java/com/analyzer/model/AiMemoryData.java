package com.analyzer.model;

import java.util.List;

/**
 * AiMemoryData — AI 记忆数据模型
 */
public class AiMemoryData {
    private String version;
    private String generatedAt;
    private ProjectMeta projectMeta;
    private List<AiModuleInfo> modules;
    private List<AiApiInfo> apis;
    private List<GlossaryEntry> glossary;
    private List<CodeNavEntry> codeNavigation;

    public AiMemoryData() {}

    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }

    public String getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }

    public ProjectMeta getProjectMeta() { return projectMeta; }
    public void setProjectMeta(ProjectMeta projectMeta) { this.projectMeta = projectMeta; }

    public List<AiModuleInfo> getModules() { return modules; }
    public void setModules(List<AiModuleInfo> modules) { this.modules = modules; }

    public List<AiApiInfo> getApis() { return apis; }
    public void setApis(List<AiApiInfo> apis) { this.apis = apis; }

    public List<GlossaryEntry> getGlossary() { return glossary; }
    public void setGlossary(List<GlossaryEntry> glossary) { this.glossary = glossary; }

    public List<CodeNavEntry> getCodeNavigation() { return codeNavigation; }
    public void setCodeNavigation(List<CodeNavEntry> codeNavigation) { this.codeNavigation = codeNavigation; }

    public static class ProjectMeta {
        private String name;
        private String language;
        private String framework;
        private String buildTool;

        public ProjectMeta() {}

        public ProjectMeta(String name, String language, String framework, String buildTool) {
            this.name = name;
            this.language = language;
            this.framework = framework;
            this.buildTool = buildTool;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }

        public String getFramework() { return framework; }
        public void setFramework(String framework) { this.framework = framework; }

        public String getBuildTool() { return buildTool; }
        public void setBuildTool(String buildTool) { this.buildTool = buildTool; }
    }

    public static class AiModuleInfo {
        private String name;
        private String purpose;
        private List<CoreClassInfo> coreClasses;

        public AiModuleInfo() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPurpose() { return purpose; }
        public void setPurpose(String purpose) { this.purpose = purpose; }

        public List<CoreClassInfo> getCoreClasses() { return coreClasses; }
        public void setCoreClasses(List<CoreClassInfo> coreClasses) { this.coreClasses = coreClasses; }

        public static class CoreClassInfo {
            private String name;
            private List<String> publicMethods;
            private List<String> dependencies;

            public CoreClassInfo() {}

            public String getName() { return name; }
            public void setName(String name) { this.name = name; }

            public List<String> getPublicMethods() { return publicMethods; }
            public void setPublicMethods(List<String> publicMethods) { this.publicMethods = publicMethods; }

            public List<String> getDependencies() { return dependencies; }
            public void setDependencies(List<String> dependencies) { this.dependencies = dependencies; }
        }
    }

    public static class AiApiInfo {
        private String path;
        private ApiEndpoint.HttpMethod method;
        private String description;
        private List<AiApiParameter> parameters;
        private String responseModel; // nullable
        private String businessContext;
        private String relatedModule;

        public AiApiInfo() {}

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public ApiEndpoint.HttpMethod getMethod() { return method; }
        public void setMethod(ApiEndpoint.HttpMethod method) { this.method = method; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public List<AiApiParameter> getParameters() { return parameters; }
        public void setParameters(List<AiApiParameter> parameters) { this.parameters = parameters; }

        public String getResponseModel() { return responseModel; }
        public void setResponseModel(String responseModel) { this.responseModel = responseModel; }

        public String getBusinessContext() { return businessContext; }
        public void setBusinessContext(String businessContext) { this.businessContext = businessContext; }

        public String getRelatedModule() { return relatedModule; }
        public void setRelatedModule(String relatedModule) { this.relatedModule = relatedModule; }

        public static class AiApiParameter {
            private String name;
            private String type;
            private ApiEndpoint.ApiParameter.ParameterIn in;

            public AiApiParameter() {}

            public String getName() { return name; }
            public void setName(String name) { this.name = name; }

            public String getType() { return type; }
            public void setType(String type) { this.type = type; }

            public ApiEndpoint.ApiParameter.ParameterIn getIn() { return in; }
            public void setIn(ApiEndpoint.ApiParameter.ParameterIn in) { this.in = in; }
        }
    }

    public static class GlossaryEntry {
        private String term;
        private String definition;
        private List<String> relatedCode;

        public GlossaryEntry() {}

        public String getTerm() { return term; }
        public void setTerm(String term) { this.term = term; }

        public String getDefinition() { return definition; }
        public void setDefinition(String definition) { this.definition = definition; }

        public List<String> getRelatedCode() { return relatedCode; }
        public void setRelatedCode(List<String> relatedCode) { this.relatedCode = relatedCode; }
    }

    public static class CodeNavEntry {
        private String feature;
        private List<String> files;
        private List<String> methods;

        public CodeNavEntry() {}

        public String getFeature() { return feature; }
        public void setFeature(String feature) { this.feature = feature; }

        public List<String> getFiles() { return files; }
        public void setFiles(List<String> files) { this.files = files; }

        public List<String> getMethods() { return methods; }
        public void setMethods(List<String> methods) { this.methods = methods; }
    }
}
