package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.time.Instant;
import java.util.*;

public class AiMemoryGenerator implements AnalysisModuleInterface {

    @Override
    public String getName() { return "ai-memory"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        return emptyResult();
    }

    public AiMemoryData generateMemoryData(AnalysisReport report) {
        AiMemoryData data = new AiMemoryData();
        data.setVersion("1.0.0");
        data.setGeneratedAt(Instant.now().toString());
        data.setProjectMeta(buildProjectMeta(report));
        data.setModules(buildModules(report));
        data.setApis(buildApis(report));
        data.setGlossary(buildGlossary(report));
        data.setCodeNavigation(buildCodeNavigation(report));
        return data;
    }

    public AiMemoryDiff compareVersions(AiMemoryData oldVersion, AiMemoryData newVersion) {
        AiMemoryDiff diff = new AiMemoryDiff();
        diff.setModules(diffModules(oldVersion.getModules(), newVersion.getModules()));
        diff.setApis(diffApis(oldVersion.getApis(), newVersion.getApis()));
        diff.setGlossary(diffGlossary(oldVersion.getGlossary(), newVersion.getGlossary()));
        return diff;
    }

    private AiMemoryData.ProjectMeta buildProjectMeta(AnalysisReport report) {
        String framework = report.getArchitecture() != null && report.getArchitecture().getFrameworks() != null
                && !report.getArchitecture().getFrameworks().isEmpty()
                ? report.getArchitecture().getFrameworks().get(0).getName() : "";
        return new AiMemoryData.ProjectMeta(
                report.getProfile().getProjectName(),
                report.getProfile().getPrimaryLanguage(),
                framework,
                report.getProfile().getBuildTool().getValue()
        );
    }

    private List<AiMemoryData.AiModuleInfo> buildModules(AnalysisReport report) {
        if (report.getBusiness() == null || report.getBusiness().getModules() == null) return List.of();
        return report.getBusiness().getModules().stream().map(mod -> {
            AiMemoryData.AiModuleInfo info = new AiMemoryData.AiModuleInfo();
            info.setName(mod.getName());
            info.setPurpose(mod.getDescription() != null ? mod.getDescription() : "");
            info.setCoreClasses(mod.getKeyClasses() != null
                    ? mod.getKeyClasses().stream().map(cls -> {
                        AiMemoryData.AiModuleInfo.CoreClassInfo cci = new AiMemoryData.AiModuleInfo.CoreClassInfo();
                        cci.setName(cls);
                        cci.setPublicMethods(List.of());
                        cci.setDependencies(mod.getDependencies() != null ? mod.getDependencies() : List.of());
                        return cci;
                    }).toList()
                    : List.of());
            return info;
        }).toList();
    }

    private List<AiMemoryData.AiApiInfo> buildApis(AnalysisReport report) {
        if (report.getApis() == null || report.getApis().getEndpoints() == null) return List.of();
        List<ModuleInfo> modules = report.getBusiness() != null && report.getBusiness().getModules() != null
                ? report.getBusiness().getModules() : List.of();
        return report.getApis().getEndpoints().stream().map(ep -> {
            AiMemoryData.AiApiInfo info = new AiMemoryData.AiApiInfo();
            info.setPath(ep.getPath());
            info.setMethod(ep.getMethod());
            info.setDescription(ep.getDescription() != null ? ep.getDescription() : "");
            info.setParameters(ep.getParameters() != null
                    ? ep.getParameters().stream().map(p -> {
                        AiMemoryData.AiApiInfo.AiApiParameter param = new AiMemoryData.AiApiInfo.AiApiParameter();
                        param.setName(p.getName());
                        param.setType(p.getType());
                        param.setIn(p.getIn());
                        return param;
                    }).toList()
                    : List.of());
            info.setResponseModel(ep.getResponseType());
            info.setBusinessContext(ep.getDescription() != null ? ep.getDescription() : "");
            String relatedModule = modules.stream()
                    .filter(m -> ep.getHandlerClass() != null && (ep.getHandlerClass().contains(m.getName()) || m.getPath().contains(ep.getHandlerClass())))
                    .map(ModuleInfo::getName).findFirst().orElse("");
            info.setRelatedModule(relatedModule);
            return info;
        }).toList();
    }

