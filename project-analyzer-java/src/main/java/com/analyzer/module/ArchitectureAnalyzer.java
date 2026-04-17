package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

public class ArchitectureAnalyzer implements AnalysisModuleInterface {

    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", ".git", "dist", "build", "target",
            ".gradle", "__pycache__", ".venv", "venv", ".idea", ".vscode"
    );

    private record FrameworkDef(String name, String category, List<String> packages) {}

    private static final List<FrameworkDef> KNOWN_FRAMEWORKS = List.of(
            new FrameworkDef("Spring Boot", "web", List.of("spring-boot-starter-web", "spring-boot-starter")),
            new FrameworkDef("Spring MVC", "web", List.of("spring-webmvc")),
            new FrameworkDef("MyBatis", "orm", List.of("mybatis", "mybatis-spring")),
            new FrameworkDef("Hibernate", "orm", List.of("hibernate-core")),
            new FrameworkDef("Spring Data JPA", "orm", List.of("spring-data-jpa", "spring-boot-starter-data-jpa")),
            new FrameworkDef("Spring Security", "security", List.of("spring-security-core", "spring-boot-starter-security")),
            new FrameworkDef("Spring Cloud", "microservice", List.of("spring-cloud-starter")),
            new FrameworkDef("Express", "web", List.of("express")),
            new FrameworkDef("React", "frontend", List.of("react")),
            new FrameworkDef("Vue", "frontend", List.of("vue")),
            new FrameworkDef("Django", "web", List.of("django")),
            new FrameworkDef("Flask", "web", List.of("flask")),
            new FrameworkDef("Gin", "web", List.of("github.com/gin-gonic/gin"))
    );

    private record LayerPattern(String name, String pattern, String regex) {}

    private static final List<LayerPattern> LAYER_PATTERNS = List.of(
            new LayerPattern("Controller/Handler", "controller*|handler*|route*|api*", "(?i)^(controller|handler|route|api)"),
            new LayerPattern("Service", "service*|business*|domain*", "(?i)^(service|business|domain)"),
            new LayerPattern("Repository/Data", "repo*|repository*|dao*|data*|model*|entity*", "(?i)^(repo|repository|dao|data|model|entity)"),
            new LayerPattern("Utility", "util*|helper*|common*|shared*|lib*", "(?i)^(util|helper|common|shared|lib)")
    );

    @Override
    public String getName() { return "architecture"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<Dependency> dependencies = collectDependencies(profile, plugins);
        Map<Dependency.DependencyCategory, List<Dependency>> groups = groupDependencies(dependencies);
        List<FrameworkInfo> frameworks = identifyFrameworks(dependencies);
        List<LayerInfo> layers = identifyLayers(profile.getProjectPath());
        MermaidGraph graph = buildModuleDependencyGraph(profile);

        ArchitectureResult result = new ArchitectureResult();
        result.setDependencies(dependencies);
        result.setDependencyGroups(groups);
        result.setFrameworks(frameworks);
        result.setLayers(layers);
        result.setModuleDependencyGraph(graph);
        return result;
    }

    private List<Dependency> collectDependencies(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<Dependency> all = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (LanguagePlugin plugin : plugins) {
            for (Dependency dep : plugin.extractDependencies(Path.of(profile.getProjectPath()))) {
                String key = (dep.getGroup() != null ? dep.getGroup() : "") + ":" + dep.getName() + ":" + dep.getVersion();
                if (seen.add(key)) all.add(dep);
            }
        }
        return all;
    }

    private Map<Dependency.DependencyCategory, List<Dependency>> groupDependencies(List<Dependency> deps) {
        Map<Dependency.DependencyCategory, List<Dependency>> groups = new EnumMap<>(Dependency.DependencyCategory.class);
        for (Dependency.DependencyCategory cat : Dependency.DependencyCategory.values()) {
            groups.put(cat, new ArrayList<>());
        }
        for (Dependency dep : deps) {
            groups.get(dep.getCategory()).add(dep);
        }
        return groups;
    }

    private List<FrameworkInfo> identifyFrameworks(List<Dependency> deps) {
        Map<String, Dependency> depMap = new HashMap<>();
        for (Dependency d : deps) depMap.put(d.getName().toLowerCase(), d);

        List<FrameworkInfo> frameworks = new ArrayList<>();
        for (FrameworkDef fw : KNOWN_FRAMEWORKS) {
            for (String pkg : fw.packages()) {
                Dependency dep = depMap.get(pkg.toLowerCase());
                if (dep != null) {
                    FrameworkInfo fi = new FrameworkInfo();
                    fi.setName(fw.name());
                    fi.setVersion(dep.getVersion());
                    fi.setCategory(fw.category());
                    fi.setEvidence(List.of("dependency: " + dep.getName() + "@" + dep.getVersion()));
                    frameworks.add(fi);
                    break;
                }
            }
        }
        return frameworks;
    }

    private List<LayerInfo> identifyLayers(String projectPath) {
        List<LayerInfo> layers = new ArrayList<>();
        Path root = Path.of(projectPath);
        List<Path> dirsToScan = new ArrayList<>(List.of(root));
        for (String sub : List.of("src", "lib", "app", "pkg", "internal", "src/main/java")) {
            Path p = root.resolve(sub);
            if (Files.isDirectory(p)) dirsToScan.add(p);
        }

        for (LayerPattern lp : LAYER_PATTERNS) {
            List<String> matchedFiles = new ArrayList<>();
            List<String> matchedClasses = new ArrayList<>();
            var regex = java.util.regex.Pattern.compile(lp.regex());
            for (Path dir : dirsToScan) {
                findMatchingDirs(dir, root, regex, matchedFiles, matchedClasses);
            }
            if (!matchedFiles.isEmpty()) {
                LayerInfo li = new LayerInfo();
                li.setName(lp.name());
                li.setPattern(lp.pattern());
                li.setClasses(matchedClasses);
                li.setFiles(matchedFiles);
                layers.add(li);
            }
        }
        return layers;
    }

    private void findMatchingDirs(Path searchDir, Path root, java.util.regex.Pattern regex,
                                  List<String> files, List<String> classes) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(searchDir)) {
            for (Path entry : stream) {
                if (!Files.isDirectory(entry)) continue;
                String name = entry.getFileName().toString();
                if (IGNORED_DIRS.contains(name)) continue;
                if (regex.matcher(name).find()) {
                    listFilesRecursive(entry, root, files, classes);
                }
            }
        } catch (IOException ignored) {}
    }

    private void listFilesRecursive(Path dir, Path root, List<String> files, List<String> classes) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    if (!IGNORED_DIRS.contains(entry.getFileName().toString())) {
                        listFilesRecursive(entry, root, files, classes);
                    }
                } else if (Files.isRegularFile(entry)) {
                    files.add(root.relativize(entry).toString());
                    String base = entry.getFileName().toString();
                    int dot = base.lastIndexOf('.');
                    if (dot > 0) classes.add(base.substring(0, dot));
                }
            }
        } catch (IOException ignored) {}
    }

    private MermaidGraph buildModuleDependencyGraph(ProjectProfile profile) {
        var modules = profile.getModules();
        if (modules == null || modules.size() < 2) return null;

        List<String> nodes = modules.stream().map(ProjectProfile.SubModule::getName).toList();
        List<MermaidGraph.MermaidEdge> edges = new ArrayList<>();

        StringBuilder sb = new StringBuilder("graph TD\n");
        for (String node : nodes) {
            sb.append("  ").append(sanitize(node)).append("[\"").append(node).append("\"]\n");
        }

        // Detect cross-module deps by checking build files
        for (var mod : modules) {
            Path modPath = Path.of(profile.getProjectPath(), mod.getPath());
            for (var other : modules) {
                if (other.getName().equals(mod.getName())) continue;
                if (checkModuleDependency(modPath, other.getName())) {
                    edges.add(new MermaidGraph.MermaidEdge(mod.getName(), other.getName(), null));
                    sb.append("  ").append(sanitize(mod.getName())).append(" --> ")
                            .append(sanitize(other.getName())).append("\n");
                }
            }
        }

        MermaidGraph graph = new MermaidGraph();
        graph.setSyntax(sb.toString().trim());
        graph.setNodes(nodes);
        graph.setEdges(edges);
        return graph;
    }

    private boolean checkModuleDependency(Path modPath, String otherName) {
        for (String file : List.of("pom.xml", "build.gradle", "package.json")) {
            Path p = modPath.resolve(file);
            if (Files.exists(p)) {
                try {
                    String content = Files.readString(p);
                    if (content.contains(otherName)) return true;
                } catch (IOException ignored) {}
            }
        }
        return false;
    }

    private String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_]", "_");
    }
}
