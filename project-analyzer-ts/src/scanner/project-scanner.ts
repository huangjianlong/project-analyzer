/**
 * ProjectScanner — 递归遍历项目目录，生成 ProjectProfile
 *
 * 识别主要语言、构建工具和子模块。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ProjectProfile,
  LanguageStat,
  BuildToolType,
  SubModule,
  FileStats,
} from '../models/index.js';
import { AnalysisException } from '../errors/index.js';

/** Directories to skip during traversal. */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  'target', 'vendor', '.gradle', '.idea', '.vscode',
  '.next', '.nuxt', 'coverage', '.tox', 'venv', '.venv',
  'env', '.env', 'egg-info',
]);

/** Extension → language mapping. */
const EXTENSION_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.c': 'C', '.h': 'C',
  '.cpp': 'C++', '.hpp': 'C++',
  '.cs': 'C#',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.scala': 'Scala',
};

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java',
  '.rb', '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.php',
  '.swift', '.kt', '.scala',
]);

const CONFIG_EXTENSIONS = new Set([
  '.json', '.yaml', '.yml', '.toml', '.xml', '.ini',
  '.cfg', '.env', '.properties',
]);

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /_test\./,
  /^test_/,
  /Test\.java$/,
  /Spec\./,
];

/** Build-tool config files and their corresponding tool type. */
const BUILD_CONFIG_FILES: Record<string, BuildToolType> = {
  'package.json': 'npm',
  'requirements.txt': 'pip',
  'setup.py': 'pip',
  'pyproject.toml': 'pip',
  'go.mod': 'go-mod',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle',
};

/** Lock files that refine the build tool. */
const LOCK_FILE_OVERRIDES: Record<string, BuildToolType> = {
  'yarn.lock': 'yarn',
  'pnpm-lock.yaml': 'pnpm',
  'poetry.lock': 'poetry',
};

/** ProjectScanner interface matching the design doc. */
export interface ProjectScanner {
  scan(projectPath: string): ProjectProfile;
}

interface FileEntry {
  relativePath: string;
  extension: string;
  lineCount: number;
  basename: string;
}

/**
 * Default implementation of ProjectScanner.
 */
export class DefaultProjectScanner implements ProjectScanner {
  scan(projectPath: string): ProjectProfile {
    const resolvedPath = path.resolve(projectPath);
    const projectName = path.basename(resolvedPath);

    // Validate path exists and is a directory
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      throw new AnalysisException({
        code: 'INVALID_PATH',
        message: `Path does not exist: ${resolvedPath}`,
        module: 'ProjectScanner',
        filePath: resolvedPath,
        recoverable: false,
      });
    }
    if (!stat.isDirectory()) {
      throw new AnalysisException({
        code: 'INVALID_PATH',
        message: `Path is not a directory: ${resolvedPath}`,
        module: 'ProjectScanner',
        filePath: resolvedPath,
        recoverable: false,
      });
    }

    // Collect all files
    const files = this.collectFiles(resolvedPath, resolvedPath);

    // Check for recognizable source files
    const hasSourceFiles = files.some((f) => SOURCE_EXTENSIONS.has(f.extension));
    if (!hasSourceFiles) {
      throw new AnalysisException({
        code: 'EMPTY_PROJECT',
        message: `No recognizable source code files found in: ${resolvedPath}`,
        module: 'ProjectScanner',
        filePath: resolvedPath,
        recoverable: false,
      });
    }

    // Compute language stats
    const languages = this.computeLanguageStats(files);
    const primaryLanguage = languages.length > 0 ? languages[0].language : 'unknown';

    // Detect build tool
    const buildTool = this.detectBuildTool(resolvedPath);

    // Detect sub-modules
    const modules = this.detectSubModules(resolvedPath, resolvedPath);

    // Compute file stats
    const fileStats = this.computeFileStats(files);

