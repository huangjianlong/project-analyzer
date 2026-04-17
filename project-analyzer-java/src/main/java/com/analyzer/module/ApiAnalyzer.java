package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.nio.file.Path;
import java.util.*;

public class ApiAnalyzer implements AnalysisModuleInterface {

    private static final Set<String> SWAGGER_ANNOTATIONS = Set.of(
            "api", "apioperation", "apiresponse", "apiresponses",
            "operation", "schema", "tag", "tags", "swagger", "openapi"
    );

    @Override
    public String getName() { return "api"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<ApiEndpoint> rawEndpoints = collectEndpoints(profile, plugins);
        enrichWithSwagger(rawEndpoints, profile, plugins);
        List<ApiEndpoint> endpoints = deduplicateEndpoints(rawEndpoints);
        List<ApiGroup> groups = groupEndpoints(endpoints);

        ApiResult result = new ApiResult();
        result.setEndpoints(endpoints);
        result.setGroups(groups);
        result.setTotalCount(endpoints.size());
        return result;
    }

    private List<ApiEndpoint> collectEndpoints(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<ApiEndpoint> all = new ArrayList<>();
        Set<String> processed = new HashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (ModuleInfo mod : plugin.identifyModules(Path.of(profile.getProjectPath()))) {
                for (String filePath : mod.getKeyFiles()) {
                    if (processed.add(filePath)) {
                        all.addAll(plugin.identifyApis(Path.of(filePath)));
                    }
                }
            }
        }
        return all;
    }

    private void enrichWithSwagger(List<ApiEndpoint> endpoints, ProjectProfile profile,
                                   List<LanguagePlugin> plugins) {
        Map<String, List<ApiEndpoint>> epMap = new HashMap<>();
        for (ApiEndpoint ep : endpoints) {
            String key = (ep.getHandlerClass() + "." + ep.getHandlerMethod()).toLowerCase();
            epMap.computeIfAbsent(key, k -> new ArrayList<>()).add(ep);
        }
        if (epMap.isEmpty()) return;

        Set<String> parsed = new HashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (ModuleInfo mod : plugin.identifyModules(Path.of(profile.getProjectPath()))) {
                for (String filePath : mod.getKeyFiles()) {
                    if (parsed.add(filePath)) {
                        for (AstNode node : plugin.parseFile(Path.of(filePath))) {
                            extractSwaggerFromNode(node, "", epMap);
                        }
                    }
                }
            }
        }
    }

    private void extractSwaggerFromNode(AstNode node, String parentClass,
                                        Map<String, List<ApiEndpoint>> epMap) {
        String currentClass = (node.getType() == AstNode.AstNodeType.CLASS
                || node.getType() == AstNode.AstNodeType.INTERFACE) ? node.getName() : parentClass;

        if (node.getType() == AstNode.AstNodeType.METHOD || node.getType() == AstNode.AstNodeType.FUNCTION) {
            String key = (currentClass + "." + node.getName()).toLowerCase();
            List<ApiEndpoint> matching = epMap.get(key);
            if (matching != null && node.getAnnotations() != null) {
                for (AstNode.Annotation ann : node.getAnnotations()) {
                    if (SWAGGER_ANNOTATIONS.contains(ann.getName().toLowerCase()) && ann.getAttributes() != null) {
                        String desc = ann.getAttributes().getOrDefault("value",
                                ann.getAttributes().getOrDefault("summary",
                                        ann.getAttributes().getOrDefault("description", null)));
                        if (desc != null) {
                            for (ApiEndpoint ep : matching) {
                                if (ep.getDescription() == null) ep.setDescription(desc);
                            }
                        }
                    }
                }
            }
        }
        if (node.getChildren() != null) {
            for (AstNode child : node.getChildren()) {
                extractSwaggerFromNode(child, currentClass, epMap);
            }
        }
    }

    private List<ApiEndpoint> deduplicateEndpoints(List<ApiEndpoint> endpoints) {
        Map<String, ApiEndpoint> seen = new LinkedHashMap<>();
        for (ApiEndpoint ep : endpoints) {
            String key = ep.getMethod() + ":" + ep.getPath();
            if (!seen.containsKey(key)) {
                seen.put(key, ep);
            } else {
                ApiEndpoint existing = seen.get(key);
                if (existing.getDescription() == null && ep.getDescription() != null) {
                    existing.setDescription(ep.getDescription());
                }
            }
        }
        return new ArrayList<>(seen.values());
    }

    private List<ApiGroup> groupEndpoints(List<ApiEndpoint> endpoints) {
        Map<String, List<ApiEndpoint>> groupMap = new LinkedHashMap<>();
        for (ApiEndpoint ep : endpoints) {
            String name = ep.getHandlerClass() != null && !ep.getHandlerClass().isEmpty()
                    ? ep.getHandlerClass() : "default";
            groupMap.computeIfAbsent(name, k -> new ArrayList<>()).add(ep);
        }
        List<ApiGroup> groups = new ArrayList<>();
        for (var entry : groupMap.entrySet()) {
            ApiGroup g = new ApiGroup();
            g.setName(entry.getKey());
            g.setBasePath(inferBasePath(entry.getValue()));
            g.setEndpoints(entry.getValue());
            groups.add(g);
        }
        return groups;
    }

    private String inferBasePath(List<ApiEndpoint> endpoints) {
        if (endpoints.isEmpty()) return null;
        if (endpoints.size() == 1) {
            String[] parts = endpoints.get(0).getPath().split("/");
            List<String> filtered = Arrays.stream(parts).filter(s -> !s.isEmpty()).toList();
            if (filtered.size() > 1) return "/" + String.join("/", filtered.subList(0, filtered.size() - 1));
            return endpoints.get(0).getPath();
        }
        String[][] segments = endpoints.stream()
                .map(ep -> Arrays.stream(ep.getPath().split("/")).filter(s -> !s.isEmpty()).toArray(String[]::new))
                .toArray(String[][]::new);
        int minLen = Arrays.stream(segments).mapToInt(s -> s.length).min().orElse(0);
        List<String> common = new ArrayList<>();
        for (int i = 0; i < minLen; i++) {
            String seg = segments[0][i];
            boolean allMatch = true;
            for (String[] s : segments) {
                if (!s[i].equals(seg)) { allMatch = false; break; }
            }
            if (allMatch) common.add(seg); else break;
        }
        return common.isEmpty() ? null : "/" + String.join("/", common);
    }
}
