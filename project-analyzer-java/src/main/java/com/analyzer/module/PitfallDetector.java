package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.PitfallResult;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

public class PitfallDetector implements AnalysisModuleInterface {

    private final OpsConfig config;

    private static final Pattern TODO_MARKER_RE = Pattern.compile("\\b(TODO|FIXME|HACK|XXX)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern HARDCODED_URL_RE = Pattern.compile("https?://[^\\s'\"`,)}\\]]+");
    private static final Pattern HARDCODED_IP_RE = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");
    private static final Pattern HARDCODED_API_KEY_RE = Pattern.compile(
            "(?:api[_-]?key|secret|token|password|passwd)\\s*[=:]\\s*['\"][^'\"]{8,}['\"]", Pattern.CASE_INSENSITIVE);

    private static final Set<String> SOURCE_EXTENSIONS = Set.of(
            ".java", ".kt", ".scala", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rb", ".rs", ".c", ".cpp", ".h", ".hpp", ".cs"
    );

    private static final Map<String, DeprecatedInfo> KNOWN_DEPRECATED = Map.of(
            "commons-logging", new DeprecatedInfo("建议使用 SLF4J", "使用 slf4j-api"),
            "log4j", new DeprecatedInfo("Log4j 1.x 已停止维护", "使用 log4j2 或 logback"),
            "junit", new DeprecatedInfo("JUnit 4 已过时", "使用 JUnit 5 (junit-jupiter)")
    );

    private record DeprecatedInfo(String reason, String alternative) {}

    public PitfallDetector() { this.config = new OpsConfig(); }
    public PitfallDetector(OpsConfig config) { this.config = config != null ? config : new OpsConfig(); }

    @Override
    public String getName() { return "pitfall"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        List<PitfallRecord> records = new ArrayList<>();
        Path root = Path.of(profile.getProjectPath());
        List<String> sourceFiles = collectSourceFiles(root);

        // 1. AST-based anti-pattern detection
        List<AstNode> allNodes = new ArrayList<>();
        for (LanguagePlugin plugin : plugins) {
            for (String filePath : sourceFiles) {
                try { allNodes.addAll(plugin.parseFile(Path.of(filePath))); }
                catch (Exception ignored) {}
            }
        }
        records.addAll(detectAntiPatterns(allNodes));

        // 2. Deprecated dependencies
        List<Dependency> allDeps = new ArrayList<>();
        for (LanguagePlugin plugin : plugins) {
            try { allDeps.addAll(plugin.extractDependencies(root)); }
            catch (Exception ignored) {}
        }
        records.addAll(detectDeprecatedDependencies(allDeps));

        // 3. TODO/FIXME markers
        records.addAll(detectTodoMarkers(root, sourceFiles));

        // 4. Hardcoded configs
        records.addAll(detectHardcodedConfigs(root, sourceFiles));

        // 5. Missing tests
        List<ModuleInfo> allModules = new ArrayList<>();
        for (LanguagePlugin plugin : plugins) {
            try { allModules.addAll(plugin.identifyModules(root)); }
            catch (Exception ignored) {}
        }
        records.addAll(detectMissingTests(root, allModules, sourceFiles));

        PitfallResult result = new PitfallResult();
        result.setRecords(records);
        result.setSummary(buildSummary(records));
        return result;
    }

    private List<PitfallRecord> detectAntiPatterns(List<AstNode> nodes) {
        List<PitfallRecord> records = new ArrayList<>();
        var thresholds = config.getAntiPatternThresholds();
        for (AstNode node : nodes) {
            if (node.getType() == AstNode.AstNodeType.METHOD || node.getType() == AstNode.AstNodeType.FUNCTION
                    || node.getType() == AstNode.AstNodeType.CONSTRUCTOR) {
                int lines = node.getEndLine() - node.getStartLine();
                if (lines > thresholds.getMaxMethodLines()) {
                    records.add(new PitfallRecord(PitfallRecord.PitfallCategory.ANTI_PATTERN,
                            PitfallRecord.Severity.MEDIUM, node.getFilePath(), node.getStartLine(),
                            "方法 '" + node.getName() + "' 有 " + lines + " 行（阈值: " + thresholds.getMaxMethodLines() + "）",
                            "建议将此方法拆分为更小的、职责单一的方法。"));
                }
                int depth = measureNestingDepth(node);
                if (depth > thresholds.getMaxNestingDepth()) {
                    records.add(new PitfallRecord(PitfallRecord.PitfallCategory.ANTI_PATTERN,
                            PitfallRecord.Severity.MEDIUM, node.getFilePath(), node.getStartLine(),
                            "方法 '" + node.getName() + "' 嵌套深度为 " + depth + "（阈值: " + thresholds.getMaxNestingDepth() + "）",
                            "建议使用提前返回、守卫子句或提取嵌套逻辑。"));
                }
            }
            if (node.getType() == AstNode.AstNodeType.CLASS) {
                int methodCount = node.getChildren() != null
                        ? (int) node.getChildren().stream().filter(c -> c.getType() == AstNode.AstNodeType.METHOD || c.getType() == AstNode.AstNodeType.CONSTRUCTOR).count()
                        : 0;
                int classLines = node.getEndLine() - node.getStartLine();
                if (methodCount > thresholds.getMaxClassMethods()) {
                    records.add(new PitfallRecord(PitfallRecord.PitfallCategory.ANTI_PATTERN,
                            PitfallRecord.Severity.HIGH, node.getFilePath(), node.getStartLine(),
                            "类 '" + node.getName() + "' 有 " + methodCount + " 个方法（阈值: " + thresholds.getMaxClassMethods() + "）",
                            "建议按单一职责原则拆分此类。"));
                }
                if (classLines > thresholds.getMaxClassLines()) {
                    records.add(new PitfallRecord(PitfallRecord.PitfallCategory.ANTI_PATTERN,
                            PitfallRecord.Severity.HIGH, node.getFilePath(), node.getStartLine(),
                            "类 '" + node.getName() + "' 有 " + classLines + " 行（阈值: " + thresholds.getMaxClassLines() + "）",
                            "建议将功能提取到独立的类中。"));
                }
            }
            if (node.getChildren() != null) records.addAll(detectAntiPatterns(node.getChildren()));
        }
        return records;
    }

    private List<PitfallRecord> detectDeprecatedDependencies(List<Dependency> deps) {
        List<PitfallRecord> records = new ArrayList<>();
        for (Dependency dep : deps) {
            DeprecatedInfo info = KNOWN_DEPRECATED.get(dep.getName());
            if (info != null) {
                records.add(new PitfallRecord(PitfallRecord.PitfallCategory.DEPRECATED_DEP,
                        PitfallRecord.Severity.MEDIUM, "pom.xml", null,
                        "依赖 '" + dep.getName() + "@" + dep.getVersion() + "' 已废弃: " + info.reason(),
                        info.alternative()));
            }
        }
        return records;
    }

    private List<PitfallRecord> detectTodoMarkers(Path root, List<String> sourceFiles) {
        List<PitfallRecord> records = new ArrayList<>();
        for (String filePath : sourceFiles) {
            try {
                List<String> lines = Files.readAllLines(Path.of(filePath));
                String relPath = root.relativize(Path.of(filePath)).toString();
                for (int i = 0; i < lines.size(); i++) {
                    Matcher m = TODO_MARKER_RE.matcher(lines.get(i));
                    if (m.find()) {
                        String marker = m.group(1).toUpperCase();
                        PitfallRecord.Severity sev = ("FIXME".equals(marker) || "HACK".equals(marker))
                                ? PitfallRecord.Severity.MEDIUM : PitfallRecord.Severity.LOW;
                        String desc = lines.get(i).trim();
                        if (desc.length() > 120) desc = desc.substring(0, 120);
                        records.add(new PitfallRecord(PitfallRecord.PitfallCategory.TODO_MARKER,
                                sev, relPath, i + 1,
                                marker + " 标记发现: " + desc,
                                "请处理此 " + marker + " 注释或创建跟踪问题。"));
                    }
                }
            } catch (IOException ignored) {}
        }
        return records;
    }

    private List<PitfallRecord> detectHardcodedConfigs(Path root, List<String> sourceFiles) {
        List<PitfallRecord> records = new ArrayList<>();
        for (String filePath : sourceFiles) {
            if (isTestFile(filePath) || isConfigFile(filePath)) continue;
            try {
                List<String> lines = Files.readAllLines(Path.of(filePath));
                String relPath = root.relativize(Path.of(filePath)).toString();
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    String trimmed = line.trim();
                    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue;
                    if (HARDCODED_URL_RE.matcher(line).find() && !isImportLine(line)) {
                        records.add(new PitfallRecord(PitfallRecord.PitfallCategory.HARDCODED_CONFIG,
                                PitfallRecord.Severity.MEDIUM, relPath, i + 1,
                                "检测到硬编码 URL: " + trimmed.substring(0, Math.min(120, trimmed.length())),
                                "建议将 URL 移至配置文件或环境变量。"));
                    }
                    if (HARDCODED_IP_RE.matcher(line).find() && !line.contains("127.0.0.1") && !line.contains("0.0.0.0")) {
                        records.add(new PitfallRecord(PitfallRecord.PitfallCategory.HARDCODED_CONFIG,
                                PitfallRecord.Severity.MEDIUM, relPath, i + 1,
                                "检测到硬编码 IP 地址: " + trimmed.substring(0, Math.min(120, trimmed.length())),
                                "建议将 URL 移至配置文件或环境变量。"));
                    }
                    if (HARDCODED_API_KEY_RE.matcher(line).find()) {
                        records.add(new PitfallRecord(PitfallRecord.PitfallCategory.HARDCODED_CONFIG,
                                PitfallRecord.Severity.MEDIUM, relPath, i + 1,
                                "检测到可能的硬编码密钥",
                                "建议将密钥移至环境变量或密钥管理器。"));
                    }
                }
            } catch (IOException ignored) {}
        }
        return records;
    }