    return {
      projectName,
      projectPath: resolvedPath,
      primaryLanguage,
      languages,
      buildTool,
      modules,
      fileStats,
    };
  }

  /**
   * Recursively collect all files, skipping ignored directories.
   */
  private collectFiles(dir: string, rootDir: string): FileEntry[] {
    const entries: FileEntry[] = [];
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return entries;
    }

    for (const dirent of dirEntries) {
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        if (IGNORED_DIRS.has(dirent.name)) continue;
        entries.push(...this.collectFiles(fullPath, rootDir));
      } else if (dirent.isFile()) {
        const relativePath = path.relative(rootDir, fullPath);
        const extension = path.extname(dirent.name).toLowerCase();
        const lineCount = this.countLines(fullPath);
        entries.push({
          relativePath,
          extension,
          lineCount,
          basename: dirent.name,
        });
      }
    }

    return entries;
  }

  /**
   * Count lines in a file. Returns 0 on read failure.
   */
  private countLines(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.length === 0) return 0;
      return content.split('\n').length;
    } catch {
      return 0;
    }
  }

  /**
   * Compute language statistics from collected files, sorted by file count descending.
   */
  private computeLanguageStats(files: FileEntry[]): LanguageStat[] {
    const langMap = new Map<string, { fileCount: number; lineCount: number }>();

    for (const file of files) {
      const language = EXTENSION_LANGUAGE[file.extension];
      if (!language) continue;
      const existing = langMap.get(language) ?? { fileCount: 0, lineCount: 0 };
      existing.fileCount++;
      existing.lineCount += file.lineCount;
      langMap.set(language, existing);
    }

    const totalFiles = Array.from(langMap.values()).reduce((sum, v) => sum + v.fileCount, 0);

    const stats: LanguageStat[] = Array.from(langMap.entries())
      .map(([language, { fileCount, lineCount }]) => ({
        language,
        fileCount,
        lineCount,
        percentage: totalFiles > 0 ? Math.round((fileCount / totalFiles) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.fileCount - a.fileCount);

    return stats;
  }

  /**
   * Detect the primary build tool from config files in the project root.
   */
  private detectBuildTool(projectRoot: string): BuildToolType {
    let baseTool: BuildToolType = 'unknown';

    // Check for primary build config files
    for (const [configFile, tool] of Object.entries(BUILD_CONFIG_FILES)) {
      if (fs.existsSync(path.join(projectRoot, configFile))) {
        baseTool = tool;
        break;
      }
    }

    // Check for lock files that refine the tool
    for (const [lockFile, tool] of Object.entries(LOCK_FILE_OVERRIDES)) {
      if (fs.existsSync(path.join(projectRoot, lockFile))) {
        // Only override if the base tool is compatible
        if (
          (tool === 'yarn' || tool === 'pnpm') && baseTool === 'npm' ||
          tool === 'poetry' && baseTool === 'pip'
        ) {
          return tool;
        }
      }
    }

    return baseTool;
  }

  /**
   * Detect sub-modules: directories that contain their own build config.
   */
  private detectSubModules(dir: string, rootDir: string): SubModule[] {
    const modules: SubModule[] = [];
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return modules;
    }

    for (const dirent of dirEntries) {
      if (!dirent.isDirectory()) continue;
      if (IGNORED_DIRS.has(dirent.name)) continue;

      const subDir = path.join(dir, dirent.name);
      const relativePath = path.relative(rootDir, subDir);

      // Check if this directory has its own build config
      const buildTool = this.detectBuildToolInDir(subDir);
      if (buildTool !== 'unknown') {
        // Determine language from files in this sub-module
        const subFiles = this.collectFiles(subDir, subDir);
        const subLangs = this.computeLanguageStats(subFiles);
        const language = subLangs.length > 0 ? subLangs[0].language : 'unknown';

        modules.push({
          name: dirent.name,
          path: relativePath,
          language,
          buildTool,
        });
      }

      // Recurse into subdirectories to find nested sub-modules
      modules.push(...this.detectSubModules(subDir, rootDir));
    }

    return modules;
  }

  /**
   * Detect build tool in a specific directory (without lock-file refinement).
   */
  private detectBuildToolInDir(dir: string): BuildToolType {
    let baseTool: BuildToolType = 'unknown';

    for (const [configFile, tool] of Object.entries(BUILD_CONFIG_FILES)) {
      if (fs.existsSync(path.join(dir, configFile))) {
        baseTool = tool;
        break;
      }
    }

    // Check for lock files that refine the tool
    for (const [lockFile, tool] of Object.entries(LOCK_FILE_OVERRIDES)) {
      if (fs.existsSync(path.join(dir, lockFile))) {
        if (
          (tool === 'yarn' || tool === 'pnpm') && baseTool === 'npm' ||
          tool === 'poetry' && baseTool === 'pip'
        ) {
          return tool;
        }
      }
    }

    return baseTool;
  }

  /**
   * Compute file statistics.
   */
  private computeFileStats(files: FileEntry[]): FileStats {
    let sourceFiles = 0;
    let testFiles = 0;
    let configFiles = 0;
    let totalLines = 0;

    for (const file of files) {
      totalLines += file.lineCount;

      const isSource = SOURCE_EXTENSIONS.has(file.extension);
      const isConfig = CONFIG_EXTENSIONS.has(file.extension);
      const isTest = TEST_PATTERNS.some((p) => p.test(file.basename));

      if (isTest && isSource) {
        testFiles++;
      } else if (isSource) {
        sourceFiles++;
      } else if (isConfig) {
        configFiles++;
      }
    }

    return {
      totalFiles: files.length,
      sourceFiles,
      testFiles,
      configFiles,
      totalLines,
    };
  }
}
