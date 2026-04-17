package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

public class OpsDocGenerator implements AnalysisModuleInterface {

    private static final Map<String, ExternalServiceDef> CONFIG_KEY_SERVICE_MAP = new HashMap<>();
    private static final Map<String, ExternalServiceDef> DEP_SERVICE_MAP = new HashMap<>();

    private record ExternalServiceDef(String name, String type) {}

    static {
        CONFIG_KEY_SERVICE_MAP.put("DATABASE_URL", new ExternalServiceDef("Database", "database"));
        CONFIG_KEY_SERVICE_MAP.put("DB_HOST", new ExternalServiceDef("Database", "database"));
        CONFIG_KEY_SERVICE_MAP.put("MYSQL_HOST", new ExternalServiceDef("MySQL", "database"));
        CONFIG_KEY_SERVICE_MAP.put("POSTGRES_HOST", new ExternalServiceDef("PostgreSQL", "database"));
        CONFIG_KEY_SERVICE_MAP.put("MONGO_URI", new ExternalServiceDef("MongoDB", "database"));
        CONFIG_KEY_SERVICE_MAP.put("REDIS_URL", new ExternalServiceDef("Redis", "cache"));
        CONFIG_KEY_SERVICE_MAP.put("REDIS_HOST", new ExternalServiceDef("Redis", "cache"));
        CONFIG_KEY_SERVICE_MAP.put("RABBITMQ_URL", new ExternalServiceDef("RabbitMQ", "message-queue"));
        CONFIG_KEY_SERVICE_MAP.put("KAFKA_BROKERS", new ExternalServiceDef("Kafka", "message-queue"));
        CONFIG_KEY_SERVICE_MAP.put("ELASTICSEARCH_URL", new ExternalServiceDef("Elasticsearch", "search-engine"));

        DEP_SERVICE_MAP.put("mysql-connector-java", new ExternalServiceDef("MySQL", "database"));
        DEP_SERVICE_MAP.put("postgresql", new ExternalServiceDef("PostgreSQL", "database"));
        DEP_SERVICE_MAP.put("spring-data-redis", new ExternalServiceDef("Redis", "cache"));
        DEP_SERVICE_MAP.put("jedis", new ExternalServiceDef("Redis", "cache"));
        DEP_SERVICE_MAP.put("spring-kafka", new ExternalServiceDef("Kafka", "message-queue"));
        DEP_SERVICE_MAP.put("spring-amqp", new ExternalServiceDef("RabbitMQ", "message-queue"));
        DEP_SERVICE_MAP.put("mybatis", new ExternalServiceDef("Database ORM", "database"));
        DEP_SERVICE_MAP.put("hibernate-core", new ExternalServiceDef("Database ORM", "database"));
    }

    @Override
    public String getName() { return "ops"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        Path root = Path.of(profile.getProjectPath());
        List<StartupInfo> startup = detectStartup(root, profile);
        List<ContainerConfig> containers = parseContainers(root);
        List<CiCdPipeline> cicd = parseCiCd(root);
        List<ConfigItem> configItems = extractConfigItems(root);
        List<ExternalService> externalServices = detectExternalServices(configItems, plugins, root);
        EnvComparisonTable envComparison = buildEnvComparison(root);

        OpsResult result = new OpsResult();
        result.setStartup(startup);
        result.setContainers(containers.isEmpty() ? null : containers);
        result.setCicd(cicd.isEmpty() ? null : cicd);
        result.setConfigItems(configItems);
        result.setExternalServices(externalServices);
        result.setEnvComparison(envComparison);
        return result;
    }

