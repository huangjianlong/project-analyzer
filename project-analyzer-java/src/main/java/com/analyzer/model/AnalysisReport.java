package com.analyzer.model;

import java.util.List;
import java.util.Map;

/**
 * AnalysisReport — 分析报告及所有子结果数据模型
 */
public class AnalysisReport {
    private ReportMetadata metadata;
    private ProjectProfile profile;
    private ArchitectureResult architecture;     // nullable
    private BusinessResult business;             // nullable
    private FlowResult flows;                    // nullable
    private ApiResult apis;                      // nullable
    private StructureResult structure;           // nullable
    private OpsResult ops;                       // nullable
    private PitfallResult pitfalls;              // nullable
    private QuickstartResult quickstart;         // nullable
    private AiMemoryResult aiMemory;             // nullable
    private String aiSummary;                    // nullable — AI 生成的项目总结

    public AnalysisReport() {}

    public ReportMetadata getMetadata() { return metadata; }
    public void setMetadata(ReportMetadata metadata) { this.metadata = metadata; }

    public ProjectProfile getProfile() { return profile; }
    public void setProfile(ProjectProfile profile) { this.profile = profile; }

    public ArchitectureResult getArchitecture() { return architecture; }
    public void setArchitecture(ArchitectureResult architecture) { this.architecture = architecture; }

    public BusinessResult getBusiness() { return business; }
    public void setBusiness(BusinessResult business) { this.business = business; }

    public FlowResult getFlows() { return flows; }
    public void setFlows(FlowResult flows) { this.flows = flows; }

    public ApiResult getApis() { return apis; }
    public void setApis(ApiResult apis) { this.apis = apis; }

    public StructureResult getStructure() { return structure; }
    public void setStructure(StructureResult structure) { this.structure = structure; }

    public OpsResult getOps() { return ops; }
    public void setOps(OpsResult ops) { this.ops = ops; }

    public PitfallResult getPitfalls() { return pitfalls; }
    public void setPitfalls(PitfallResult pitfalls) { this.pitfalls = pitfalls; }

    public QuickstartResult getQuickstart() { return quickstart; }
    public void setQuickstart(QuickstartResult quickstart) { this.quickstart = quickstart; }

    public AiMemoryResult getAiMemory() { return aiMemory; }
    public void setAiMemory(AiMemoryResult aiMemory) { this.aiMemory = aiMemory; }

    public String getAiSummary() { return aiSummary; }
    public void setAiSummary(String aiSummary) { this.aiSummary = aiSummary; }

    // ─── ReportMetadata ───

    public static class ReportMetadata {
        private String generatedAt;
        private String analyzerVersion;
        private String analyzerType; // "java" or "ts"
        private String projectName;

        public ReportMetadata() {}

        public String getGeneratedAt() { return generatedAt; }
        public void setGeneratedAt(String generatedAt) { this.generatedAt = generatedAt; }

        public String getAnalyzerVersion() { return analyzerVersion; }
        public void setAnalyzerVersion(String analyzerVersion) { this.analyzerVersion = analyzerVersion; }

        public String getAnalyzerType() { return analyzerType; }
        public void setAnalyzerType(String analyzerType) { this.analyzerType = analyzerType; }

        public String getProjectName() { return projectName; }
        public void setProjectName(String projectName) { this.projectName = projectName; }
    }

    // ─── ArchitectureResult ───

    public static class ArchitectureResult {
        private List<Dependency> dependencies;
        private Map<Dependency.DependencyCategory, List<Dependency>> dependencyGroups;
        private List<LayerInfo> layers;
        private List<FrameworkInfo> frameworks;
        private MermaidGraph moduleDependencyGraph; // nullable

        public ArchitectureResult() {}

        public List<Dependency> getDependencies() { return dependencies; }
        public void setDependencies(List<Dependency> dependencies) { this.dependencies = dependencies; }

        public Map<Dependency.DependencyCategory, List<Dependency>> getDependencyGroups() { return dependencyGroups; }
        public void setDependencyGroups(Map<Dependency.DependencyCategory, List<Dependency>> dependencyGroups) {
            this.dependencyGroups = dependencyGroups;
        }

        public List<LayerInfo> getLayers() { return layers; }
        public void setLayers(List<LayerInfo> layers) { this.layers = layers; }

        public List<FrameworkInfo> getFrameworks() { return frameworks; }
        public void setFrameworks(List<FrameworkInfo> frameworks) { this.frameworks = frameworks; }