    private List<AiMemoryData.GlossaryEntry> buildGlossary(AnalysisReport report) {
        List<AiMemoryData.GlossaryEntry> entries = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        if (report.getBusiness() != null && report.getBusiness().getModules() != null) {
            for (ModuleInfo mod : report.getBusiness().getModules()) {
                if (seen.add(mod.getName())) {
                    AiMemoryData.GlossaryEntry ge = new AiMemoryData.GlossaryEntry();
                    ge.setTerm(mod.getName());
                    ge.setDefinition(mod.getDescription() != null ? mod.getDescription() : "模块: " + mod.getName());
                    List<String> related = new ArrayList<>();
                    if (mod.getKeyClasses() != null) related.addAll(mod.getKeyClasses());
                    if (mod.getKeyFiles() != null) related.addAll(mod.getKeyFiles());
                    ge.setRelatedCode(related);
                    entries.add(ge);
                }
            }
        }
        return entries;
    }

    private List<AiMemoryData.CodeNavEntry> buildCodeNavigation(AnalysisReport report) {
        if (report.getBusiness() == null || report.getBusiness().getModules() == null) return List.of();
        return report.getBusiness().getModules().stream().map(mod -> {
            AiMemoryData.CodeNavEntry nav = new AiMemoryData.CodeNavEntry();
            nav.setFeature(mod.getName());
            nav.setFiles(mod.getKeyFiles() != null ? mod.getKeyFiles() : List.of());
            nav.setMethods(List.of());
            return nav;
        }).toList();
    }

    // ─── Diff helpers ───

    private AiMemoryDiff.ModuleDiff diffModules(List<AiMemoryData.AiModuleInfo> oldMods,
                                                 List<AiMemoryData.AiModuleInfo> newMods) {
        Map<String, AiMemoryData.AiModuleInfo> oldMap = new HashMap<>();
        if (oldMods != null) oldMods.forEach(m -> oldMap.put(m.getName(), m));
        Map<String, AiMemoryData.AiModuleInfo> newMap = new HashMap<>();
        if (newMods != null) newMods.forEach(m -> newMap.put(m.getName(), m));

        AiMemoryDiff.ModuleDiff diff = new AiMemoryDiff.ModuleDiff();
        diff.setAdded(new ArrayList<>());
        diff.setRemoved(new ArrayList<>());
        diff.setModified(new ArrayList<>());

        for (var entry : newMap.entrySet()) {
            if (!oldMap.containsKey(entry.getKey())) diff.getAdded().add(entry.getValue());
            else if (!Objects.equals(oldMap.get(entry.getKey()).getPurpose(), entry.getValue().getPurpose())) {
                diff.getModified().add(entry.getValue());
            }
        }
        for (var entry : oldMap.entrySet()) {
            if (!newMap.containsKey(entry.getKey())) diff.getRemoved().add(entry.getValue());
        }
        return diff;
    }

    private AiMemoryDiff.ApiDiff diffApis(List<AiMemoryData.AiApiInfo> oldApis,
                                           List<AiMemoryData.AiApiInfo> newApis) {
        Map<String, AiMemoryData.AiApiInfo> oldMap = new HashMap<>();
        if (oldApis != null) oldApis.forEach(a -> oldMap.put(a.getMethod() + " " + a.getPath(), a));
        Map<String, AiMemoryData.AiApiInfo> newMap = new HashMap<>();
        if (newApis != null) newApis.forEach(a -> newMap.put(a.getMethod() + " " + a.getPath(), a));

        AiMemoryDiff.ApiDiff diff = new AiMemoryDiff.ApiDiff();
        diff.setAdded(new ArrayList<>());
        diff.setRemoved(new ArrayList<>());

        for (String key : newMap.keySet()) {
            if (!oldMap.containsKey(key)) diff.getAdded().add(newMap.get(key));
        }
        for (String key : oldMap.keySet()) {
            if (!newMap.containsKey(key)) diff.getRemoved().add(oldMap.get(key));
        }
        return diff;
    }