    private List<StartupInfo> detectStartup(Path root, ProjectProfile profile) {
        List<StartupInfo> results = new ArrayList<>();
        // Maven/Gradle
        if (profile.getBuildTool() == ProjectProfile.BuildToolType.MAVEN) {
            results.add(createStartup("script", "mvn spring-boot:run", "Maven Spring Boot 启动", "pom.xml", true));
        } else if (profile.getBuildTool() == ProjectProfile.BuildToolType.GRADLE) {
            results.add(createStartup("script", "./gradlew bootRun", "Gradle Spring Boot 启动", "build.gradle", true));
        }
        // package.json scripts
        Path pkgPath = root.resolve("package.json");
        if (Files.exists(pkgPath)) {
            try {
                String content = Files.readString(pkgPath);
                for (String script : List.of("start", "dev", "serve")) {
                    if (content.contains("\"" + script + "\"")) {
                        results.add(createStartup("npm-script", "npm run " + script,
                                "npm 脚本 \"" + script + "\":", "package.json", false));
                    }
                }
            } catch (IOException ignored) {}
        }
        // Main class detection
        for (String dir : List.of("", "src", "src/main/java")) {
            Path base = root.resolve(dir);
            if (!Files.isDirectory(base)) continue;
            for (String name : List.of("Main.java", "Application.java", "App.java")) {
                try {
                    Files.walk(base, 5).filter(p -> p.getFileName().toString().equals(name)).findFirst()
                            .ifPresent(p -> {
                                String rel = root.relativize(p).toString();
                                results.add(createStartup("main-class", "java -jar target/*.jar",
                                        "主类: " + rel, rel, true));
                            });
                } catch (IOException ignored) {}
            }
        }
        // Makefile
        Path makefile = root.resolve("Makefile");
        if (Files.exists(makefile)) {
            try {
                String content = Files.readString(makefile);
                Pattern p = Pattern.compile("^([a-zA-Z_][\\w-]*)\\s*:", Pattern.MULTILINE);
                Matcher m = p.matcher(content);
                while (m.find()) {
                    results.add(createStartup("makefile", "make " + m.group(1),
                            "Makefile 目标: " + m.group(1), "Makefile", false));
                }
            } catch (IOException ignored) {}
        }
        return results;
    }

    private StartupInfo createStartup(String method, String cmd, String desc, String file, boolean inferred) {
        StartupInfo si = new StartupInfo();
        si.setMethod(method); si.setCommand(cmd); si.setDescription(desc);
        si.setFilePath(file); si.setInferred(inferred);
        return si;
    }

    private List<ContainerConfig> parseContainers(Path root) {
        List<ContainerConfig> results = new ArrayList<>();
        Path dockerfile = root.resolve("Dockerfile");
        if (Files.exists(dockerfile)) {
            try { results.add(parseDockerfile(Files.readString(dockerfile), "Dockerfile")); }
            catch (IOException ignored) {}
        }
        for (String name : List.of("docker-compose.yml", "docker-compose.yaml")) {
            Path p = root.resolve(name);
            if (Files.exists(p)) {
                try { results.add(parseDockerCompose(Files.readString(p), name)); }
                catch (IOException ignored) {}
            }
        }
        return results;
    }

    private ContainerConfig parseDockerfile(String content, String filePath) {
        ContainerConfig cc = new ContainerConfig();
        cc.setType("dockerfile"); cc.setFilePath(filePath);
        cc.setPorts(new ArrayList<>()); cc.setVolumes(new ArrayList<>()); cc.setEnvVars(new ArrayList<>());
        for (String line : content.split("\n")) {
            String t = line.trim();
            Matcher from = Pattern.compile("^FROM\\s+(\\S+)", Pattern.CASE_INSENSITIVE).matcher(t);
            if (from.find()) cc.setBaseImage(from.group(1));
            Matcher expose = Pattern.compile("^EXPOSE\\s+(.+)", Pattern.CASE_INSENSITIVE).matcher(t);
            if (expose.find()) cc.getPorts().addAll(List.of(expose.group(1).trim().split("\\s+")));
            Matcher env = Pattern.compile("^ENV\\s+(\\S+)", Pattern.CASE_INSENSITIVE).matcher(t);
            if (env.find()) cc.getEnvVars().add(env.group(1));
        }
        cc.setDescription(cc.getBaseImage() != null ? "基于 " + cc.getBaseImage() + " 的 Docker 镜像" : "Dockerfile configuration");
        return cc;
    }

