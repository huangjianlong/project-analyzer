package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.FlowResult;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;

public class FlowAnalyzer implements AnalysisModuleInterface {

    private static final int MAX_DEPTH = 5;
    private static final List<Pattern> CONTROLLER_PATTERNS = List.of(
            Pattern.compile("controller", Pattern.CASE_INSENSITIVE),
            Pattern.compile("handler", Pattern.CASE_INSENSITIVE)
    );
    private static final Set<String> ROUTE_ANNOTATIONS = Set.of(
            "requestmapping", "getmapping", "postmapping", "putmapping", "deletemapping", "patchmapping",
            "path", "get", "post", "put", "delete", "route"
    );
    private static final Set<String> EVENT_ANNOTATIONS = Set.of(
            "eventlistener", "eventhandler", "subscribe", "onmessage", "onevent", "listener"
    );

    private record FunctionEntry(String className, String methodName, String filePath, int startLine, AstNode node) {}

    @Override
    public String getName() { return "flow"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<AstNode> allNodes = collectAllNodes(profile, plugins);
        Map<String, List<FunctionEntry>> functionIndex = buildFunctionIndex(allNodes);
        List<FlowTrace.EntryPoint> entryPoints = identifyEntryPoints(allNodes);

        List<FlowTrace> flows = new ArrayList<>();
        for (FlowTrace.EntryPoint ep : entryPoints) {
            flows.add(traceCallChain(ep, functionIndex));
        }

        FlowResult result = new FlowResult();
        result.setEntryPoints(entryPoints);
        result.setFlows(flows);
        return result;
    }