        public MermaidGraph getModuleDependencyGraph() { return moduleDependencyGraph; }
        public void setModuleDependencyGraph(MermaidGraph moduleDependencyGraph) {
            this.moduleDependencyGraph = moduleDependencyGraph;
        }
    }

    public static class LayerInfo {
        private String name;
        private String pattern;
        private List<String> classes;
        private List<String> files;

        public LayerInfo() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPattern() { return pattern; }
        public void setPattern(String pattern) { this.pattern = pattern; }

        public List<String> getClasses() { return classes; }
        public void setClasses(List<String> classes) { this.classes = classes; }

        public List<String> getFiles() { return files; }
        public void setFiles(List<String> files) { this.files = files; }
    }

    public static class FrameworkInfo {
        private String name;
        private String version; // nullable
        private String category;
        private List<String> evidence;

        public FrameworkInfo() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getVersion() { return version; }
        public void setVersion(String version) { this.version = version; }

        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }

        public List<String> getEvidence() { return evidence; }
        public void setEvidence(List<String> evidence) { this.evidence = evidence; }
    }

    public static class MermaidGraph {
        private String syntax;
        private List<String> nodes;
        private List<MermaidEdge> edges;

        public MermaidGraph() {}

        public String getSyntax() { return syntax; }
        public void setSyntax(String syntax) { this.syntax = syntax; }

        public List<String> getNodes() { return nodes; }
        public void setNodes(List<String> nodes) { this.nodes = nodes; }

        public List<MermaidEdge> getEdges() { return edges; }
        public void setEdges(List<MermaidEdge> edges) { this.edges = edges; }

        public static class MermaidEdge {
            private String from;
            private String to;
            private String label; // nullable

            public MermaidEdge() {}

            public MermaidEdge(String from, String to, String label) {
                this.from = from;
                this.to = to;
                this.label = label;
            }

            public String getFrom() { return from; }
            public void setFrom(String from) { this.from = from; }

            public String getTo() { return to; }
            public void setTo(String to) { this.to = to; }

            public String getLabel() { return label; }
            public void setLabel(String label) { this.label = label; }
        }
    }

    // ─── BusinessResult ───

    public static class BusinessResult {
        private List<ModuleInfo> modules;
        private List<DataModelInfo> dataModels;

        public BusinessResult() {}

        public List<ModuleInfo> getModules() { return modules; }
        public void setModules(List<ModuleInfo> modules) { this.modules = modules; }

        public List<DataModelInfo> getDataModels() { return dataModels; }
        public void setDataModels(List<DataModelInfo> dataModels) { this.dataModels = dataModels; }
    }

    public static class DataModelInfo {
        private String name;
        private DataModelType type;
        private String filePath;
        private List<DataFieldInfo> fields;
        private String description; // nullable

        public DataModelInfo() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public DataModelType getType() { return type; }
        public void setType(DataModelType type) { this.type = type; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public List<DataFieldInfo> getFields() { return fields; }
        public void setFields(List<DataFieldInfo> fields) { this.fields = fields; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public enum DataModelType {
            ENTITY("entity"),
            MODEL("model"),
            DTO("dto"),
            VO("vo"),
            OTHER("other");

            private final String value;

            DataModelType(String value) { this.value = value; }
            public String getValue() { return value; }

            public static DataModelType fromValue(String value) {
                for (DataModelType t : values()) {
                    if (t.value.equals(value)) return t;
                }
                return OTHER;
            }
        }
    }

    public static class DataFieldInfo {
        private String name;
        private String type;
        private List<String> annotations;
        private String description; // nullable

        public DataFieldInfo() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public List<String> getAnnotations() { return annotations; }
        public void setAnnotations(List<String> annotations) { this.annotations = annotations; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    // ─── FlowResult ───

    public static class FlowResult {
        private List<FlowTrace.EntryPoint> entryPoints;
        private List<FlowTrace> flows;

        public FlowResult() {}

        public List<FlowTrace.EntryPoint> getEntryPoints() { return entryPoints; }
        public void setEntryPoints(List<FlowTrace.EntryPoint> entryPoints) { this.entryPoints = entryPoints; }

        public List<FlowTrace> getFlows() { return flows; }
        public void setFlows(List<FlowTrace> flows) { this.flows = flows; }
    }

    // ─── ApiResult ───

    public static class ApiResult {
        private List<ApiEndpoint> endpoints;
        private List<ApiGroup> groups;
        private int totalCount;

        public ApiResult() {}

        public List<ApiEndpoint> getEndpoints() { return endpoints; }
        public void setEndpoints(List<ApiEndpoint> endpoints) { this.endpoints = endpoints; }

        public List<ApiGroup> getGroups() { return groups; }
        public void setGroups(List<ApiGroup> groups) { this.groups = groups; }

        public int getTotalCount() { return totalCount; }
        public void setTotalCount(int totalCount) { this.totalCount = totalCount; }
    }

    public static class ApiGroup {
        private String name;
        private String basePath; // nullable
        private List<ApiEndpoint> endpoints;

        public ApiGroup() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getBasePath() { return basePath; }
        public void setBasePath(String basePath) { this.basePath = basePath; }

        public List<ApiEndpoint> getEndpoints() { return endpoints; }
        public void setEndpoints(List<ApiEndpoint> endpoints) { this.endpoints = endpoints; }
    }

    // ─── StructureResult ───

    public static class StructureResult {
        private DirectoryNode directoryTree;
        private MermaidGraph moduleDiagram;           // nullable
        private MermaidGraph subModuleDependencies;   // nullable

        public StructureResult() {}

        public DirectoryNode getDirectoryTree() { return directoryTree; }
        public void setDirectoryTree(DirectoryNode directoryTree) { this.directoryTree = directoryTree; }

        public MermaidGraph getModuleDiagram() { return moduleDiagram; }
        public void setModuleDiagram(MermaidGraph moduleDiagram) { this.moduleDiagram = moduleDiagram; }

        public MermaidGraph getSubModuleDependencies() { return subModuleDependencies; }
        public void setSubModuleDependencies(MermaidGraph subModuleDependencies) {
            this.subModuleDependencies = subModuleDependencies;
        }
    }

    public static class DirectoryNode {
        private String name;
        private String path;
        private String type; // "directory" or "file"
        private List<DirectoryNode> children;
        private int fileCount;
        private String annotation;       // nullable
        private boolean isCollapsed;
        private boolean isAutoGenerated;
        private int depth;

        public DirectoryNode() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public List<DirectoryNode> getChildren() { return children; }
        public void setChildren(List<DirectoryNode> children) { this.children = children; }

        public int getFileCount() { return fileCount; }
        public void setFileCount(int fileCount) { this.fileCount = fileCount; }

        public String getAnnotation() { return annotation; }
        public void setAnnotation(String annotation) { this.annotation = annotation; }

        public boolean isCollapsed() { return isCollapsed; }
        public void setCollapsed(boolean collapsed) { isCollapsed = collapsed; }

        public boolean isAutoGenerated() { return isAutoGenerated; }
        public void setAutoGenerated(boolean autoGenerated) { isAutoGenerated = autoGenerated; }

        public int getDepth() { return depth; }
        public void setDepth(int depth) { this.depth = depth; }
    }

    // ─── OpsResult ───

    public static class OpsResult {
        private List<StartupInfo> startup;
        private List<ContainerConfig> containers;     // nullable
        private List<CiCdPipeline> cicd;              // nullable
        private List<ConfigItem> configItems;
        private List<ExternalService> externalServices;
        private EnvComparisonTable envComparison;     // nullable

        public OpsResult() {}

        public List<StartupInfo> getStartup() { return startup; }
        public void setStartup(List<StartupInfo> startup) { this.startup = startup; }

        public List<ContainerConfig> getContainers() { return containers; }
        public void setContainers(List<ContainerConfig> containers) { this.containers = containers; }

        public List<CiCdPipeline> getCicd() { return cicd; }
        public void setCicd(List<CiCdPipeline> cicd) { this.cicd = cicd; }

        public List<ConfigItem> getConfigItems() { return configItems; }
        public void setConfigItems(List<ConfigItem> configItems) { this.configItems = configItems; }

        public List<ExternalService> getExternalServices() { return externalServices; }
        public void setExternalServices(List<ExternalService> externalServices) {
            this.externalServices = externalServices;
        }

        public EnvComparisonTable getEnvComparison() { return envComparison; }
        public void setEnvComparison(EnvComparisonTable envComparison) { this.envComparison = envComparison; }
    }

    public static class StartupInfo {
        private String method; // "main-class", "script", "npm-script", "makefile", "other"
        private String command;
        private String description;
        private String filePath;
        private boolean isInferred;

        public StartupInfo() {}

        public String getMethod() { return method; }
        public void setMethod(String method) { this.method = method; }

        public String getCommand() { return command; }
        public void setCommand(String command) { this.command = command; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public boolean isInferred() { return isInferred; }
        public void setInferred(boolean inferred) { isInferred = inferred; }
    }

    public static class ContainerConfig {
        private String type; // "dockerfile" or "docker-compose"
        private String filePath;
        private String baseImage;        // nullable
        private List<String> ports;
        private List<String> volumes;
        private List<String> envVars;
        private List<String> services;   // nullable
        private String description;

        public ContainerConfig() {}

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public String getBaseImage() { return baseImage; }
        public void setBaseImage(String baseImage) { this.baseImage = baseImage; }

        public List<String> getPorts() { return ports; }
        public void setPorts(List<String> ports) { this.ports = ports; }

        public List<String> getVolumes() { return volumes; }
        public void setVolumes(List<String> volumes) { this.volumes = volumes; }

        public List<String> getEnvVars() { return envVars; }
        public void setEnvVars(List<String> envVars) { this.envVars = envVars; }

        public List<String> getServices() { return services; }
        public void setServices(List<String> services) { this.services = services; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    public static class CiCdPipeline {
        private String type; // "github-actions", "gitlab-ci", "jenkins", "other"
        private String filePath;
        private List<CiCdStage> stages;
        private String description;

        public CiCdPipeline() {}

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public List<CiCdStage> getStages() { return stages; }
        public void setStages(List<CiCdStage> stages) { this.stages = stages; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    public static class CiCdStage {
        private String name;
        private List<String> steps;
        private List<String> triggers; // nullable

        public CiCdStage() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public List<String> getSteps() { return steps; }
        public void setSteps(List<String> steps) { this.steps = steps; }

        public List<String> getTriggers() { return triggers; }
        public void setTriggers(List<String> triggers) { this.triggers = triggers; }
    }

    public static class ConfigItem {
        private String key;
        private String defaultValue;     // nullable
        private String description;
        private boolean required;
        private String source;
        private String environment;      // nullable

        public ConfigItem() {}

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }

        public String getDefaultValue() { return defaultValue; }
        public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }

        public String getEnvironment() { return environment; }
        public void setEnvironment(String environment) { this.environment = environment; }
    }

    public static class ExternalService {
        private String name;
        private String type; // "database", "cache", "message-queue", "search-engine", "third-party-api", "other"
        private List<String> evidence;
        private String connectionConfig; // nullable

        public ExternalService() {}

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public List<String> getEvidence() { return evidence; }
        public void setEvidence(List<String> evidence) { this.evidence = evidence; }

        public String getConnectionConfig() { return connectionConfig; }
        public void setConnectionConfig(String connectionConfig) { this.connectionConfig = connectionConfig; }
    }

    public static class EnvComparisonTable {
        private List<String> environments;
        private List<EnvComparisonItem> items;

        public EnvComparisonTable() {}

        public List<String> getEnvironments() { return environments; }
        public void setEnvironments(List<String> environments) { this.environments = environments; }

        public List<EnvComparisonItem> getItems() { return items; }
        public void setItems(List<EnvComparisonItem> items) { this.items = items; }
    }

    public static class EnvComparisonItem {
        private String key;
        private Map<String, String> values;
        private boolean isDifferent;

        public EnvComparisonItem() {}

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }

        public Map<String, String> getValues() { return values; }
        public void setValues(Map<String, String> values) { this.values = values; }

        public boolean isDifferent() { return isDifferent; }
        public void setDifferent(boolean different) { isDifferent = different; }
    }

    // ─── PitfallResult ───

    public static class PitfallResult {
        private List<PitfallRecord> records;
        private PitfallSummary summary;

        public PitfallResult() {}

        public List<PitfallRecord> getRecords() { return records; }
        public void setRecords(List<PitfallRecord> records) { this.records = records; }

        public PitfallSummary getSummary() { return summary; }
        public void setSummary(PitfallSummary summary) { this.summary = summary; }

        public static class PitfallSummary {
            private int total;
            private Map<PitfallRecord.PitfallCategory, Integer> byCategory;
            private Map<PitfallRecord.Severity, Integer> bySeverity;

            public PitfallSummary() {}

            public int getTotal() { return total; }
            public void setTotal(int total) { this.total = total; }

            public Map<PitfallRecord.PitfallCategory, Integer> getByCategory() { return byCategory; }
            public void setByCategory(Map<PitfallRecord.PitfallCategory, Integer> byCategory) {
                this.byCategory = byCategory;
            }

            public Map<PitfallRecord.Severity, Integer> getBySeverity() { return bySeverity; }
            public void setBySeverity(Map<PitfallRecord.Severity, Integer> bySeverity) {
                this.bySeverity = bySeverity;
            }
        }
    }

    // ─── QuickstartResult ───

    public static class QuickstartResult {
        private FiveMinuteOverview fiveMinuteOverview;
        private List<String> devSetupSteps;
        private List<BusinessOverviewEntry> businessOverview;
        private List<PitfallRecord> warnings;
        private List<ApiQuickRefEntry> apiQuickRef; // nullable

        public QuickstartResult() {}

        public FiveMinuteOverview getFiveMinuteOverview() { return fiveMinuteOverview; }
        public void setFiveMinuteOverview(FiveMinuteOverview fiveMinuteOverview) {
            this.fiveMinuteOverview = fiveMinuteOverview;
        }

        public List<String> getDevSetupSteps() { return devSetupSteps; }
        public void setDevSetupSteps(List<String> devSetupSteps) { this.devSetupSteps = devSetupSteps; }

        public List<BusinessOverviewEntry> getBusinessOverview() { return businessOverview; }
        public void setBusinessOverview(List<BusinessOverviewEntry> businessOverview) {
            this.businessOverview = businessOverview;
        }

        public List<PitfallRecord> getWarnings() { return warnings; }
        public void setWarnings(List<PitfallRecord> warnings) { this.warnings = warnings; }

        public List<ApiQuickRefEntry> getApiQuickRef() { return apiQuickRef; }
        public void setApiQuickRef(List<ApiQuickRefEntry> apiQuickRef) { this.apiQuickRef = apiQuickRef; }
    }

    public static class FiveMinuteOverview {
        private String purpose;
        private List<String> techStack;
        private List<String> coreModules;
        private String startupCommand;

        public FiveMinuteOverview() {}

        public String getPurpose() { return purpose; }
        public void setPurpose(String purpose) { this.purpose = purpose; }

        public List<String> getTechStack() { return techStack; }
        public void setTechStack(List<String> techStack) { this.techStack = techStack; }

        public List<String> getCoreModules() { return coreModules; }
        public void setCoreModules(List<String> coreModules) { this.coreModules = coreModules; }

        public String getStartupCommand() { return startupCommand; }
        public void setStartupCommand(String startupCommand) { this.startupCommand = startupCommand; }
    }

    public static class BusinessOverviewEntry {
        private String moduleName;
        private String description;
        private List<String> keyFiles;
        private List<String> relatedApis;

        public BusinessOverviewEntry() {}

        public String getModuleName() { return moduleName; }
        public void setModuleName(String moduleName) { this.moduleName = moduleName; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public List<String> getKeyFiles() { return keyFiles; }
        public void setKeyFiles(List<String> keyFiles) { this.keyFiles = keyFiles; }

        public List<String> getRelatedApis() { return relatedApis; }
        public void setRelatedApis(List<String> relatedApis) { this.relatedApis = relatedApis; }
    }

    public static class ApiQuickRefEntry {
        private String path;
        private ApiEndpoint.HttpMethod method;
        private String description;

        public ApiQuickRefEntry() {}

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }

        public ApiEndpoint.HttpMethod getMethod() { return method; }
        public void setMethod(ApiEndpoint.HttpMethod method) { this.method = method; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    // ─── AiMemoryResult ───

    public static class AiMemoryResult {
        private AiMemoryData memoryData;
        private String jsonFilePath;
        private String markdownFilePath;

        public AiMemoryResult() {}

        public AiMemoryData getMemoryData() { return memoryData; }
        public void setMemoryData(AiMemoryData memoryData) { this.memoryData = memoryData; }

        public String getJsonFilePath() { return jsonFilePath; }
        public void setJsonFilePath(String jsonFilePath) { this.jsonFilePath = jsonFilePath; }

        public String getMarkdownFilePath() { return markdownFilePath; }
        public void setMarkdownFilePath(String markdownFilePath) { this.markdownFilePath = markdownFilePath; }
    }
}