    @SuppressWarnings("unchecked")
    private ContainerConfig parseDockerCompose(String content, String filePath) {
        ContainerConfig cc = new ContainerConfig();
        cc.setType("docker-compose"); cc.setFilePath(filePath);
        cc.setPorts(new ArrayList<>()); cc.setVolumes(new ArrayList<>());
        cc.setEnvVars(new ArrayList<>()); cc.setServices(new ArrayList<>());
        try {
            Yaml yaml = new Yaml();
            Map<String, Object> doc = yaml.load(content);
            Map<String, Object> services = (Map<String, Object>) doc.getOrDefault("services", Map.of());
            for (var entry : services.entrySet()) {
                cc.getServices().add(entry.getKey());
                if (entry.getValue() instanceof Map<?, ?> svc) {
                    if (svc.get("ports") instanceof List<?> ports) ports.forEach(p -> cc.getPorts().add(String.valueOf(p)));
                    if (svc.get("volumes") instanceof List<?> vols) vols.forEach(v -> cc.getVolumes().add(String.valueOf(v)));
                    if (svc.get("environment") instanceof List<?> envs) envs.forEach(e -> cc.getEnvVars().add(String.valueOf(e)));
                    else if (svc.get("environment") instanceof Map<?, ?> envMap) envMap.keySet().forEach(k -> cc.getEnvVars().add(String.valueOf(k)));
                }
            }
        } catch (Exception ignored) {}
        cc.setDescription("Docker Compose 包含 " + cc.getServices().size() + " 个服务: " + String.join(", ", cc.getServices()));
        return cc;
    }

    @SuppressWarnings("unchecked")
    private List<CiCdPipeline> parseCiCd(Path root) {
        List<CiCdPipeline> results = new ArrayList<>();
        // GitHub Actions
        Path workflowsDir = root.resolve(".github/workflows");
        if (Files.isDirectory(workflowsDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(workflowsDir, "*.{yml,yaml}")) {
                for (Path file : stream) {
                    String relPath = ".github/workflows/" + file.getFileName();
                    try {
                        String content = Files.readString(file);
                        Yaml yaml = new Yaml();
                        Map<String, Object> doc = yaml.load(content);
                        if (doc == null) continue;
                        List<CiCdStage> stages = new ArrayList<>();
                        Map<String, Object> jobs = (Map<String, Object>) doc.getOrDefault("jobs", Map.of());
                        for (var entry : jobs.entrySet()) {
                            List<String> steps = new ArrayList<>();
                            if (entry.getValue() instanceof Map<?, ?> job && job.get("steps") instanceof List<?> stepList) {
                                for (Object s : stepList) {
                                    if (s instanceof Map<?, ?> step) {
                                        if (step.containsKey("name")) steps.add(String.valueOf(step.get("name")));
                                        else if (step.containsKey("uses")) steps.add(String.valueOf(step.get("uses")));
                                        else if (step.containsKey("run")) steps.add(String.valueOf(step.get("run")).split("\n")[0]);
                                    }
                                }
                            }
                            CiCdStage stage = new CiCdStage();
                            stage.setName(entry.getKey());
                            stage.setSteps(steps);
                            stages.add(stage);
                        }
                        CiCdPipeline pipeline = new CiCdPipeline();
                        pipeline.setType("github-actions");
                        pipeline.setFilePath(relPath);
                        pipeline.setStages(stages);
                        pipeline.setDescription("GitHub Actions 工作流: " + doc.getOrDefault("name", relPath));
                        results.add(pipeline);
                    } catch (Exception ignored) {}
                }
            } catch (IOException ignored) {}
        }
        // GitLab CI
        Path gitlabCi = root.resolve(".gitlab-ci.yml");
        if (Files.exists(gitlabCi)) {
            CiCdPipeline p = new CiCdPipeline();
            p.setType("gitlab-ci"); p.setFilePath(".gitlab-ci.yml");
            p.setStages(List.of()); p.setDescription("GitLab CI 流水线");
            results.add(p);
        }
        // Jenkinsfile
        if (Files.exists(root.resolve("Jenkinsfile"))) {
            CiCdPipeline p = new CiCdPipeline();
            p.setType("jenkins"); p.setFilePath("Jenkinsfile");
            p.setStages(List.of(new CiCdStage() {{ setName("pipeline"); setSteps(List.of("详见 Jenkinsfile")); }}));
            p.setDescription("Jenkins 流水线配置");
            results.add(p);
        }
        return results;
    }

