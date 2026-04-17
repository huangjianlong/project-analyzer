package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;

public class BusinessAnalyzer implements AnalysisModuleInterface {

    private record ModelPattern(Pattern pattern, DataModelInfo.DataModelType type) {}

    private static final List<ModelPattern> DATA_MODEL_PATTERNS = List.of(
            new ModelPattern(Pattern.compile("entity", Pattern.CASE_INSENSITIVE), DataModelInfo.DataModelType.ENTITY),
            new ModelPattern(Pattern.compile("model", Pattern.CASE_INSENSITIVE), DataModelInfo.DataModelType.MODEL),
            new ModelPattern(Pattern.compile("dto", Pattern.CASE_INSENSITIVE), DataModelInfo.DataModelType.DTO),
            new ModelPattern(Pattern.compile("vo$", Pattern.CASE_INSENSITIVE), DataModelInfo.DataModelType.VO),
            new ModelPattern(Pattern.compile("VO[A-Z]", Pattern.CASE_INSENSITIVE), DataModelInfo.DataModelType.VO)
    );

    private static final Set<String> NOISE_WORDS = Set.of("src", "lib", "app", "main", "java", "kotlin");

    @Override
    public String getName() { return "business"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<ModuleInfo> modules = collectModules(profile, plugins);
        enrichModulesWithClasses(modules, plugins);
        inferDescriptions(modules);
        List<DataModelInfo> dataModels = extractDataModels(profile, plugins);

        BusinessResult result = new BusinessResult();
        result.setModules(modules);
        result.setDataModels(dataModels);
        return result;
    }

    private List<ModuleInfo> collectModules(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<ModuleInfo> modules = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (ModuleInfo mod : plugin.identifyModules(Path.of(profile.getProjectPath()))) {
                String normalized = Path.of(mod.getPath()).toAbsolutePath().normalize().toString();
                if (seen.add(normalized)) {
                    mod.setInferred(true);
                    modules.add(mod);
                }
            }
        }
        return modules;
    }

    private void enrichModulesWithClasses(List<ModuleInfo> modules, List<LanguagePlugin> plugins) {
        for (ModuleInfo mod : modules) {
            Set<String> classNames = new LinkedHashSet<>();
            for (String filePath : mod.getKeyFiles()) {
                for (LanguagePlugin plugin : plugins) {
                    for (AstNode node : plugin.parseFile(Path.of(filePath))) {
                        if (node.getType() == AstNode.AstNodeType.CLASS
                                || node.getType() == AstNode.AstNodeType.INTERFACE) {
                            classNames.add(node.getName());
                        }
                    }
                }
            }
            if (!classNames.isEmpty()) {
                mod.setKeyClasses(new ArrayList<>(classNames));
            }
        }
    }

    private void inferDescriptions(List<ModuleInfo> modules) {
        for (ModuleInfo mod : modules) {
            if (mod.getDescription() == null || mod.getDescription().startsWith("Module inferred")
                    || mod.getDescription().startsWith("基于目录推断的模块")
                    || mod.getDescription().startsWith("Module:") || mod.getDescription().startsWith("模块:")
                    || mod.getDescription().startsWith("Java package:") || mod.getDescription().startsWith("Java 包:")) {
                mod.setDescription(generateDescription(mod));
                mod.setInferred(true);
            }
        }
    }

    private String generateDescription(ModuleInfo mod) {
        String humanName = humanize(mod.getName());
        if (mod.getKeyClasses() != null && !mod.getKeyClasses().isEmpty()) {
            String hints = String.join(", ", mod.getKeyClasses().subList(0,
                    Math.min(3, mod.getKeyClasses().size())));
            return humanName + " 模块（核心类: " + hints + "）";
        }
        return humanName + " 模块（基于目录结构推断）";
    }

    private String humanize(String name) {
        String[] parts = name.replace("-", " ").replace("_", " ").replace(".", " ").split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String w : parts) {
            if (NOISE_WORDS.contains(w.toLowerCase())) continue;
            if (!sb.isEmpty()) sb.append(" ");
            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return sb.isEmpty() ? name : sb.toString();
    }

    private List<DataModelInfo> extractDataModels(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<DataModelInfo> models = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> allFiles = new LinkedHashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (ModuleInfo mod : plugin.identifyModules(Path.of(profile.getProjectPath()))) {
                allFiles.addAll(mod.getKeyFiles());
            }
        }
        for (String filePath : allFiles) {
            for (LanguagePlugin plugin : plugins) {
                for (AstNode node : plugin.parseFile(Path.of(filePath))) {
                    if (node.getType() != AstNode.AstNodeType.CLASS
                            && node.getType() != AstNode.AstNodeType.INTERFACE) continue;
                    DataModelInfo.DataModelType modelType = classifyModelType(node.getName(), filePath);
                    if (modelType == null) continue;
                    String key = filePath + ":" + node.getName();
                    if (!seen.add(key)) continue;

                    List<DataFieldInfo> fields = extractFields(node);
                    DataModelInfo dmi = new DataModelInfo();
                    dmi.setName(node.getName());
                    dmi.setType(modelType);
                    dmi.setFilePath(filePath);
                    dmi.setFields(fields);
                    dmi.setDescription(modelType.getValue().toUpperCase() + " 类: " + node.getName());
                    models.add(dmi);
                }
            }
        }
        return models;
    }

    private DataModelInfo.DataModelType classifyModelType(String className, String filePath) {
        for (ModelPattern mp : DATA_MODEL_PATTERNS) {
            if (mp.pattern().matcher(className).find()) return mp.type();
        }
        String baseName = Path.of(filePath).getFileName().toString();
        int dot = baseName.lastIndexOf('.');
        if (dot > 0) baseName = baseName.substring(0, dot);
        for (ModelPattern mp : DATA_MODEL_PATTERNS) {
            if (mp.pattern().matcher(baseName).find()) return mp.type();
        }
        return null;
    }

    private List<DataFieldInfo> extractFields(AstNode node) {
        List<DataFieldInfo> fields = new ArrayList<>();
        if (node.getChildren() == null) return fields;
        for (AstNode child : node.getChildren()) {
            if (child.getType() != AstNode.AstNodeType.FIELD) continue;
            DataFieldInfo fi = new DataFieldInfo();
            fi.setName(child.getName());
            fi.setType(child.getReturnType() != null ? child.getReturnType() : "unknown");
            fi.setAnnotations(child.getAnnotations() != null
                    ? child.getAnnotations().stream().map(AstNode.Annotation::getName).toList()
                    : List.of());
            fields.add(fi);
        }
        return fields;
    }
}
