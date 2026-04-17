/**
 * OpsDocGenerator — 启动/部署/配置说明书生成模块
 *
 * 识别启动方式、解析容器化和 CI/CD 配置、提取配置项、
 * 识别外部依赖服务、生成环境配置对照表。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  OpsResult,
  StartupInfo,
  ContainerConfig,
  CiCdPipeline,
  CiCdStage,
  ConfigItem,
  ExternalService,
  EnvComparisonTable,
  EnvComparisonItem,
} from '../models/index.js';

// ─── Service detection maps ───

const CONFIG_KEY_SERVICE_MAP: Record<string, { name: string; type: ExternalService['type'] }> = {
  DATABASE_URL: { name: 'Database', type: 'database' },
  DB_HOST: { name: 'Database', type: 'database' },
  DB_URL: { name: 'Database', type: 'database' },
  MYSQL_HOST: { name: 'MySQL', type: 'database' },
  POSTGRES_HOST: { name: 'PostgreSQL', type: 'database' },
  MONGO_URI: { name: 'MongoDB', type: 'database' },
  MONGODB_URI: { name: 'MongoDB', type: 'database' },
  REDIS_URL: { name: 'Redis', type: 'cache' },
  REDIS_HOST: { name: 'Redis', type: 'cache' },
  RABBITMQ_URL: { name: 'RabbitMQ', type: 'message-queue' },
  AMQP_URL: { name: 'RabbitMQ', type: 'message-queue' },
  KAFKA_BROKERS: { name: 'Kafka', type: 'message-queue' },
  KAFKA_BOOTSTRAP_SERVERS: { name: 'Kafka', type: 'message-queue' },
  ELASTICSEARCH_URL: { name: 'Elasticsearch', type: 'search-engine' },
  ES_HOST: { name: 'Elasticsearch', type: 'search-engine' },
};

const DEP_SERVICE_MAP: Record<string, { name: string; type: ExternalService['type'] }> = {
  mysql: { name: 'MySQL', type: 'database' },
  mysql2: { name: 'MySQL', type: 'database' },
  pg: { name: 'PostgreSQL', type: 'database' },
  mongodb: { name: 'MongoDB', type: 'database' },
  mongoose: { name: 'MongoDB', type: 'database' },
  redis: { name: 'Redis', type: 'cache' },
  ioredis: { name: 'Redis', type: 'cache' },
  amqplib: { name: 'RabbitMQ', type: 'message-queue' },
  kafkajs: { name: 'Kafka', type: 'message-queue' },
  elasticsearch: { name: 'Elasticsearch', type: 'search-engine' },
  '@elastic/elasticsearch': { name: 'Elasticsearch', type: 'search-engine' },
  typeorm: { name: 'Database ORM', type: 'database' },
  sequelize: { name: 'Database ORM', type: 'database' },
  prisma: { name: 'Database ORM', type: 'database' },
  '@prisma/client': { name: 'Database ORM', type: 'database' },
};


export class OpsDocGenerator implements AnalysisModuleInterface {
  getName(): string {
    return 'ops';
  }

  async analyze(profile: ProjectProfile, plugins: LanguagePlugin[]): Promise<ModuleResult> {
    const root = profile.projectPath;

    const startup = this.detectStartup(root, profile);
    const containers = this.parseContainers(root);
    const cicd = this.parseCiCd(root);
    const configItems = this.extractConfigItems(root);
    const externalServices = this.detectExternalServices(root, configItems, plugins);
    const envComparison = this.buildEnvComparison(root);

    const result: OpsResult = {
      startup,
      configItems,
      externalServices,
    };
    if (containers.length > 0) result.containers = containers;
    if (cicd.length > 0) result.cicd = cicd;
    if (envComparison) result.envComparison = envComparison;

    return result;
  }

  // ─── 11.1: Startup detection ───

  private detectStartup(root: string, profile: ProjectProfile): StartupInfo[] {
    const results: StartupInfo[] = [];

    // npm scripts
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts as Record<string, string> | undefined;
        if (scripts) {
          for (const key of ['start', 'dev', 'serve', 'build']) {
            if (scripts[key]) {
              results.push({
                method: 'npm-script',
                command: `npm run ${key}`,
                description: `npm script "${key}": ${scripts[key]}`,
                filePath: 'package.json',
                isInferred: false,
              });
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Main / entry files
    const entryPatterns = ['main', 'index', 'app', 'server'];
    const exts = ['.ts', '.js', '.py', '.go'];
    const srcDirs = ['', 'src'];
    for (const dir of srcDirs) {
      const base = dir ? path.join(root, dir) : root;
      if (!this.isDir(base)) continue;
      for (const name of entryPatterns) {
        for (const ext of exts) {
          const filePath = path.join(base, `${name}${ext}`);
          if (fs.existsSync(filePath)) {
            const relPath = path.relative(root, filePath);
            results.push({
              method: 'main-class',
              command: this.inferRunCommand(ext, relPath),
              description: `Entry file: ${relPath}`,
              filePath: relPath,
              isInferred: true,
            });
          }
        }
      }
    }

    // Makefile
    const makefilePath = path.join(root, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      try {
        const content = fs.readFileSync(makefilePath, 'utf-8');
        const targets = this.parseMakefileTargets(content);
        for (const target of targets) {
          results.push({
            method: 'makefile',
            command: `make ${target}`,
            description: `Makefile target: ${target}`,
            filePath: 'Makefile',
            isInferred: false,
          });
        }
      } catch { /* ignore */ }
    }

    return results;
  }

  private inferRunCommand(ext: string, relPath: string): string {
    switch (ext) {
      case '.ts': return `npx ts-node ${relPath}`;
      case '.js': return `node ${relPath}`;
      case '.py': return `python ${relPath}`;
      case '.go': return `go run ${relPath}`;
      default: return relPath;
    }
  }

  private parseMakefileTargets(content: string): string[] {
    const targets: string[] = [];
    for (const line of content.split('\n')) {
      const match = /^([a-zA-Z_][\w-]*)\s*:/.exec(line);
      if (match) targets.push(match[1]);
    }
    return targets;
  }

  // ─── 11.1: Container config parsing ───

  private parseContainers(root: string): ContainerConfig[] {
    const results: ContainerConfig[] = [];

    // Dockerfile
    const dockerfilePath = path.join(root, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      try {
        const content = fs.readFileSync(dockerfilePath, 'utf-8');
        results.push(this.parseDockerfile(content, 'Dockerfile'));
      } catch { /* ignore */ }
    }

    // docker-compose.yml / docker-compose.yaml
    for (const name of ['docker-compose.yml', 'docker-compose.yaml']) {
      const composePath = path.join(root, name);
      if (fs.existsSync(composePath)) {
        try {
          const content = fs.readFileSync(composePath, 'utf-8');
          results.push(this.parseDockerCompose(content, name));
        } catch { /* ignore */ }
      }
    }

    return results;
  }

  parseDockerfile(content: string, filePath: string): ContainerConfig {
    let baseImage: string | undefined;
    const ports: string[] = [];
    const volumes: string[] = [];
    const envVars: string[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const fromMatch = /^FROM\s+(\S+)/i.exec(trimmed);
      if (fromMatch) baseImage = fromMatch[1];

      const exposeMatch = /^EXPOSE\s+(.+)/i.exec(trimmed);
      if (exposeMatch) ports.push(...exposeMatch[1].trim().split(/\s+/));

      const volumeMatch = /^VOLUME\s+(.+)/i.exec(trimmed);
      if (volumeMatch) {
        const raw = volumeMatch[1].trim();
        // VOLUME can be JSON array or space-separated
        if (raw.startsWith('[')) {
          try {
            const arr = JSON.parse(raw) as string[];
            volumes.push(...arr);
          } catch {
            volumes.push(raw);
          }
        } else {
          volumes.push(...raw.split(/\s+/));
        }
      }

      const envMatch = /^ENV\s+(\S+)/i.exec(trimmed);
      if (envMatch) envVars.push(envMatch[1]);
    }

    return {
      type: 'dockerfile',
      filePath,
      baseImage,
      ports,
      volumes,
      envVars,
      description: baseImage ? `Docker image based on ${baseImage}` : 'Dockerfile configuration',
    };
  }

  parseDockerCompose(content: string, filePath: string): ContainerConfig {
    const ports: string[] = [];
    const volumes: string[] = [];
    const envVars: string[] = [];
    const services: string[] = [];

    try {
      const doc = yaml.load(content) as Record<string, unknown>;
      const svcMap = (doc?.services ?? {}) as Record<string, Record<string, unknown>>;

      for (const [svcName, svc] of Object.entries(svcMap)) {
        services.push(svcName);
        if (Array.isArray(svc.ports)) {
          ports.push(...svc.ports.map(String));
        }
        if (Array.isArray(svc.volumes)) {
          volumes.push(...svc.volumes.map(String));
        }
        if (Array.isArray(svc.environment)) {
          envVars.push(...svc.environment.map(String));
        } else if (svc.environment && typeof svc.environment === 'object') {
          envVars.push(...Object.keys(svc.environment as Record<string, unknown>));
        }
      }
    } catch { /* ignore yaml parse errors */ }

    return {
      type: 'docker-compose',
      filePath,
      ports,
      volumes,
      envVars,
      services,
      description: `Docker Compose with ${services.length} service(s): ${services.join(', ') || 'none'}`,
    };
  }

  // ─── 11.1: CI/CD config parsing ───

  private parseCiCd(root: string): CiCdPipeline[] {
    const results: CiCdPipeline[] = [];

    // GitHub Actions
    const workflowsDir = path.join(root, '.github', 'workflows');
    if (this.isDir(workflowsDir)) {
      try {
        const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        for (const file of files) {
          const filePath = path.join('.github', 'workflows', file);
          const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
          const pipeline = this.parseGitHubActions(content, filePath);
          if (pipeline) results.push(pipeline);
        }
      } catch { /* ignore */ }
    }

    // GitLab CI
    const gitlabCiPath = path.join(root, '.gitlab-ci.yml');
    if (fs.existsSync(gitlabCiPath)) {
      try {
        const content = fs.readFileSync(gitlabCiPath, 'utf-8');
        const pipeline = this.parseGitLabCi(content, '.gitlab-ci.yml');
        if (pipeline) results.push(pipeline);
      } catch { /* ignore */ }
    }

    // Jenkinsfile
    const jenkinsfilePath = path.join(root, 'Jenkinsfile');
    if (fs.existsSync(jenkinsfilePath)) {
      results.push({
        type: 'jenkins',
        filePath: 'Jenkinsfile',
        stages: [{ name: 'pipeline', steps: ['See Jenkinsfile for details'] }],
        description: 'Jenkins pipeline configuration',
      });
    }

    return results;
  }

  private parseGitHubActions(content: string, filePath: string): CiCdPipeline | null {
    try {
      const doc = yaml.load(content) as Record<string, unknown>;
      if (!doc) return null;

      const stages: CiCdStage[] = [];
      const jobs = (doc.jobs ?? {}) as Record<string, Record<string, unknown>>;

      for (const [jobName, job] of Object.entries(jobs)) {
        const steps: string[] = [];
        if (Array.isArray(job.steps)) {
          for (const step of job.steps) {
            const s = step as Record<string, unknown>;
            if (s.name) steps.push(String(s.name));
            else if (s.uses) steps.push(String(s.uses));
            else if (s.run) steps.push(String(s.run).split('\n')[0]);
          }
        }

        const triggers: string[] = [];
        if (doc.on) {
          if (typeof doc.on === 'string') triggers.push(doc.on);
          else if (Array.isArray(doc.on)) triggers.push(...doc.on.map(String));
          else if (typeof doc.on === 'object') triggers.push(...Object.keys(doc.on as Record<string, unknown>));
        }

        stages.push({ name: jobName, steps, triggers: triggers.length > 0 ? triggers : undefined });
      }

      const name = doc.name ? String(doc.name) : filePath;
      return {
        type: 'github-actions',
        filePath,
        stages,
        description: `GitHub Actions workflow: ${name}`,
      };
    } catch {
      return null;
    }
  }

  private parseGitLabCi(content: string, filePath: string): CiCdPipeline | null {
    try {
      const doc = yaml.load(content) as Record<string, unknown>;
      if (!doc) return null;

      const stages: CiCdStage[] = [];
      const stageList = (doc.stages ?? []) as string[];

      // Extract jobs grouped by stage
      for (const [key, value] of Object.entries(doc)) {
        if (key === 'stages' || key === 'variables' || key === 'image' || key === 'default' || key.startsWith('.')) continue;
        const job = value as Record<string, unknown>;
        const stageName = job.stage ? String(job.stage) : 'default';
        const steps: string[] = [];
        if (Array.isArray(job.script)) {
          steps.push(...job.script.map(String));
        }
        stages.push({ name: `${stageName}/${key}`, steps });
      }

      return {
        type: 'gitlab-ci',
        filePath,
        stages,
        description: `GitLab CI pipeline with stages: ${stageList.join(', ') || 'default'}`,
      };
    } catch {
      return null;
    }
  }

  // ─── 11.2: Config items extraction ───

  private extractConfigItems(root: string): ConfigItem[] {
    const items: ConfigItem[] = [];

    // .env files (base only — env-specific handled in comparison)
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) {
      items.push(...this.parseEnvFile(envPath, '.env'));
    }

    // config.json
    const configJsonPath = path.join(root, 'config.json');
    if (fs.existsSync(configJsonPath)) {
      items.push(...this.parseConfigJson(configJsonPath, 'config.json'));
    }

    // application.yml / application.yaml
    for (const name of ['application.yml', 'application.yaml']) {
      const ymlPath = path.join(root, name);
      if (fs.existsSync(ymlPath)) {
        items.push(...this.parseApplicationYaml(ymlPath, name));
      }
    }

    return items;
  }

  parseEnvFile(filePath: string, source: string, environment?: string): ConfigItem[] {
    const items: ConfigItem[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim();
        if (!key) continue;
        items.push({
          key,
          defaultValue: value || undefined,
          description: this.inferConfigDescription(key),
          required: this.inferRequired(key),
          source,
          environment,
        });
      }
    } catch { /* ignore */ }
    return items;
  }

  private parseConfigJson(filePath: string, source: string): ConfigItem[] {
    const items: ConfigItem[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const obj = JSON.parse(content) as Record<string, unknown>;
      this.flattenJsonKeys(obj, '', items, source);
    } catch { /* ignore */ }
    return items;
  }

  private flattenJsonKeys(
    obj: Record<string, unknown>,
    prefix: string,
    items: ConfigItem[],
    source: string,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenJsonKeys(value as Record<string, unknown>, fullKey, items, source);
      } else {
        items.push({
          key: fullKey,
          defaultValue: value != null ? String(value) : undefined,
          description: this.inferConfigDescription(fullKey),
          required: this.inferRequired(fullKey),
          source,
        });
      }
    }
  }

  parseApplicationYaml(filePath: string, source: string, environment?: string): ConfigItem[] {
    const items: ConfigItem[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const doc = yaml.load(content);
      if (doc && typeof doc === 'object') {
        this.flattenYamlKeys(doc as Record<string, unknown>, '', items, source, environment);
      }
    } catch { /* ignore */ }
    return items;
  }

  private flattenYamlKeys(
    obj: Record<string, unknown>,
    prefix: string,
    items: ConfigItem[],
    source: string,
    environment?: string,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenYamlKeys(value as Record<string, unknown>, fullKey, items, source, environment);
      } else {
        items.push({
          key: fullKey,
          defaultValue: value != null ? String(value) : undefined,
          description: this.inferConfigDescription(fullKey),
          required: this.inferRequired(fullKey),
          source,
          environment,
        });
      }
    }
  }

  private inferConfigDescription(key: string): string {
    const lower = key.toLowerCase();
    if (lower.includes('host')) return 'Host address';
    if (lower.includes('port')) return 'Port number';
    if (lower.includes('password') || lower.includes('secret')) return 'Secret/password value';
    if (lower.includes('url') || lower.includes('uri')) return 'Connection URL';
    if (lower.includes('database') || lower.includes('db')) return 'Database configuration';
    if (lower.includes('redis')) return 'Redis configuration';
    if (lower.includes('key') || lower.includes('token')) return 'API key or token';
    if (lower.includes('log')) return 'Logging configuration';
    if (lower.includes('timeout')) return 'Timeout setting';
    return `Configuration: ${key}`;
  }

  private inferRequired(key: string): boolean {
    const lower = key.toLowerCase();
    return (
      lower.includes('host') ||
      lower.includes('port') ||
      lower.includes('url') ||
      lower.includes('uri') ||
      lower.includes('database') ||
      lower.includes('db_name')
    );
  }

  // ─── 11.2: External services detection ───

  private detectExternalServices(
    root: string,
    configItems: ConfigItem[],
    plugins: LanguagePlugin[],
  ): ExternalService[] {
    const serviceMap = new Map<string, ExternalService>();

    // From config keys
    for (const item of configItems) {
      const upperKey = item.key.toUpperCase().replace(/\./g, '_');
      for (const [pattern, svc] of Object.entries(CONFIG_KEY_SERVICE_MAP)) {
        if (upperKey.includes(pattern)) {
          if (!serviceMap.has(svc.name)) {
            serviceMap.set(svc.name, {
              name: svc.name,
              type: svc.type,
              evidence: [`Config key: ${item.key}`],
              connectionConfig: item.key,
            });
          } else {
            serviceMap.get(svc.name)!.evidence.push(`Config key: ${item.key}`);
          }
        }
      }
    }

    // From dependencies
    for (const plugin of plugins) {
      const deps = plugin.extractDependencies(root);
      for (const dep of deps) {
        const svc = DEP_SERVICE_MAP[dep.name];
        if (svc) {
          if (!serviceMap.has(svc.name)) {
            serviceMap.set(svc.name, {
              name: svc.name,
              type: svc.type,
              evidence: [`Dependency: ${dep.name}`],
            });
          } else {
            serviceMap.get(svc.name)!.evidence.push(`Dependency: ${dep.name}`);
          }
        }
      }
    }

    // Also check package.json dependencies directly
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
        for (const depName of Object.keys(allDeps)) {
          const svc = DEP_SERVICE_MAP[depName];
          if (svc && !serviceMap.has(svc.name)) {
            serviceMap.set(svc.name, {
              name: svc.name,
              type: svc.type,
              evidence: [`Dependency: ${depName}`],
            });
          }
        }
      } catch { /* ignore */ }
    }

    return Array.from(serviceMap.values());
  }

  // ─── 11.3: Environment comparison ───

  private buildEnvComparison(root: string): EnvComparisonTable | undefined {
    const envFiles = this.findEnvSpecificFiles(root);
    if (envFiles.length === 0) return undefined;

    const environments: string[] = [];
    const envData = new Map<string, Map<string, string>>();

    for (const { environment, filePath } of envFiles) {
      environments.push(environment);
      const fullPath = path.join(root, filePath);
      const kvMap = new Map<string, string>();

      if (filePath.endsWith('.env') || filePath.startsWith('.env.')) {
        const items = this.parseEnvFile(fullPath, filePath, environment);
        for (const item of items) {
          kvMap.set(item.key, item.defaultValue ?? '');
        }
      } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        const items = this.parseApplicationYaml(fullPath, filePath, environment);
        for (const item of items) {
          kvMap.set(item.key, item.defaultValue ?? '');
        }
      }

      envData.set(environment, kvMap);
    }

    if (environments.length === 0) return undefined;

    // Collect all keys
    const allKeys = new Set<string>();
    for (const kvMap of envData.values()) {
      for (const key of kvMap.keys()) {
        allKeys.add(key);
      }
    }

    const items: EnvComparisonItem[] = [];
    for (const key of Array.from(allKeys).sort()) {
      const values: Record<string, string | undefined> = {};
      const valueSet = new Set<string | undefined>();
      for (const env of environments) {
        const val = envData.get(env)?.get(key);
        values[env] = val;
        valueSet.add(val);
      }
      // isDifferent if values differ across environments (ignoring undefined)
      const definedValues = Array.from(valueSet).filter(v => v !== undefined);
      const isDifferent = definedValues.length > 1 || (valueSet.has(undefined) && definedValues.length > 0);
      items.push({ key, values, isDifferent });
    }

    return { environments, items };
  }

  findEnvSpecificFiles(root: string): { environment: string; filePath: string }[] {
    const results: { environment: string; filePath: string }[] = [];

    // .env.{env} files
    try {
      const files = fs.readdirSync(root);
      for (const file of files) {
        const match = /^\.env\.(\w+)$/.exec(file);
        if (match) {
          const env = match[1];
          // Skip common non-environment suffixes
          if (['example', 'sample', 'template', 'local', 'bak'].includes(env)) continue;
          results.push({ environment: env, filePath: file });
        }
      }
    } catch { /* ignore */ }

    // application-{env}.yml / application-{env}.yaml
    for (const ext of ['.yml', '.yaml']) {
      try {
        const files = fs.readdirSync(root);
        for (const file of files) {
          const match = new RegExp(`^application-(\\w+)${ext.replace('.', '\\.')}$`).exec(file);
          if (match) {
            results.push({ environment: match[1], filePath: file });
          }
        }
      } catch { /* ignore */ }
    }

    return results;
  }

  // ─── Utility ───

  private isDir(p: string): boolean {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  }
}
