package com.analyzer.plugin;

import com.analyzer.model.*;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.util.stream.Stream;

public class JavaPlugin implements LanguagePlugin {

    private static final Set<String> IGNORED_DIRS = Set.of(
            "node_modules", ".git", "dist", "build", "__pycache__",
            "target", "vendor", ".gradle", ".idea", ".vscode", "test", "tests"
    );

    private static final Map<String, Dependency.DependencyCategory> DEP_CATEGORY_MAP = new HashMap<>();
    static {
        DEP_CATEGORY_MAP.put("spring-boot-starter-web", Dependency.DependencyCategory.WEB_FRAMEWORK);
        DEP_CATEGORY_MAP.put("spring-webmvc", Dependency.DependencyCategory.WEB_FRAMEWORK);
        DEP_CATEGORY_MAP.put("spring-boot-starter", Dependency.DependencyCategory.WEB_FRAMEWORK);
        DEP_CATEGORY_MAP.put("jersey", Dependency.DependencyCategory.WEB_FRAMEWORK);
        DEP_CATEGORY_MAP.put("mysql-connector", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("postgresql", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("h2", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("mybatis", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("hibernate", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("spring-data-jpa", Dependency.DependencyCategory.DATABASE);
        DEP_CATEGORY_MAP.put("jedis", Dependency.DependencyCategory.CACHE);
        DEP_CATEGORY_MAP.put("lettuce", Dependency.DependencyCategory.CACHE);
        DEP_CATEGORY_MAP.put("spring-data-redis", Dependency.DependencyCategory.CACHE);
        DEP_CATEGORY_MAP.put("caffeine", Dependency.DependencyCategory.CACHE);
        DEP_CATEGORY_MAP.put("spring-kafka", Dependency.DependencyCategory.MESSAGE_QUEUE);
        DEP_CATEGORY_MAP.put("spring-amqp", Dependency.DependencyCategory.MESSAGE_QUEUE);
        DEP_CATEGORY_MAP.put("rabbitmq", Dependency.DependencyCategory.MESSAGE_QUEUE);
        DEP_CATEGORY_MAP.put("spring-security", Dependency.DependencyCategory.SECURITY);
        DEP_CATEGORY_MAP.put("shiro", Dependency.DependencyCategory.SECURITY);
        DEP_CATEGORY_MAP.put("junit", Dependency.DependencyCategory.TESTING);
        DEP_CATEGORY_MAP.put("mockito", Dependency.DependencyCategory.TESTING);
        DEP_CATEGORY_MAP.put("testng", Dependency.DependencyCategory.TESTING);
        DEP_CATEGORY_MAP.put("assertj", Dependency.DependencyCategory.TESTING);
        DEP_CATEGORY_MAP.put("logback", Dependency.DependencyCategory.LOGGING);
        DEP_CATEGORY_MAP.put("log4j", Dependency.DependencyCategory.LOGGING);
        DEP_CATEGORY_MAP.put("slf4j", Dependency.DependencyCategory.LOGGING);
        DEP_CATEGORY_MAP.put("lombok", Dependency.DependencyCategory.UTILITY);
        DEP_CATEGORY_MAP.put("guava", Dependency.DependencyCategory.UTILITY);
        DEP_CATEGORY_MAP.put("commons-", Dependency.DependencyCategory.UTILITY);
        DEP_CATEGORY_MAP.put("jackson", Dependency.DependencyCategory.UTILITY);
        DEP_CATEGORY_MAP.put("gson", Dependency.DependencyCategory.UTILITY);
    }

    private static final Set<String> SPRING_MVC_ANNOTATIONS = Set.of(
            "RequestMapping", "GetMapping", "PostMapping", "PutMapping",
            "DeleteMapping", "PatchMapping"
    );
    private static final Set<String> JAXRS_ANNOTATIONS = Set.of(
            "Path", "GET", "POST", "PUT", "DELETE", "PATCH"
    );

    @Override
    public String getLanguageId() { return "java"; }

    @Override
    public List<AstNode> parseFile(Path filePath) {
        List<AstNode> nodes = new ArrayList<>();
        if (!filePath.toString().endsWith(".java")) return nodes;
        try {
            CompilationUnit cu = StaticJavaParser.parse(filePath);
            String fileStr = filePath.toString();

            for (TypeDeclaration<?> type : cu.getTypes()) {
                nodes.add(convertTypeDeclaration(type, fileStr));
            }
        } catch (Exception ignored) {}
        return nodes;
    }

    private AstNode convertTypeDeclaration(TypeDeclaration<?> type, String filePath) {
        AstNode node = new AstNode();
        node.setFilePath(filePath);
        node.setName(type.getNameAsString());
        node.setStartLine(type.getBegin().map(p -> p.line).orElse(0));
        node.setEndLine(type.getEnd().map(p -> p.line).orElse(0));
        node.setModifiers(type.getModifiers().stream()
                .map(m -> m.getKeyword().asString()).toList());
        node.setAnnotations(extractAnnotations(type));
        node.setChildren(new ArrayList<>());

        if (type instanceof ClassOrInterfaceDeclaration cid) {
            node.setType(cid.isInterface() ? AstNode.AstNodeType.INTERFACE : AstNode.AstNodeType.CLASS);
            cid.getExtendedTypes().stream().findFirst()
                    .ifPresent(ext -> node.setSuperClass(ext.getNameAsString()));
            node.setInterfaces(cid.getImplementedTypes().stream()
                    .map(t -> t.getNameAsString()).toList());
        } else if (type instanceof EnumDeclaration) {
            node.setType(AstNode.AstNodeType.ENUM);
        } else {
            node.setType(AstNode.AstNodeType.CLASS);
        }

        // Process members
        for (BodyDeclaration<?> member : type.getMembers()) {
            if (member instanceof MethodDeclaration md) {
                node.getChildren().add(convertMethod(md, filePath));
            } else if (member instanceof ConstructorDeclaration cd) {
                node.getChildren().add(convertConstructor(cd, filePath));
            } else if (member instanceof FieldDeclaration fd) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    node.getChildren().add(convertField(fd, vd, filePath));
                }
            } else if (member instanceof TypeDeclaration<?> nested) {
                node.getChildren().add(convertTypeDeclaration(nested, filePath));
            }
        }
        return node;
    }

    private AstNode convertMethod(MethodDeclaration md, String filePath) {
        AstNode node = new AstNode();
        node.setType(AstNode.AstNodeType.METHOD);
        node.setName(md.getNameAsString());
        node.setFilePath(filePath);
        node.setStartLine(md.getBegin().map(p -> p.line).orElse(0));
        node.setEndLine(md.getEnd().map(p -> p.line).orElse(0));
        node.setModifiers(md.getModifiers().stream()
                .map(m -> m.getKeyword().asString()).toList());
        node.setAnnotations(extractAnnotations(md));
        node.setChildren(new ArrayList<>());
        node.setReturnType(md.getTypeAsString());
        node.setParameters(md.getParameters().stream().map(p -> {
            AstNode.Parameter param = new AstNode.Parameter();
            param.setName(p.getNameAsString());
            param.setType(p.getTypeAsString());
            param.setAnnotations(p.getAnnotations().stream().map(a -> {
                AstNode.Annotation ann = new AstNode.Annotation();
                ann.setName(a.getNameAsString());
                ann.setAttributes(extractAnnotationAttributes(a));
                return ann;
            }).toList());
            return param;
        }).toList());
        return node;
    }

    private AstNode convertConstructor(ConstructorDeclaration cd, String filePath) {
        AstNode node = new AstNode();
        node.setType(AstNode.AstNodeType.CONSTRUCTOR);
        node.setName(cd.getNameAsString());
        node.setFilePath(filePath);
        node.setStartLine(cd.getBegin().map(p -> p.line).orElse(0));
        node.setEndLine(cd.getEnd().map(p -> p.line).orElse(0));
        node.setModifiers(cd.getModifiers().stream()
                .map(m -> m.getKeyword().asString()).toList());
        node.setAnnotations(extractAnnotations(cd));
        node.setChildren(new ArrayList<>());
        return node;
    }

    private AstNode convertField(FieldDeclaration fd, VariableDeclarator vd, String filePath) {
        AstNode node = new AstNode();
        node.setType(AstNode.AstNodeType.FIELD);
        node.setName(vd.getNameAsString());
        node.setFilePath(filePath);
        node.setStartLine(fd.getBegin().map(p -> p.line).orElse(0));
        node.setEndLine(fd.getEnd().map(p -> p.line).orElse(0));
        node.setModifiers(fd.getModifiers().stream()
                .map(m -> m.getKeyword().asString()).toList());
        node.setAnnotations(extractAnnotations(fd));
        node.setChildren(new ArrayList<>());
        node.setReturnType(vd.getTypeAsString());
        return node;
    }

    private List<AstNode.Annotation> extractAnnotations(NodeWithAnnotations<?> node) {
        return node.getAnnotations().stream().map(a -> {
            AstNode.Annotation ann = new AstNode.Annotation();
            ann.setName(a.getNameAsString());
            ann.setAttributes(extractAnnotationAttributes(a));
            return ann;
        }).toList();
    }

    private Map<String, String> extractAnnotationAttributes(AnnotationExpr a) {
        Map<String, String> attrs = new HashMap<>();
        if (a instanceof SingleMemberAnnotationExpr sma) {
            attrs.put("value", sma.getMemberValue().toString().replace("\"", ""));
        } else if (a instanceof NormalAnnotationExpr nma) {
            for (MemberValuePair pair : nma.getPairs()) {
                attrs.put(pair.getNameAsString(), pair.getValue().toString().replace("\"", ""));
            }
        }
        return attrs;
    }

    @Override
    public List<Dependency> extractDependencies(Path projectRoot) {
        List<Dependency> deps = new ArrayList<>();
        Path pomPath = projectRoot.resolve("pom.xml");
        if (Files.exists(pomPath)) {
            deps.addAll(parsePomXml(pomPath));
        }
        Path gradlePath = projectRoot.resolve("build.gradle");
        if (Files.exists(gradlePath)) {
            deps.addAll(parseBuildGradle(gradlePath));
        }
        return deps;
    }

    private List<Dependency> parsePomXml(Path pomPath) {
        List<Dependency> deps = new ArrayList<>();
        try {
            String content = Files.readString(pomPath);
            Pattern depPattern = Pattern.compile(
                    "<dependency>\\s*<groupId>(.*?)</groupId>\\s*<artifactId>(.*?)</artifactId>\\s*(?:<version>(.*?)</version>)?\\s*(?:<scope>(.*?)</scope>)?",
                    Pattern.DOTALL);
            Matcher m = depPattern.matcher(content);
            while (m.find()) {
                String groupId = m.group(1).trim();
                String artifactId = m.group(2).trim();
                String version = m.group(3) != null ? m.group(3).trim() : "";
                String scope = m.group(4) != null ? m.group(4).trim() : "compile";
                deps.add(new Dependency(artifactId, version, groupId,
                        categorizeDependency(artifactId, groupId),
                        Dependency.DependencyScope.fromValue(scope)));
            }
        } catch (IOException ignored) {}
        return deps;
    }

    private List<Dependency> parseBuildGradle(Path gradlePath) {
        List<Dependency> deps = new ArrayList<>();
        try {
            String content = Files.readString(gradlePath);
            // Match patterns like: implementation 'group:artifact:version'
            Pattern p1 = Pattern.compile(
                    "(implementation|api|compileOnly|runtimeOnly|testImplementation)\\s+['\"]([^:]+):([^:]+):?([^'\"]*)['\"]");
            Matcher m1 = p1.matcher(content);
            while (m1.find()) {
                String config = m1.group(1);
                String group = m1.group(2);
                String artifact = m1.group(3);
                String version = m1.group(4) != null ? m1.group(4) : "";
                Dependency.DependencyScope scope = config.contains("test")
                        ? Dependency.DependencyScope.TEST
                        : config.equals("compileOnly") ? Dependency.DependencyScope.PROVIDED
                        : config.equals("runtimeOnly") ? Dependency.DependencyScope.RUNTIME
                        : Dependency.DependencyScope.COMPILE;
                deps.add(new Dependency(artifact, version, group,
                        categorizeDependency(artifact, group), scope));
            }
        } catch (IOException ignored) {}
        return deps;
    }

    private Dependency.DependencyCategory categorizeDependency(String artifactId, String groupId) {
        String combined = (groupId + ":" + artifactId).toLowerCase();
        for (Map.Entry<String, Dependency.DependencyCategory> entry : DEP_CATEGORY_MAP.entrySet()) {
            if (combined.contains(entry.getKey())) return entry.getValue();
        }
        return Dependency.DependencyCategory.OTHER;
    }

    @Override
    public List<ApiEndpoint> identifyApis(Path filePath) {
        List<ApiEndpoint> endpoints = new ArrayList<>();
        if (!filePath.toString().endsWith(".java")) return endpoints;
        try {
            CompilationUnit cu = StaticJavaParser.parse(filePath);
            for (TypeDeclaration<?> type : cu.getTypes()) {
                if (type instanceof ClassOrInterfaceDeclaration cid) {
                    String basePath = extractClassBasePath(cid);
                    String className = cid.getNameAsString();
                    for (MethodDeclaration md : cid.getMethods()) {
                        extractEndpointsFromMethod(md, className, basePath, filePath.toString(), endpoints);
                    }
                }
            }
        } catch (Exception ignored) {}
        return endpoints;
    }

    private String extractClassBasePath(ClassOrInterfaceDeclaration cid) {
        for (AnnotationExpr ann : cid.getAnnotations()) {
            String name = ann.getNameAsString();
            if ("RequestMapping".equals(name) || "Path".equals(name)) {
                Map<String, String> attrs = extractAnnotationAttributes(ann);
                String val = attrs.getOrDefault("value", attrs.getOrDefault("path", ""));
                if (!val.isEmpty()) return val;
            }
        }
        return "";
    }

    private void extractEndpointsFromMethod(MethodDeclaration md, String className,
                                            String basePath, String filePath,
                                            List<ApiEndpoint> endpoints) {
        for (AnnotationExpr ann : md.getAnnotations()) {
            String annName = ann.getNameAsString();
            ApiEndpoint.HttpMethod httpMethod = null;
            String methodPath = "";

            if (SPRING_MVC_ANNOTATIONS.contains(annName)) {
                Map<String, String> attrs = extractAnnotationAttributes(ann);
                methodPath = attrs.getOrDefault("value", attrs.getOrDefault("path", ""));
                httpMethod = switch (annName) {
                    case "GetMapping" -> ApiEndpoint.HttpMethod.GET;
                    case "PostMapping" -> ApiEndpoint.HttpMethod.POST;
                    case "PutMapping" -> ApiEndpoint.HttpMethod.PUT;
                    case "DeleteMapping" -> ApiEndpoint.HttpMethod.DELETE;
                    case "PatchMapping" -> ApiEndpoint.HttpMethod.PATCH;
                    case "RequestMapping" -> {
                        String m = attrs.getOrDefault("method", "GET");
                        yield ApiEndpoint.HttpMethod.fromValue(
                                m.replace("RequestMethod.", "").trim());
                    }
                    default -> ApiEndpoint.HttpMethod.GET;
                };
            } else if (JAXRS_ANNOTATIONS.contains(annName)) {
                if ("Path".equals(annName)) continue; // Path is for base path
                httpMethod = ApiEndpoint.HttpMethod.fromValue(annName);
                // Check for @Path on method
                for (AnnotationExpr ma : md.getAnnotations()) {
                    if ("Path".equals(ma.getNameAsString())) {
                        Map<String, String> pa = extractAnnotationAttributes(ma);
                        methodPath = pa.getOrDefault("value", "");
                    }
                }
            }

            if (httpMethod != null) {
                String fullPath = basePath + methodPath;
                if (fullPath.isEmpty()) fullPath = "/";

                ApiEndpoint ep = new ApiEndpoint();
                ep.setPath(fullPath);
                ep.setMethod(httpMethod);
                ep.setHandlerClass(className);
                ep.setHandlerMethod(md.getNameAsString());
                ep.setParameters(md.getParameters().stream().map(p -> {
                    ApiEndpoint.ApiParameter param = new ApiEndpoint.ApiParameter();
                    param.setName(p.getNameAsString());
                    param.setType(p.getTypeAsString());
                    param.setIn(inferParameterIn(p));
                    param.setRequired(true);
                    return param;
                }).toList());
                ep.setResponseType(md.getTypeAsString());
                ep.setTags(new ArrayList<>());
                endpoints.add(ep);
            }
        }
    }

    private ApiEndpoint.ApiParameter.ParameterIn inferParameterIn(
            com.github.javaparser.ast.body.Parameter p) {
        for (AnnotationExpr ann : p.getAnnotations()) {
            String name = ann.getNameAsString();
            if ("PathVariable".equals(name) || "PathParam".equals(name))
                return ApiEndpoint.ApiParameter.ParameterIn.PATH;
            if ("RequestParam".equals(name) || "QueryParam".equals(name))
                return ApiEndpoint.ApiParameter.ParameterIn.QUERY;
            if ("RequestBody".equals(name))
                return ApiEndpoint.ApiParameter.ParameterIn.BODY;
            if ("RequestHeader".equals(name) || "HeaderParam".equals(name))
                return ApiEndpoint.ApiParameter.ParameterIn.HEADER;
        }
        return ApiEndpoint.ApiParameter.ParameterIn.QUERY;
    }

    @Override
    public List<ModuleInfo> identifyModules(Path projectRoot) {
        List<ModuleInfo> modules = new ArrayList<>();
        // Scan for Java packages (directories containing .java files)
        Path srcMain = projectRoot.resolve("src/main/java");
        Path srcDir = Files.exists(srcMain) ? srcMain : projectRoot.resolve("src");
        if (!Files.exists(srcDir)) srcDir = projectRoot;

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(srcDir)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    scanPackageModules(entry, entry.getFileName().toString(), modules);
                }
            }
        } catch (IOException ignored) {}

        // If no modules found from package scan, use top-level dirs
        if (modules.isEmpty()) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(projectRoot)) {
                for (Path entry : stream) {
                    if (Files.isDirectory(entry)) {
                        String name = entry.getFileName().toString();
                        if (IGNORED_DIRS.contains(name) || name.startsWith(".")) continue;
                        List<String> javaFiles = findJavaFiles(entry);
                        if (!javaFiles.isEmpty()) {
                            modules.add(new ModuleInfo(name, entry.toString(),
                                    "Module: " + name, true,
                                    new ArrayList<>(), javaFiles, new ArrayList<>()));
                        }
                    }
                }
            } catch (IOException ignored) {}
        }
        return modules;
    }

    private void scanPackageModules(Path dir, String moduleName, List<ModuleInfo> modules) {
        List<String> javaFiles = findJavaFiles(dir);
        if (!javaFiles.isEmpty()) {
            modules.add(new ModuleInfo(moduleName, dir.toString(),
                    "Java package: " + moduleName, true,
                    new ArrayList<>(), javaFiles, new ArrayList<>()));
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    String name = entry.getFileName().toString();
                    if (!IGNORED_DIRS.contains(name) && !name.startsWith(".")) {
                        scanPackageModules(entry, moduleName + "." + name, modules);
                    }
                }
            }
        } catch (IOException ignored) {}
    }

    private List<String> findJavaFiles(Path dir) {
        List<String> files = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir, "*.java")) {
            for (Path p : stream) {
                files.add(p.toString());
            }
        } catch (IOException ignored) {}
        return files;
    }
}