    private List<AstNode> collectAllNodes(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<AstNode> allNodes = new ArrayList<>();
        Set<String> parsed = new HashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (ModuleInfo mod : plugin.identifyModules(Path.of(profile.getProjectPath()))) {
                for (String filePath : mod.getKeyFiles()) {
                    if (parsed.add(filePath)) {
                        allNodes.addAll(plugin.parseFile(Path.of(filePath)));
                    }
                }
            }
        }
        return allNodes;
    }

    private Map<String, List<FunctionEntry>> buildFunctionIndex(List<AstNode> nodes) {
        Map<String, List<FunctionEntry>> index = new HashMap<>();
        for (AstNode node : nodes) {
            indexNode(node, "", index);
        }
        return index;
    }

    private void indexNode(AstNode node, String parentClass, Map<String, List<FunctionEntry>> index) {
        if (node.getType() == AstNode.AstNodeType.CLASS || node.getType() == AstNode.AstNodeType.INTERFACE) {
            if (node.getChildren() != null) {
                for (AstNode child : node.getChildren()) {
                    indexNode(child, node.getName(), index);
                }
            }
        } else if (node.getType() == AstNode.AstNodeType.METHOD
                || node.getType() == AstNode.AstNodeType.FUNCTION
                || node.getType() == AstNode.AstNodeType.CONSTRUCTOR) {
            FunctionEntry entry = new FunctionEntry(parentClass, node.getName(),
                    node.getFilePath(), node.getStartLine(), node);
            index.computeIfAbsent(node.getName().toLowerCase(), k -> new ArrayList<>()).add(entry);
        }
    }

    private List<FlowTrace.EntryPoint> identifyEntryPoints(List<AstNode> nodes) {
        List<FlowTrace.EntryPoint> entryPoints = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (AstNode node : nodes) {
            if (node.getType() == AstNode.AstNodeType.CLASS) {
                if (isControllerClass(node) && node.getChildren() != null) {
                    for (AstNode child : node.getChildren()) {
                        if (child.getType() == AstNode.AstNodeType.METHOD) {
                            String key = node.getFilePath() + ":" + node.getName() + "." + child.getName();
                            if (seen.add(key)) {
                                entryPoints.add(new FlowTrace.EntryPoint(
                                        FlowTrace.EntryPointType.CONTROLLER,
                                        node.getName(), child.getName(),
                                        node.getFilePath(), extractHttpPath(child, node)));
                            }
                        }
                    }
                }
                // Event handlers
                if (node.getChildren() != null) {
                    for (AstNode child : node.getChildren()) {
                        if (child.getType() == AstNode.AstNodeType.METHOD && isEventHandler(child)) {
                            String key = node.getFilePath() + ":" + node.getName() + "." + child.getName();
                            if (seen.add(key)) {
                                entryPoints.add(new FlowTrace.EntryPoint(
                                        FlowTrace.EntryPointType.EVENT_HANDLER,
                                        node.getName(), child.getName(),
                                        node.getFilePath(), null));
                            }
                        }
                    }
                }
            }
            if (node.getType() == AstNode.AstNodeType.FUNCTION || node.getType() == AstNode.AstNodeType.METHOD) {
                if ("main".equalsIgnoreCase(node.getName())) {
                    String key = node.getFilePath() + "::" + node.getName();
                    if (seen.add(key)) {
                        entryPoints.add(new FlowTrace.EntryPoint(
                                FlowTrace.EntryPointType.MAIN, "", node.getName(),
                                node.getFilePath(), null));
                    }
                }
            }
        }
        return entryPoints;
    }

    private boolean isControllerClass(AstNode node) {
        for (Pattern p : CONTROLLER_PATTERNS) {
            if (p.matcher(node.getName()).find()) return true;
        }
        if (node.getAnnotations() != null) {
            for (AstNode.Annotation ann : node.getAnnotations()) {
                if (ROUTE_ANNOTATIONS.contains(ann.getName().toLowerCase())) return true;
            }
        }
        return false;
    }

    private boolean isEventHandler(AstNode node) {
        if (node.getName().matches("^on[A-Z].*") || node.getName().matches("^handle[A-Z].*")) return true;
        if (node.getAnnotations() != null) {
            for (AstNode.Annotation ann : node.getAnnotations()) {
                if (EVENT_ANNOTATIONS.contains(ann.getName().toLowerCase())) return true;
            }
        }
        return false;
    }

    private String extractHttpPath(AstNode method, AstNode classNode) {
        String basePath = "";
        if (classNode.getAnnotations() != null) {
            for (AstNode.Annotation ann : classNode.getAnnotations()) {
                if (ROUTE_ANNOTATIONS.contains(ann.getName().toLowerCase()) && ann.getAttributes() != null) {
                    String val = ann.getAttributes().getOrDefault("value", "");
                    if (!val.isEmpty()) { basePath = val; break; }
                }
            }
        }
        if (method.getAnnotations() != null) {
            for (AstNode.Annotation ann : method.getAnnotations()) {
                if (ROUTE_ANNOTATIONS.contains(ann.getName().toLowerCase()) && ann.getAttributes() != null) {
                    String val = ann.getAttributes().getOrDefault("value", "");
                    return basePath + val;
                }
            }
        }
        return basePath.isEmpty() ? null : basePath;
    }

    private FlowTrace traceCallChain(FlowTrace.EntryPoint ep, Map<String, List<FunctionEntry>> index) {
        List<FlowTrace.CallStep> chain = new ArrayList<>();
        Set<String> visited = new HashSet<>();

        List<FunctionEntry> candidates = index.getOrDefault(ep.getMethodName().toLowerCase(), List.of());
        FunctionEntry entryNode = candidates.stream()
                .filter(c -> c.filePath().equals(ep.getFilePath())
                        && (ep.getClassName().isEmpty() || c.className().equals(ep.getClassName())))
                .findFirst().orElse(candidates.isEmpty() ? null : candidates.get(0));

        if (entryNode != null) {
            traceNode(entryNode, 1, index, chain, visited);
        }

        String desc = generateFlowDescription(ep, chain);
        return new FlowTrace(ep, chain, MAX_DEPTH, desc);
    }

    private void traceNode(FunctionEntry entry, int depth, Map<String, List<FunctionEntry>> index,
                           List<FlowTrace.CallStep> chain, Set<String> visited) {
        if (depth > MAX_DEPTH) return;
        String key = entry.filePath() + ":" + entry.className() + "." + entry.methodName();
        if (!visited.add(key)) return;
        // Simple heuristic: no deep call tracing without source analysis
    }

    private String generateFlowDescription(FlowTrace.EntryPoint ep, List<FlowTrace.CallStep> chain) {
        String epName = ep.getClassName().isEmpty() ? ep.getMethodName()
                : ep.getClassName() + "." + ep.getMethodName();
        String typeLabel = switch (ep.getType()) {
            case CONTROLLER -> "HTTP 接口";
            case MAIN -> "应用入口";
            case EVENT_HANDLER -> "事件处理器";
            default -> "入口点";
        };
        String httpInfo = ep.getHttpPath() != null ? " (" + ep.getHttpPath() + ")" : "";
        return typeLabel + ": " + epName + httpInfo;
    }
}
