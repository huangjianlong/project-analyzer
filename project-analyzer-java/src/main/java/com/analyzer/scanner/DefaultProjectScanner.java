package com.analyzer.scanner;

import com.analyzer.error.AnalysisErrorCode;
import com.analyzer.error.AnalysisException;
import com.analyzer.model.ProjectProfile;
import com.analyzer.model.ProjectProfile.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

public class DefaultProjectScanner implements ProjectScanner {

    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", ".git", "dist", "build", "__pycache__",
            "target", "vendor", ".gradle", ".idea", ".vscode",
            ".next", ".nuxt", "coverage", ".tox", "venv", ".venv",
            "env", ".env", "egg-info"
    );

    private static final Map<String, String> EXTENSION_LANGUAGE = Map.ofEntries(
            Map.entry(".ts", "TypeScript"), Map.entry(".tsx", "TypeScript"),
            Map.entry(".js", "JavaScript"), Map.entry(".jsx", "JavaScript"),
            Map.entry(".py", "Python"), Map.entry(".go", "Go"),
            Map.entry(".java", "Java"), Map.entry(".rb", "Ruby"),
            Map.entry(".rs", "Rust"), Map.entry(".c", "C"), Map.entry(".h", "C"),
            Map.entry(".cpp", "C++"), Map.entry(".hpp", "C++"),
            Map.entry(".cs", "C#"), Map.entry(".php", "PHP"),
            Map.entry(".swift", "Swift"), Map.entry(".kt", "Kotlin"),
            Map.entry(".scala", "Scala")
    );

    private static final Set<String> SOURCE_EXTENSIONS = Set.of(
            ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java",
            ".rb", ".rs", ".c", ".h", ".cpp", ".hpp", ".cs", ".php",
            ".swift", ".kt", ".scala"
    );

    private static final Set<String> CONFIG_EXTENSIONS = Set.of(
            ".json", ".yaml", ".yml", ".toml", ".xml", ".ini",
            ".cfg", ".env", ".properties"
    );

    private static final Map<String, BuildToolType> BUILD_CONFIG_FILES = new LinkedHashMap<>();
    static {
        BUILD_CONFIG_FILES.put("pom.xml", BuildToolType.MAVEN);
        BUILD_CONFIG_FILES.put("build.gradle", BuildToolType.GRADLE);
        BUILD_CONFIG_FILES.put("build.gradle.kts", BuildToolType.GRADLE);
        BUILD_CONFIG_FILES.put("package.json", BuildToolType.NPM);
        BUILD_CONFIG_FILES.put("requirements.txt", BuildToolType.PIP);
        BUILD_CONFIG_FILES.put("setup.py", BuildToolType.PIP);
        BUILD_CONFIG_FILES.put("pyproject.toml", BuildToolType.PIP);
        BUILD_CONFIG_FILES.put("go.mod", BuildToolType.GO_MOD);
    }

    private static final Map<String, BuildToolType> LOCK_FILE_OVERRIDES = Map.of(
            "yarn.lock", BuildToolType.YARN,
            "pnpm-lock.yaml", BuildToolType.PNPM,
            "poetry.lock", BuildToolType.POETRY
    );

    @Override
    public ProjectProfile scan(String projectPath) throws AnalysisException {
        Path resolved = Path.of(projectPath).toAbsolutePath().normalize();
        String projectName = resolved.getFileName().toString();

        if (!Files.exists(resolved)) {
            throw new AnalysisException(AnalysisErrorCode.INVALID_PATH,
                    "Path does not exist: " + resolved, false);
        }
        if (!Files.isDirectory(resolved)) {
            throw new AnalysisException(AnalysisErrorCode.INVALID_PATH,
                    "Path is not a directory: " + resolved, false);
        }

        List<FileEntry> files = collectFiles(resolved, resolved);

        boolean hasSource = files.stream().anyMatch(f -> SOURCE_EXTENSIONS.contains(f.extension));
        if (!hasSource) {
            throw new AnalysisException(AnalysisErrorCode.EMPTY_PROJECT,
                    "No recognizable source code files found in: " + resolved, false);
        }

        List<LanguageStat> languages = computeLanguageStats(files);
        String primaryLanguage = languages.isEmpty() ? "unknown" : languages.get(0).getLanguage();
        BuildToolType buildTool = detectBuildTool(resolved);
        List<SubModule> modules = detectSubModules(resolved, resolved);
        FileStats fileStats = computeFileStats(files);

        return new ProjectProfile(projectName, resolved.toString(), primaryLanguage,
                languages, buildTool, modules, fileStats);
    }

    private List<FileEntry> collectFiles(Path dir, Path rootDir) {
        List<FileEntry> entries = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                if (Files.isDirectory(entry)) {
                    if (!IGNORED_DIRS.contains(name) && !name.startsWith(".")) {
                        entries.addAll(collectFiles(entry, rootDir));
                    }
                } else if (Files.isRegularFile(entry)) {
                    String relativePath = rootDir.relativize(entry).toString();
                    String ext = getExtension(name);
                    int lineCount = countLines(entry);
                    entries.add(new FileEntry(relativePath, ext, lineCount, name));
                }
            }
        } catch (IOException ignored) {}
        return entries;
    }

    private int countLines(Path file) {
        try {
            return (int) Files.lines(file).count();
        } catch (Exception e) {
            return 0;
        }
    }

    private String getExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot >= 0 ? filename.substring(dot).toLowerCase() : "";
    }

    private List<LanguageStat> computeLanguageStats(List<FileEntry> files) {
        Map<String, int[]> langMap = new LinkedHashMap<>();
        for (FileEntry f : files) {
            String lang = EXTENSION_LANGUAGE.get(f.extension);
            if (lang == null) continue;
            langMap.computeIfAbsent(lang, k -> new int[2]);
            langMap.get(lang)[0]++;
            langMap.get(lang)[1] += f.lineCount;
        }
        int totalFiles = langMap.values().stream().mapToInt(a -> a[0]).sum();
        List<LanguageStat> stats = new ArrayList<>();
        for (var entry : langMap.entrySet()) {
            int fc = entry.getValue()[0];
            int lc = entry.getValue()[1];
            double pct = totalFiles > 0 ? Math.round((double) fc / totalFiles * 10000.0) / 100.0 : 0;
            stats.add(new LanguageStat(entry.getKey(), fc, lc, pct));
        }
        stats.sort((a, b) -> Integer.compare(b.getFileCount(), a.getFileCount()));
        return stats;
    }

    private BuildToolType detectBuildTool(Path projectRoot) {
        BuildToolType baseTool = BuildToolType.UNKNOWN;
        for (var entry : BUILD_CONFIG_FILES.entrySet()) {
            if (Files.exists(projectRoot.resolve(entry.getKey()))) {
                baseTool = entry.getValue();
                break;
            }
        }
        for (var entry : LOCK_FILE_OVERRIDES.entrySet()) {
            if (Files.exists(projectRoot.resolve(entry.getKey()))) {
                BuildToolType override = entry.getValue();
                if ((override == BuildToolType.YARN || override == BuildToolType.PNPM) && baseTool == BuildToolType.NPM) {
                    return override;
                }
                if (override == BuildToolType.POETRY && baseTool == BuildToolType.PIP) {
                    return override;
                }
            }
        }
        return baseTool;
    }

    private List<SubModule> detectSubModules(Path dir, Path rootDir) {
        List<SubModule> modules = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                if (!Files.isDirectory(entry)) continue;
                String name = entry.getFileName().toString();
                if (IGNORED_DIRS.contains(name) || name.startsWith(".")) continue;

                BuildToolType bt = detectBuildToolInDir(entry);
                if (bt != BuildToolType.UNKNOWN) {
                    String relPath = rootDir.relativize(entry).toString();
                    List<FileEntry> subFiles = collectFiles(entry, entry);
                    List<LanguageStat> subLangs = computeLanguageStats(subFiles);
                    String lang = subLangs.isEmpty() ? "unknown" : subLangs.get(0).getLanguage();
                    modules.add(new SubModule(name, relPath, lang, bt));
                }
                modules.addAll(detectSubModules(entry, rootDir));
            }
        } catch (IOException ignored) {}
        return modules;
    }

    private BuildToolType detectBuildToolInDir(Path dir) {
        BuildToolType baseTool = BuildToolType.UNKNOWN;
        for (var entry : BUILD_CONFIG_FILES.entrySet()) {
            if (Files.exists(dir.resolve(entry.getKey()))) {
                baseTool = entry.getValue();
                break;
            }
        }
        for (var entry : LOCK_FILE_OVERRIDES.entrySet()) {
            if (Files.exists(dir.resolve(entry.getKey()))) {
                BuildToolType override = entry.getValue();
                if ((override == BuildToolType.YARN || override == BuildToolType.PNPM) && baseTool == BuildToolType.NPM) {
                    return override;
                }
                if (override == BuildToolType.POETRY && baseTool == BuildToolType.PIP) {
                    return override;
                }
            }
        }
        return baseTool;
    }

    private FileStats computeFileStats(List<FileEntry> files) {
        int sourceFiles = 0, testFiles = 0, configFiles = 0, totalLines = 0;
        for (FileEntry f : files) {
            totalLines += f.lineCount;
            boolean isSource = SOURCE_EXTENSIONS.contains(f.extension);
            boolean isConfig = CONFIG_EXTENSIONS.contains(f.extension);
            boolean isTest = f.basename.contains(".test.") || f.basename.contains(".spec.")
                    || f.basename.contains("_test.") || f.basename.startsWith("test_")
                    || f.basename.endsWith("Test.java") || f.basename.contains("Spec.");
            if (isTest && isSource) testFiles++;
            else if (isSource) sourceFiles++;
            else if (isConfig) configFiles++;
        }
        return new FileStats(files.size(), sourceFiles, testFiles, configFiles, totalLines);
    }

    private record FileEntry(String relativePath, String extension, int lineCount, String basename) {}
}