    private List<ConfigItem> extractConfigItems(Path root) {
        List<ConfigItem> items = new ArrayList<>();
        // .env
        Path envPath = root.resolve(".env");
        if (Files.exists(envPath)) items.addAll(parseEnvFile(envPath, ".env", null));
        // application.yml
        for (String name : List.of("application.yml", "application.yaml")) {
            Path p = root.resolve(name);
            if (Files.exists(p)) items.addAll(parseYamlConfig(p, name, null));
        }
        // application.properties
        Path propsPath = root.resolve("application.properties");
        if (Files.exists(propsPath)) items.addAll(parsePropertiesFile(propsPath, "application.properties", null));
        return items;
    }

    private List<ConfigItem> parseEnvFile(Path filePath, String source, String environment) {
        List<ConfigItem> items = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(filePath)) {
                String t = line.trim();
                if (t.isEmpty() || t.startsWith("#")) continue;
                int eq = t.indexOf('=');
                if (eq < 0) continue;
                String key = t.substring(0, eq).trim();
                String value = t.substring(eq + 1).trim();
                if (key.isEmpty()) continue;
                ConfigItem ci = new ConfigItem();
                ci.setKey(key); ci.setDefaultValue(value.isEmpty() ? null : value);
                ci.setDescription(inferConfigDescription(key));
                ci.setRequired(inferRequired(key)); ci.setSource(source);
                ci.setEnvironment(environment);
                items.add(ci);
            }
        } catch (IOException ignored) {}
        return items;
    }

    @SuppressWarnings("unchecked")
    private List<ConfigItem> parseYamlConfig(Path filePath, String source, String environment) {
        List<ConfigItem> items = new ArrayList<>();
        try {
            Yaml yaml = new Yaml();
            Object doc = yaml.load(Files.readString(filePath));
            if (doc instanceof Map<?, ?> map) {
                flattenMap((Map<String, Object>) map, "", items, source, environment);
            }
        } catch (Exception ignored) {}
        return items;
    }

    @SuppressWarnings("unchecked")
    private void flattenMap(Map<String, Object> map, String prefix, List<ConfigItem> items,
                            String source, String environment) {
        for (var entry : map.entrySet()) {
            String fullKey = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            if (entry.getValue() instanceof Map<?, ?> nested) {
                flattenMap((Map<String, Object>) nested, fullKey, items, source, environment);
            } else {
                ConfigItem ci = new ConfigItem();
                ci.setKey(fullKey);
                ci.setDefaultValue(entry.getValue() != null ? String.valueOf(entry.getValue()) : null);
                ci.setDescription(inferConfigDescription(fullKey));
                ci.setRequired(inferRequired(fullKey)); ci.setSource(source);
                ci.setEnvironment(environment);
                items.add(ci);
            }
        }
    }

    private List<ConfigItem> parsePropertiesFile(Path filePath, String source, String environment) {
        List<ConfigItem> items = new ArrayList<>();
        try {
            Properties props = new Properties();
            props.load(Files.newBufferedReader(filePath));
            for (String key : props.stringPropertyNames()) {
                ConfigItem ci = new ConfigItem();
                ci.setKey(key); ci.setDefaultValue(props.getProperty(key));
                ci.setDescription(inferConfigDescription(key));
                ci.setRequired(inferRequired(key)); ci.setSource(source);
                ci.setEnvironment(environment);
                items.add(ci);
            }
        } catch (IOException ignored) {}
        return items;
    }

    private String inferConfigDescription(String key) {
        String lower = key.toLowerCase();
        if (lower.contains("host")) return "主机地址";
        if (lower.contains("port")) return "端口号";
        if (lower.contains("password") || lower.contains("secret")) return "密码/密钥";
        if (lower.contains("url") || lower.contains("uri")) return "连接地址";
        if (lower.contains("database") || lower.contains("db")) return "数据库配置";
        if (lower.contains("redis")) return "Redis 配置";
        if (lower.contains("key") || lower.contains("token")) return "API 密钥/令牌";
        if (lower.contains("log")) return "日志配置";
        if (lower.contains("timeout")) return "超时设置";
        return "配置项: " + key;
    }

    private boolean inferRequired(String key) {
        String lower = key.toLowerCase();
        return lower.contains("host") || lower.contains("port") || lower.contains("url")
                || lower.contains("uri") || lower.contains("database") || lower.contains("db_name");
    }

    private List<ExternalService> detectExternalServices(List<ConfigItem> configItems,
                                                         List<LanguagePlugin> plugins, Path root) {
        Map<String, ExternalService> serviceMap = new LinkedHashMap<>();
        for (ConfigItem item : configItems) {
            String upper = item.getKey().toUpperCase().replace(".", "_");
            for (var entry : CONFIG_KEY_SERVICE_MAP.entrySet()) {
                if (upper.contains(entry.getKey())) {
                    serviceMap.computeIfAbsent(entry.getValue().name(), k -> {
                        ExternalService es = new ExternalService();
                        es.setName(entry.getValue().name()); es.setType(entry.getValue().type());
                        es.setEvidence(new ArrayList<>()); es.setConnectionConfig(item.getKey());
                        return es;
                    }).getEvidence().add("Config key: " + item.getKey());
                }
            }
        }
        for (LanguagePlugin plugin : plugins) {
            for (Dependency dep : plugin.extractDependencies(root)) {
                ExternalServiceDef svc = DEP_SERVICE_MAP.get(dep.getName());
                if (svc != null) {
                    serviceMap.computeIfAbsent(svc.name(), k -> {
                        ExternalService es = new ExternalService();
                        es.setName(svc.name()); es.setType(svc.type());
                        es.setEvidence(new ArrayList<>());
                        return es;
                    }).getEvidence().add("Dependency: " + dep.getName());
                }
            }
        }
        return new ArrayList<>(serviceMap.values());
    }

    private EnvComparisonTable buildEnvComparison(Path root) {
        List<EnvFileInfo> envFiles = findEnvSpecificFiles(root);
        if (envFiles.isEmpty()) return null;

        List<String> environments = new ArrayList<>();
        Map<String, Map<String, String>> envData = new LinkedHashMap<>();

        for (EnvFileInfo ef : envFiles) {
            environments.add(ef.environment);
            Map<String, String> kvMap = new LinkedHashMap<>();
            Path fullPath = root.resolve(ef.filePath);
            if (ef.filePath.endsWith(".env") || ef.filePath.startsWith(".env.")) {
                for (ConfigItem ci : parseEnvFile(fullPath, ef.filePath, ef.environment)) {
                    kvMap.put(ci.getKey(), ci.getDefaultValue() != null ? ci.getDefaultValue() : "");
                }
            } else if (ef.filePath.endsWith(".yml") || ef.filePath.endsWith(".yaml")) {
                for (ConfigItem ci : parseYamlConfig(fullPath, ef.filePath, ef.environment)) {
                    kvMap.put(ci.getKey(), ci.getDefaultValue() != null ? ci.getDefaultValue() : "");
                }
            }
            envData.put(ef.environment, kvMap);
        }

        Set<String> allKeys = new TreeSet<>();
        envData.values().forEach(m -> allKeys.addAll(m.keySet()));

        List<EnvComparisonItem> items = new ArrayList<>();
        for (String key : allKeys) {
            Map<String, String> values = new LinkedHashMap<>();
            Set<String> valueSet = new HashSet<>();
            for (String env : environments) {
                String val = envData.getOrDefault(env, Map.of()).get(key);
                values.put(env, val);
                if (val != null) valueSet.add(val);
            }
            boolean isDiff = valueSet.size() > 1 || (values.containsValue(null) && !valueSet.isEmpty());
            EnvComparisonItem item = new EnvComparisonItem();
            item.setKey(key); item.setValues(values); item.setDifferent(isDiff);
            items.add(item);
        }

        EnvComparisonTable table = new EnvComparisonTable();
        table.setEnvironments(environments);
        table.setItems(items);
        return table;
    }

    private record EnvFileInfo(String environment, String filePath) {}

    private List<EnvFileInfo> findEnvSpecificFiles(Path root) {
        List<EnvFileInfo> results = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(root)) {
            for (Path entry : stream) {
                String name = entry.getFileName().toString();
                Matcher m = Pattern.compile("^\\.env\\.(\\w+)$").matcher(name);
                if (m.matches()) {
                    String env = m.group(1);
                    if (!Set.of("example", "sample", "template", "local", "bak").contains(env)) {
                        results.add(new EnvFileInfo(env, name));
                    }
                }
                Matcher ym = Pattern.compile("^application-(\\w+)\\.(yml|yaml)$").matcher(name);
                if (ym.matches()) {
                    results.add(new EnvFileInfo(ym.group(1), name));
                }
            }
        } catch (IOException ignored) {}
        return results;
    }
}