    private List<PitfallRecord> detectMissingTests(Path root, List<ModuleInfo> modules, List<String> sourceFiles) {
        List<PitfallRecord> records = new ArrayList<>();
        Set<String> testFileNames = new HashSet<>();
        for (String f : sourceFiles) {
            String base = Path.of(f).getFileName().toString().toLowerCase();
            if (isTestFile(f)) {
                String normalized = base.replaceAll("\\.(test|spec)\\.", ".")
                        .replaceAll("_(test|spec)\\.", ".").replaceAll("Test\\.", ".");
                testFileNames.add(normalized);
            }
        }
        for (ModuleInfo mod : modules) {
            boolean hasTest = mod.getKeyFiles().stream().anyMatch(kf -> {
                String base = Path.of(kf).getFileName().toString().toLowerCase();
                return testFileNames.contains(base);
            });
            if (!hasTest) {
                records.add(new PitfallRecord(PitfallRecord.PitfallCategory.MISSING_TEST,
                        PitfallRecord.Severity.LOW, mod.getPath(), null,
                        "模块 '" + mod.getName() + "' 没有对应的测试文件",
                        "建议为此模块添加单元测试以提高代码可靠性。"));
            }
        }
        return records;
    }

    private int measureNestingDepth(AstNode node) {
        if (node.getChildren() == null || node.getChildren().isEmpty()) return 0;
        int max = 0;
        for (AstNode child : node.getChildren()) {
            max = Math.max(max, measureNestingDepth(child));
        }
        return 1 + max;
    }

