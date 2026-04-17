import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OpsDocGenerator } from './ops-doc-generator.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  OpsResult,
  Dependency,
  DependencyCategory,
} from '../models/index.js';

// ─── Helpers ───

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ops-test-'));
}

function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeProfile(projectPath: string, overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    projectName: 'test-project',
    projectPath,
    primaryLanguage: 'typescript',
    languages: [{ language: 'typescript', fileCount: 10, lineCount: 500, percentage: 100 }],
    buildTool: 'npm',
    modules: [],
    fileStats: { totalFiles: 10, sourceFiles: 8, testFiles: 1, configFiles: 1, totalLines: 500 },
    ...overrides,
  };
}

function makePlugin(deps: Dependency[] = []): LanguagePlugin {
  return {
    getLanguageId: () => 'typescript',
    parseFile: () => [],
    extractDependencies: () => deps,
    identifyApis: () => [],
    identifyModules: () => [],
  };
}

function dep(name: string, category: DependencyCategory = 'other'): Dependency {
  return { name, version: '1.0.0', category, scope: 'runtime' };
}

// ─── Tests ───

describe('OpsDocGenerator', () => {
  const analyzer = new OpsDocGenerator();
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmDir(tmpDir); });

  it('getName returns "ops"', () => {
    expect(analyzer.getName()).toBe('ops');
  });

  // ─── 11.1: Startup detection ───

  describe('startup detection', () => {
    it('detects npm scripts (start, dev, serve, build)', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ scripts: { start: 'node index.js', dev: 'nodemon', build: 'tsc' } }),
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const npmScripts = result.startup.filter(s => s.method === 'npm-script');
      expect(npmScripts).toHaveLength(3);
      expect(npmScripts.map(s => s.command)).toContain('npm run start');
      expect(npmScripts.map(s => s.command)).toContain('npm run dev');
      expect(npmScripts.map(s => s.command)).toContain('npm run build');
      expect(npmScripts.every(s => !s.isInferred)).toBe(true);
    });

    it('detects main/index/app entry files with isInferred=true', async () => {
      fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'console.log("hi")');
      fs.writeFileSync(path.join(tmpDir, 'app.py'), 'print("hi")');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const entries = result.startup.filter(s => s.method === 'main-class');
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.every(s => s.isInferred)).toBe(true);
    });

    it('detects entry files in src/ directory', async () => {
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src', 'main.go'), 'package main');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const entries = result.startup.filter(s => s.method === 'main-class');
      expect(entries.some(s => s.filePath.includes('main.go'))).toBe(true);
    });

    it('detects Makefile targets', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Makefile'),
        'build:\n\tgo build\n\ntest:\n\tgo test ./...\n\nrun:\n\tgo run main.go\n',
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const makeTargets = result.startup.filter(s => s.method === 'makefile');
      expect(makeTargets).toHaveLength(3);
      expect(makeTargets.map(s => s.command)).toContain('make build');
      expect(makeTargets.map(s => s.command)).toContain('make test');
      expect(makeTargets.map(s => s.command)).toContain('make run');
    });

    it('returns empty startup for empty project', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.startup).toHaveLength(0);
    });
  });

  // ─── 11.1: Container config ───

  describe('container config parsing', () => {
    it('parses Dockerfile: FROM, EXPOSE, VOLUME, ENV', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'Dockerfile'),
        'FROM node:18-alpine\nEXPOSE 3000 8080\nVOLUME /data /logs\nENV NODE_ENV\nENV PORT\n',
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.containers).toBeDefined();
      const df = result.containers!.find(c => c.type === 'dockerfile')!;
      expect(df.baseImage).toBe('node:18-alpine');
      expect(df.ports).toEqual(['3000', '8080']);
      expect(df.volumes).toEqual(['/data', '/logs']);
      expect(df.envVars).toContain('NODE_ENV');
      expect(df.envVars).toContain('PORT');
    });

    it('parses docker-compose.yml services, ports, volumes, environment', async () => {
      const compose = {
        services: {
          app: { ports: ['3000:3000'], volumes: ['./data:/data'], environment: { NODE_ENV: 'production' } },
          db: { ports: ['5432:5432'] },
        },
      };
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), JSON.stringify(compose));
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const dc = result.containers!.find(c => c.type === 'docker-compose')!;
      expect(dc.services).toEqual(['app', 'db']);
      expect(dc.ports).toContain('3000:3000');
      expect(dc.ports).toContain('5432:5432');
      expect(dc.volumes).toContain('./data:/data');
      expect(dc.envVars).toContain('NODE_ENV');
    });

    it('returns no containers when none exist', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.containers).toBeUndefined();
    });
  });

  // ─── 11.1: CI/CD config ───

  describe('CI/CD config parsing', () => {
    it('parses GitHub Actions workflow', async () => {
      const workflowDir = path.join(tmpDir, '.github', 'workflows');
      fs.mkdirSync(workflowDir, { recursive: true });
      const workflow = {
        name: 'CI',
        on: ['push', 'pull_request'],
        jobs: {
          build: {
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Install', run: 'npm install' },
              { name: 'Test', run: 'npm test' },
            ],
          },
        },
      };
      fs.writeFileSync(path.join(workflowDir, 'ci.yml'), JSON.stringify(workflow));
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.cicd).toBeDefined();
      const gh = result.cicd!.find(c => c.type === 'github-actions')!;
      expect(gh.stages).toHaveLength(1);
      expect(gh.stages[0].name).toBe('build');
      expect(gh.stages[0].steps).toHaveLength(3);
      expect(gh.stages[0].triggers).toEqual(['push', 'pull_request']);
    });

    it('parses GitLab CI config', async () => {
      const gitlabCi = {
        stages: ['build', 'test', 'deploy'],
        build_job: { stage: 'build', script: ['npm install', 'npm run build'] },
        test_job: { stage: 'test', script: ['npm test'] },
      };
      fs.writeFileSync(path.join(tmpDir, '.gitlab-ci.yml'), JSON.stringify(gitlabCi));
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const gl = result.cicd!.find(c => c.type === 'gitlab-ci')!;
      expect(gl.stages.length).toBeGreaterThanOrEqual(2);
    });

    it('detects Jenkinsfile', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Jenkinsfile'), 'pipeline { agent any }');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const jk = result.cicd!.find(c => c.type === 'jenkins')!;
      expect(jk).toBeDefined();
      expect(jk.filePath).toBe('Jenkinsfile');
    });

    it('returns no cicd when none exist', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.cicd).toBeUndefined();
    });
  });

  // ─── 11.2: Config items ───

  describe('config items extraction', () => {
    it('parses .env file key=value pairs', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        'DATABASE_URL=postgres://localhost/db\nPORT=3000\n# comment\nSECRET_KEY=abc123\n',
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.configItems.length).toBe(3);
      const dbItem = result.configItems.find(c => c.key === 'DATABASE_URL')!;
      expect(dbItem.defaultValue).toBe('postgres://localhost/db');
      expect(dbItem.source).toBe('.env');
    });

    it('parses config.json with nested keys', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ server: { host: 'localhost', port: 3000 }, debug: true }),
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const keys = result.configItems.map(c => c.key);
      expect(keys).toContain('server.host');
      expect(keys).toContain('server.port');
      expect(keys).toContain('debug');
    });

    it('parses application.yml with nested keys', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'application.yml'),
        'server:\n  port: 8080\n  host: 0.0.0.0\nspring:\n  datasource:\n    url: jdbc:mysql://localhost/db\n',
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const keys = result.configItems.map(c => c.key);
      expect(keys).toContain('server.port');
      expect(keys).toContain('server.host');
      expect(keys).toContain('spring.datasource.url');
    });

    it('infers required for host/port/url keys', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'DB_HOST=localhost\nDB_PORT=5432\nLOG_LEVEL=info\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const hostItem = result.configItems.find(c => c.key === 'DB_HOST')!;
      const portItem = result.configItems.find(c => c.key === 'DB_PORT')!;
      const logItem = result.configItems.find(c => c.key === 'LOG_LEVEL')!;
      expect(hostItem.required).toBe(true);
      expect(portItem.required).toBe(true);
      expect(logItem.required).toBe(false);
    });

    it('returns empty config items when no config files exist', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.configItems).toHaveLength(0);
    });
  });

  // ─── 11.2: External services ───

  describe('external services detection', () => {
    it('detects services from config keys', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'DATABASE_URL=postgres://localhost/db\nREDIS_URL=redis://localhost\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const names = result.externalServices.map(s => s.name);
      expect(names).toContain('Database');
      expect(names).toContain('Redis');
    });

    it('detects services from dependencies via plugin', async () => {
      const plugin = makePlugin([dep('pg', 'database'), dep('ioredis', 'cache')]);
      const result = (await analyzer.analyze(makeProfile(tmpDir), [plugin])) as OpsResult;
      const names = result.externalServices.map(s => s.name);
      expect(names).toContain('PostgreSQL');
      expect(names).toContain('Redis');
    });

    it('detects services from package.json dependencies', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { mysql2: '^3.0.0', kafkajs: '^2.0.0' } }),
      );
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const names = result.externalServices.map(s => s.name);
      expect(names).toContain('MySQL');
      expect(names).toContain('Kafka');
    });

    it('deduplicates services from multiple sources', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env'), 'REDIS_URL=redis://localhost\n');
      const plugin = makePlugin([dep('redis', 'cache')]);
      const result = (await analyzer.analyze(makeProfile(tmpDir), [plugin])) as OpsResult;
      const redisServices = result.externalServices.filter(s => s.name === 'Redis');
      expect(redisServices).toHaveLength(1);
      expect(redisServices[0].evidence.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty services when nothing detected', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.externalServices).toHaveLength(0);
    });
  });

  // ─── 11.3: Environment comparison ───

  describe('environment comparison', () => {
    it('compares .env.dev and .env.prod files', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'PORT=3000\nDB_HOST=localhost\nDEBUG=true\n');
      fs.writeFileSync(path.join(tmpDir, '.env.prod'), 'PORT=8080\nDB_HOST=prod-db.example.com\nDEBUG=false\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.envComparison).toBeDefined();
      const cmp = result.envComparison!;
      expect(cmp.environments.sort()).toEqual(['dev', 'prod']);
      expect(cmp.items.length).toBe(3);

      const portItem = cmp.items.find(i => i.key === 'PORT')!;
      expect(portItem.values['dev']).toBe('3000');
      expect(portItem.values['prod']).toBe('8080');
      expect(portItem.isDifferent).toBe(true);
    });

    it('marks items with same values as isDifferent=false', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'APP_NAME=myapp\n');
      fs.writeFileSync(path.join(tmpDir, '.env.test'), 'APP_NAME=myapp\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const cmp = result.envComparison!;
      const appItem = cmp.items.find(i => i.key === 'APP_NAME')!;
      expect(appItem.isDifferent).toBe(false);
    });

    it('marks items missing in some environments as isDifferent=true', async () => {
      fs.writeFileSync(path.join(tmpDir, '.env.dev'), 'PORT=3000\nDEBUG=true\n');
      fs.writeFileSync(path.join(tmpDir, '.env.prod'), 'PORT=8080\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      const cmp = result.envComparison!;
      const debugItem = cmp.items.find(i => i.key === 'DEBUG')!;
      expect(debugItem.isDifferent).toBe(true);
      expect(debugItem.values['prod']).toBeUndefined();
    });

    it('compares application-{env}.yml files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'application-dev.yml'), 'server:\n  port: 8080\n');
      fs.writeFileSync(path.join(tmpDir, 'application-prod.yml'), 'server:\n  port: 80\n');
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.envComparison).toBeDefined();
      const cmp = result.envComparison!;
      const portItem = cmp.items.find(i => i.key === 'server.port')!;
      expect(portItem.values['dev']).toBe('8080');
      expect(portItem.values['prod']).toBe('80');
      expect(portItem.isDifferent).toBe(true);
    });

    it('skips .env.example and .env.sample', () => {
      fs.writeFileSync(path.join(tmpDir, '.env.example'), 'KEY=value\n');
      fs.writeFileSync(path.join(tmpDir, '.env.sample'), 'KEY=value\n');
      const files = analyzer.findEnvSpecificFiles(tmpDir);
      expect(files).toHaveLength(0);
    });

    it('returns undefined when no env-specific files exist', async () => {
      const result = (await analyzer.analyze(makeProfile(tmpDir), [])) as OpsResult;
      expect(result.envComparison).toBeUndefined();
    });
  });

  // ─── Dockerfile parsing edge cases ───

  describe('Dockerfile parsing edge cases', () => {
    it('handles VOLUME as JSON array', () => {
      const config = analyzer.parseDockerfile(
        'FROM alpine\nVOLUME ["/data", "/logs"]\n',
        'Dockerfile',
      );
      expect(config.volumes).toEqual(['/data', '/logs']);
    });

    it('handles multiple FROM (multi-stage)', () => {
      const config = analyzer.parseDockerfile(
        'FROM node:18 AS builder\nFROM node:18-alpine\nEXPOSE 3000\n',
        'Dockerfile',
      );
      // Last FROM wins
      expect(config.baseImage).toBe('node:18-alpine');
      expect(config.ports).toEqual(['3000']);
    });
  });
});