    private AiMemoryDiff.GlossaryDiff diffGlossary(List<AiMemoryData.GlossaryEntry> oldG,
                                                     List<AiMemoryData.GlossaryEntry> newG) {
        Set<String> oldTerms = new HashSet<>();
        if (oldG != null) oldG.forEach(g -> oldTerms.add(g.getTerm()));
        Set<String> newTerms = new HashSet<>();
        if (newG != null) newG.forEach(g -> newTerms.add(g.getTerm()));

        AiMemoryDiff.GlossaryDiff diff = new AiMemoryDiff.GlossaryDiff();
        diff.setAdded(newG != null ? newG.stream().filter(g -> !oldTerms.contains(g.getTerm())).toList() : List.of());
        diff.setRemoved(oldG != null ? oldG.stream().filter(g -> !newTerms.contains(g.getTerm())).toList() : List.of());
        return diff;
    }

    private AiMemoryResult emptyResult() {
        AiMemoryData data = new AiMemoryData();
        data.setVersion("1.0.0");
        data.setGeneratedAt(Instant.now().toString());
        data.setProjectMeta(new AiMemoryData.ProjectMeta("", "", "", ""));
        data.setModules(List.of());
        data.setApis(List.of());
        data.setGlossary(List.of());
        data.setCodeNavigation(List.of());

        AiMemoryResult result = new AiMemoryResult();
        result.setMemoryData(data);
        result.setJsonFilePath("");
        result.setMarkdownFilePath("");
        return result;
    }

    // ─── Diff data classes ───

    public static class AiMemoryDiff {
        private ModuleDiff modules;
        private ApiDiff apis;
        private GlossaryDiff glossary;

        public ModuleDiff getModules() { return modules; }
        public void setModules(ModuleDiff modules) { this.modules = modules; }
        public ApiDiff getApis() { return apis; }
        public void setApis(ApiDiff apis) { this.apis = apis; }
        public GlossaryDiff getGlossary() { return glossary; }
        public void setGlossary(GlossaryDiff glossary) { this.glossary = glossary; }

        public static class ModuleDiff {
            private List<AiMemoryData.AiModuleInfo> added;
            private List<AiMemoryData.AiModuleInfo> modified;
            private List<AiMemoryData.AiModuleInfo> removed;
            public List<AiMemoryData.AiModuleInfo> getAdded() { return added; }
            public void setAdded(List<AiMemoryData.AiModuleInfo> added) { this.added = added; }
            public List<AiMemoryData.AiModuleInfo> getModified() { return modified; }
            public void setModified(List<AiMemoryData.AiModuleInfo> modified) { this.modified = modified; }
            public List<AiMemoryData.AiModuleInfo> getRemoved() { return removed; }
            public void setRemoved(List<AiMemoryData.AiModuleInfo> removed) { this.removed = removed; }
        }

        public static class ApiDiff {
            private List<AiMemoryData.AiApiInfo> added;
            private List<AiMemoryData.AiApiInfo> removed;
            public List<AiMemoryData.AiApiInfo> getAdded() { return added; }
            public void setAdded(List<AiMemoryData.AiApiInfo> added) { this.added = added; }
            public List<AiMemoryData.AiApiInfo> getRemoved() { return removed; }
            public void setRemoved(List<AiMemoryData.AiApiInfo> removed) { this.removed = removed; }
        }

        public static class GlossaryDiff {
            private List<AiMemoryData.GlossaryEntry> added;
            private List<AiMemoryData.GlossaryEntry> removed;
            public List<AiMemoryData.GlossaryEntry> getAdded() { return added; }
            public void setAdded(List<AiMemoryData.GlossaryEntry> added) { this.added = added; }
            public List<AiMemoryData.GlossaryEntry> getRemoved() { return removed; }
            public void setRemoved(List<AiMemoryData.GlossaryEntry> removed) { this.removed = removed; }
        }
    }
}