    private List<String> collectSourceFiles(Path root) {
        List<String> files = new ArrayList<>();
        Set<String> autoGenDirs = new HashSet<>(config.getAutoGeneratedDirs());
        collectSourceFilesRecursive(root, files, autoGenDirs);
        return files;
    }

    private void collectSourceFilesRecursive(Path dir, List<String> files, Set<String> autoGenDirs) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (name.startsWith(".")) continue;
                if (Files.isDirectory(entry)) {
                    if (!autoGenDirs.contains(name)) collectSourceFilesRecursive(entry, files, autoGenDirs);
                } else if (Files.isRegularFile(entry)) {
                    int dot = name.lastIndexOf('.');
                    String ext = dot >= 0 ? name.substring(dot).toLowerCase() : "";
                    if (SOURCE_EXTENSIONS.contains(ext)) files.add(entry.toString());
                }
            }
        } catch (IOException ignored) {}
    }

    private boolean isTestFile(String filePath) {
        String base = Path.of(filePath).getFileName().toString().toLowerCase();
        return base.contains(".test.") || base.contains(".spec.") || base.contains("_test.")
                || base.endsWith("test.java") || base.endsWith("_test.go");
    }

    private boolean isConfigFile(String filePath) {
        String base = Path.of(filePath).getFileName().toString().toLowerCase();
        return base.endsWith(".config.ts") || base.endsWith(".config.js") || base.equals("config.ts")
                || base.endsWith(".env") || base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".json")
                || base.endsWith(".properties") || base.endsWith(".xml");
    }

    private boolean isImportLine(String line) {
        String t = line.trim();
        return t.startsWith("import ") || t.startsWith("from ") || t.contains("require(");
    }

    private PitfallResult.PitfallSummary buildSummary(List<PitfallRecord> records) {
        Map<PitfallRecord.PitfallCategory, Integer> byCategory = new EnumMap<>(PitfallRecord.PitfallCategory.class);
        Map<PitfallRecord.Severity, Integer> bySeverity = new EnumMap<>(PitfallRecord.Severity.class);
        for (PitfallRecord.PitfallCategory c : PitfallRecord.PitfallCategory.values()) byCategory.put(c, 0);
        for (PitfallRecord.Severity s : PitfallRecord.Severity.values()) bySeverity.put(s, 0);
        for (PitfallRecord r : records) {
            byCategory.merge(r.getCategory(), 1, Integer::sum);
            bySeverity.merge(r.getSeverity(), 1, Integer::sum);
        }
        PitfallResult.PitfallSummary summary = new PitfallResult.PitfallSummary();
        summary.setTotal(records.size());
        summary.setByCategory(byCategory);
        summary.setBySeverity(bySeverity);
        return summary;
    }
}
