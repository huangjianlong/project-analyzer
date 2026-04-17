/**
 * ArchitectureAnalyzer — 技术架构分析模块
 *
 * 实现 AnalysisModuleInterface，提供：
 * - 从所有语言插件收集依赖并按类别分组
 * - 识别核心框架和技术
 * - 识别项目分层结构（Controller/Service/Repository/Utility）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  SubModule,
  Dependency,
  DependencyCategory,
  ArchitectureResult,
  LayerInfo,
  FrameworkInfo,
  MermaidGraph,
} from '../models/index.js';

// ─── Framework detection mapping ───

interface FrameworkDef {
  name: string;
  category: string;
  packages: string[];
}

const KNOWN_FRAMEWORKS: FrameworkDef[] = [
  // JS/TS web frameworks
  { name: 'Express', category: 'web', packages: ['express'] },
  { name: 'Koa', category: 'web', packages: ['koa'] },
  { name: 'Fastify', category: 'web', packages: ['fastify'] },
  { name: 'Hapi', category: 'web', packages: ['hapi', '@hapi/hapi'] },
  { name: 'NestJS', category: 'web', packages: ['@nestjs/core', 'nestjs'] },
  { name: 'Next.js', category: 'web', packages: ['next'] },
  { name: 'Nuxt', category: 'web', packages: ['nuxt'] },
  // Frontend frameworks
  { name: 'React', category: 'frontend', packages: ['react'] },
  { name: 'Vue', category: 'frontend', packages: ['vue'] },
  { name: 'Angular', category: 'frontend', packages: ['@angular/core', 'angular'] },
  { name: 'Svelte', category: 'frontend', packages: ['svelte'] },
  // Python web frameworks
  { name: 'Django', category: 'web', packages: ['django'] },
  { name: 'Flask', category: 'web', packages: ['flask'] },
  { name: 'FastAPI', category: 'web', packages: ['fastapi'] },
  // Go web frameworks
  { name: 'Gin', category: 'web', packages: ['github.com/gin-gonic/gin'] },
  { name: 'Echo', category: 'web', packages: ['github.com/labstack/echo'] },
  { name: 'Fiber', category: 'web', packages: ['github.com/gofiber/fiber'] },
  // ORM / Database
  { name: 'TypeORM', category: 'orm', packages: ['typeorm'] },
  { name: 'Prisma', category: 'orm', packages: ['prisma', '@prisma/client'] },
  { name: 'Sequelize', category: 'orm', packages: ['sequelize'] },
  { name: 'Mongoose', category: 'orm', packages: ['mongoose'] },
  { name: 'SQLAlchemy', category: 'orm', packages: ['sqlalchemy'] },
  { name: 'GORM', category: 'orm', packages: ['gorm.io/gorm'] },
  // Testing
  { name: 'Jest', category: 'testing', packages: ['jest'] },
  { name: 'Vitest', category: 'testing', packages: ['vitest'] },
  { name: 'Pytest', category: 'testing', packages: ['pytest'] },
];

// ─── Layer detection patterns ───

interface LayerPattern {
  name: string;
  pattern: string;
  regex: RegExp;
}

const LAYER_PATTERNS: LayerPattern[] = [
  { name: 'Controller/Handler', pattern: 'controller*|handler*|route*|api*', regex: /^(controller|handler|route|api)/i },
  { name: 'Service', pattern: 'service*|business*|domain*', regex: /^(service|business|domain)/i },
  { name: 'Repository/Data', pattern: 'repo*|repository*|dao*|data*|model*|entity*', regex: /^(repo|repository|dao|data|model|entity)/i },
  { name: 'Utility', pattern: 'util*|helper*|common*|shared*|lib*', regex: /^(util|helper|common|shared|lib)/i },
];

// ─── ArchitectureAnalyzer ───

export class ArchitectureAnalyzer implements AnalysisModuleInterface {
  getName(): string {
    return 'architecture';
  }

  async analyze(profile: ProjectProfile, plugins: LanguagePlugin[]): Promise<ModuleResult> {
    // 1. Collect dependencies from all plugins
    const dependencies = this.collectDependencies(profile, plugins);

    // 2. Group dependencies by category
    const dependencyGroups = this.groupDependencies(dependencies);

    // 3. Identify core frameworks
    const frameworks = this.identifyFrameworks(dependencies);

    // 4. Identify project layers from directory structure
    const layers = this.identifyLayers(profile.projectPath);

    // 5. Generate module dependency graph if sub-modules exist
    const moduleDependencyGraph = this.buildModuleDependencyGraph(profile);

    const result: ArchitectureResult = {
      dependencies,
      dependencyGroups,
      layers,
      frameworks,
      moduleDependencyGraph,
    };

    return result;
  }

  /**
   * Collect dependencies from all language plugins.
   */
  private collectDependencies(profile: ProjectProfile, plugins: LanguagePlugin[]): Dependency[] {
    const allDeps: Dependency[] = [];
    const seen = new Set<string>();

    for (const plugin of plugins) {
      const deps = plugin.extractDependencies(profile.projectPath);
      for (const dep of deps) {
        const key = `${dep.group ?? ''}:${dep.name}:${dep.version}`;
        if (!seen.has(key)) {
          seen.add(key);
          allDeps.push(dep);
        }
      }
    }

    return allDeps;
  }

  /**
   * Group dependencies by their category.
   */
  private groupDependencies(dependencies: Dependency[]): Record<DependencyCategory, Dependency[]> {
    const groups: Record<DependencyCategory, Dependency[]> = {
      'web-framework': [],
      'database': [],
      'cache': [],
      'message-queue': [],
      'security': [],
      'testing': [],
      'logging': [],
      'utility': [],
      'other': [],
    };

    for (const dep of dependencies) {
      groups[dep.category].push(dep);
    }

    return groups;
  }

  /**
   * Identify core frameworks from the dependency list.
   */
  private identifyFrameworks(dependencies: Dependency[]): FrameworkInfo[] {
    const frameworks: FrameworkInfo[] = [];
    const depMap = new Map<string, Dependency>();

    for (const dep of dependencies) {
      depMap.set(dep.name.toLowerCase(), dep);
    }

    for (const fw of KNOWN_FRAMEWORKS) {
      for (const pkg of fw.packages) {
        const dep = depMap.get(pkg.toLowerCase());
        if (dep) {
          frameworks.push({
            name: fw.name,
            version: dep.version,
            category: fw.category,
            evidence: [`dependency: ${dep.name}@${dep.version}`],
          });
          break; // Only add each framework once
        }
      }
    }

    return frameworks;
  }

  /**
   * Identify project layers by scanning top-level and src-level directories.
   */
  private identifyLayers(projectPath: string): LayerInfo[] {
    const layers: LayerInfo[] = [];
    const dirsToScan = [projectPath];

    // Also scan common source directories
    for (const sub of ['src', 'lib', 'app', 'pkg', 'internal']) {
      const subPath = path.join(projectPath, sub);
      if (this.isDir(subPath)) {
        dirsToScan.push(subPath);
      }
    }

    for (const lp of LAYER_PATTERNS) {
      const matchedFiles: string[] = [];
      const matchedClasses: string[] = [];

      for (const dir of dirsToScan) {
        this.findMatchingDirs(dir, projectPath, lp.regex, matchedFiles, matchedClasses);
      }

      if (matchedFiles.length > 0) {
        layers.push({
          name: lp.name,
          pattern: lp.pattern,
          classes: matchedClasses,
          files: matchedFiles,
        });
      }
    }

    return layers;
  }

  /**
   * Find directories matching a layer pattern and collect their files.
   */
  private findMatchingDirs(
    searchDir: string,
    projectRoot: string,
    regex: RegExp,
    files: string[],
    classes: string[],
  ): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(searchDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      if (regex.test(entry.name)) {
        const dirPath = path.join(searchDir, entry.name);
        const dirFiles = this.listFilesRecursive(dirPath, projectRoot);
        files.push(...dirFiles);
        // Use file basenames (without extension) as class names
        for (const f of dirFiles) {
          const base = path.basename(f, path.extname(f));
          if (base && !base.startsWith('.')) {
            classes.push(base);
          }
        }
      }
    }
  }

  /**
   * Recursively list all files in a directory, returning relative paths.
   */
  private listFilesRecursive(dir: string, projectRoot: string): string[] {
    const result: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return result;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          result.push(...this.listFilesRecursive(fullPath, projectRoot));
        }
      } else if (entry.isFile()) {
        result.push(path.relative(projectRoot, fullPath));
      }
    }

    return result;
  }

  /**
   * Build a module dependency graph from sub-modules in the profile.
   * Returns undefined if there are fewer than 2 sub-modules.
   */
  buildModuleDependencyGraph(profile: ProjectProfile): MermaidGraph | undefined {
    const modules = profile.modules;
    if (!modules || modules.length < 2) {
      return undefined;
    }

    const nodes: string[] = modules.map((m) => m.name);
    const edges: { from: string; to: string; label?: string }[] = [];

    for (const mod of modules) {
      const deps = this.detectModuleDependencies(mod, modules, profile.projectPath);
      for (const d of deps) {
        edges.push(d);
      }
    }

    // Build Mermaid syntax
    const lines: string[] = ['graph TD'];
    for (const node of nodes) {
      const safeId = this.sanitizeMermaidId(node);
      lines.push(`  ${safeId}["${node}"]`);
    }
    for (const edge of edges) {
      const fromId = this.sanitizeMermaidId(edge.from);
      const toId = this.sanitizeMermaidId(edge.to);
      if (edge.label) {
        lines.push(`  ${fromId} -->|"${edge.label}"| ${toId}`);
      } else {
        lines.push(`  ${fromId} --> ${toId}`);
      }
    }

    return {
      syntax: lines.join('\n'),
      nodes,
      edges,
    };
  }

  /**
   * Detect dependencies of a single sub-module on other sub-modules.
   */
  private detectModuleDependencies(
    mod: SubModule,
    allModules: SubModule[],
    projectRoot: string,
  ): { from: string; to: string; label?: string }[] {
    const edges: { from: string; to: string; label?: string }[] = [];
    const otherModules = allModules.filter((m) => m.name !== mod.name);

    if (otherModules.length === 0) return edges;

    const modAbsPath = path.isAbsolute(mod.path) ? mod.path : path.join(projectRoot, mod.path);

    if (mod.buildTool === 'npm' || mod.buildTool === 'yarn' || mod.buildTool === 'pnpm') {
      edges.push(...this.detectNpmDependencies(mod, otherModules, modAbsPath));
    } else if (mod.buildTool === 'go-mod') {
      edges.push(...this.detectGoDependencies(mod, otherModules, modAbsPath));
    } else if (mod.buildTool === 'pip' || mod.buildTool === 'poetry') {
      edges.push(...this.detectPythonDependencies(mod, otherModules, modAbsPath));
    }

    return edges;
  }

  /**
   * Detect npm sub-module dependencies by reading package.json.
   */
  private detectNpmDependencies(
    mod: SubModule,
    otherModules: SubModule[],
    modAbsPath: string,
  ): { from: string; to: string; label?: string }[] {
    const edges: { from: string; to: string; label?: string }[] = [];
    const pkgPath = path.join(modAbsPath, 'package.json');

    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      return edges;
    }

    const depSections: { section: string; label: string }[] = [
      { section: 'dependencies', label: 'compile' },
      { section: 'devDependencies', label: 'test' },
      { section: 'peerDependencies', label: 'runtime' },
    ];

    for (const { section, label } of depSections) {
      const deps = pkgJson[section] as Record<string, string> | undefined;
      if (!deps) continue;
      const depNames = Object.keys(deps);
      for (const other of otherModules) {
        if (depNames.includes(other.name)) {
          edges.push({ from: mod.name, to: other.name, label });
        }
      }
    }

    return edges;
  }

  /**
   * Detect Go sub-module dependencies by reading go.mod.
   */
  private detectGoDependencies(
    mod: SubModule,
    otherModules: SubModule[],
    modAbsPath: string,
  ): { from: string; to: string; label?: string }[] {
    const edges: { from: string; to: string; label?: string }[] = [];
    const goModPath = path.join(modAbsPath, 'go.mod');

    let content: string;
    try {
      content = fs.readFileSync(goModPath, 'utf-8');
    } catch {
      return edges;
    }

    for (const other of otherModules) {
      // Check if go.mod requires the other module (by name or path)
      if (content.includes(other.name)) {
        edges.push({ from: mod.name, to: other.name, label: 'compile' });
      }
    }

    return edges;
  }

  /**
   * Detect Python sub-module dependencies by scanning .py files for imports.
   */
  private detectPythonDependencies(
    mod: SubModule,
    otherModules: SubModule[],
    modAbsPath: string,
  ): { from: string; to: string; label?: string }[] {
    const edges: { from: string; to: string; label?: string }[] = [];
    const pyFiles = this.listFilesRecursive(modAbsPath, modAbsPath).filter((f) => f.endsWith('.py'));

    // Collect all import lines from all .py files
    const importLines: string[] = [];
    for (const relFile of pyFiles) {
      const absFile = path.join(modAbsPath, relFile);
      try {
        const content = fs.readFileSync(absFile, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
            importLines.push(trimmed);
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    const found = new Set<string>();
    for (const other of otherModules) {
      if (found.has(other.name)) continue;
      for (const line of importLines) {
        if (line.includes(other.name)) {
          edges.push({ from: mod.name, to: other.name, label: 'runtime' });
          found.add(other.name);
          break;
        }
      }
    }

    return edges;
  }

  /**
   * Sanitize a module name for use as a Mermaid node ID.
   */
  private sanitizeMermaidId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private isDir(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target',
  '.gradle', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
]);
