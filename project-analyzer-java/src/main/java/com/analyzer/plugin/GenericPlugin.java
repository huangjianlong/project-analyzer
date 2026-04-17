package com.analyzer.plugin;

import com.analyzer.model.*;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.regex.*;
import java.util.stream.Stream;

public class GenericPlugin implements LanguagePlugin {

    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", ".git", "dist", "build", "__pycache__",
            "target", "vendor", ".gradle", ".idea", ".vscode",
            ".next", ".nuxt", "coverage", ".tox", "venv", ".venv"
    );

    private static final Pattern CLASS_PATTERN = Pattern.compile(
            "(?:public\\s+|private\\s+|protected\\s+)?(?:abstract\\s+)?class\\s+(\\w+)");
    private static final Pattern FUNCTION_PATTERN = Pattern.compile(
            "(?:public|private|protected|static|final|\\s)+[\\w<>\\[\\]]+\\s+(\\w+)\\s*\\(");

    @Override
    public String getLanguageId() { return "generic"; }

    @Override
    public List<AstNode> parseFile(Path filePath) {
        List<AstNode> nodes = new ArrayList<>();
        try {
            List<String> lines = Files.readAllLines(filePath);
            String fileStr = filePath.toString();
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                Matcher cm = CLASS_PATTERN.matcher(line);
                if (cm.find()) {
                    AstNode node = new AstNode();
                    node.setType(AstNode.AstNodeType.CLASS);
                    node.setName(cm.group(1));
                    node.setFilePath(fileStr);
                    node.setStartLine(i + 1);
                    node.setEndLine(i + 1);
                    node.setModifiers(new ArrayList<>());
                    node.setAnnotations(new ArrayList<>());
                    node.setChildren(new ArrayList<>());
                    nodes.add(node);
                }
                Matcher fm = FUNCTION_PATTERN.matcher(line);
                if (fm.find() && !line.contains("class ")) {
                    AstNode node = new AstNode();
                    node.setType(AstNode.AstNodeType.METHOD);
                    node.setName(fm.group(1));
                    node.setFilePath(fileStr);
                    node.setStartLine(i + 1);
                    node.setEndLine(i + 1);
                    node.setModifiers(new ArrayList<>());
                    node.setAnnotations(new ArrayList<>());
                    node.setChildren(new ArrayList<>());
                    nodes.add(node);
                }
            }
        } catch (IOException ignored) {}
        return nodes;
    }

    @Override
    public List<Dependency> extractDependencies(Path projectRoot) {
        return Collections.emptyList();
    }

    @Override
    public List<ApiEndpoint> identifyApis(Path filePath) {
        return Collections.emptyList();
    }

    @Override
    public List<ModuleInfo> identifyModules(Path projectRoot) {
        List<ModuleInfo> modules = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectRoot)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    String name = entry.getFileName().toString();
                    if (IGNORED_DIRS.contains(name) || name.startsWith(".")) continue;
                    List<String> keyFiles = collectSourceFiles(entry);
                    if (!keyFiles.isEmpty()) {
                        modules.add(new ModuleInfo(name, entry.toString(),
                                "基于目录推断的模块: " + name, true,
                                new ArrayList<>(), keyFiles, new ArrayList<>()));
                    }
                }
            }
        } catch (IOException ignored) {}
        return modules;
    }

    private List<String> collectSourceFiles(Path dir) {
        List<String> files = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.filter(Files::isRegularFile)
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return name.endsWith(".java") || name.endsWith(".py") || name.endsWith(".ts")
                            || name.endsWith(".js") || name.endsWith(".go") || name.endsWith(".rb");
                })
                .forEach(p -> files.add(p.toString()));
        } catch (IOException ignored) {}
        return files;
    }
}
