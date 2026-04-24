package com.analyzer.plugin;

import com.analyzer.model.*;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.nodeTypes.NodeWithAnnotations;
import com.github.javaparser.ast.stmt.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.regex.*;
import java.util.stream.Stream;

import javax.xml.parsers.*;
import org.w3c.dom.*;
import java.io.File;

public class JavaPlugin implements LanguagePlugin {

    /** 文件解析缓存：相同文件只解析一次 */
    private final Map<Path, List<AstNode>> parseCache = new HashMap<>();

    // 日志包装，便于统一控制
    private static void logWarn(String msg, Object... args) {
        System.err.println("  ⚠️ [JavaPlugin] " + String.format(msg, args));
    }

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
        if (!filePath.toString().endsWith(".java")) return List.of();
        // 命中缓存直接返回
        if (parseCache.containsKey(filePath)) {
            return parseCache.get(filePath);
        }
        List<AstNode> nodes = new ArrayList<>();
        try {
            CompilationUnit cu = StaticJavaParser.parse(filePath);
            String fileStr = filePath.toString();

            for (TypeDeclaration<?> type : cu.getTypes()) {
                nodes.add(convertTypeDeclaration(type, fileStr));
            }
            parseCache.put(filePath, nodes);
        } catch (Exception e) {
            logWarn("解析文件失败: %s - %s", filePath, e.getMessage());
        }
        return nodes;
    }

    /** 清除解析缓存（可选） */
    public void clearCache() { parseCache.clear(); }

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
        // 提取方法体内调用的方法名（用于调用链追踪）
        List<String> calledMethods = new ArrayList<>();
        md.walk(MethodCallExpr.class, mce -> calledMethods.add(mce.getNameAsString()));
        node.setCalledMethodNames(calledMethods);
        // 计算真实的控制流嵌套深度（用于反模式检测）
        node.setNestingDepth(measureNestingDepth(md));
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

    /** 计算方法体内真实的控制流嵌套深度（if/for/while/do/switch/try） */
    private int measureNestingDepth(MethodDeclaration md) {
        // 遍历所有节点，对每个节点统计其控制流祖先数
        int[] maxDepth = {0};
        md.walk(node -> {
            if (node == md) return; // 跳过方法本身
            int depth = 0;
            com.github.javaparser.ast.Node parent = node.getParentNode().orElse(null);
            while (parent != null && parent != md) {
                if (isControlFlowNode(parent)) depth++;
                parent = parent.getParentNode().orElse(null);
            }
            maxDepth[0] = Math.max(maxDepth[0], depth);
        });
        return maxDepth[0];
    }

    private boolean isControlFlowNode(com.github.javaparser.ast.Node node) {
        return node instanceof IfStmt || node instanceof ForStmt
                || node instanceof WhileStmt || node instanceof DoStmt
                || node instanceof SwitchStmt || node instanceof TryStmt;
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
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            // 禁用 DTD 加载以加速解析并避免网络请求
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(pomPath.toFile());
            doc.getDocumentElement().normalize();

            // 解析 <dependencies> 区域
            NodeList depNodes = doc.getElementsByTagName("dependency");
            // 从 <dependencyManagement> 中找 <dependency> 来排除
            Set<String> managedKeys = extractManagedDependencyKeys(doc);

            for (int i = 0; i < depNodes.getLength(); i++) {
                Node depNode = depNodes.item(i);
                // 跳过 <dependencyManagement> 中的依赖
                if (isInDependencyManagement(depNode)) continue;

                String groupId = getChildText(depNode, "groupId");
                String artifactId = getChildText(depNode, "artifactId");
                String version = getChildText(depNode, "version");
                String scope = getChildText(depNode, "scope");
                if (groupId == null || artifactId == null) continue;
                if (version == null || version.isEmpty()) {
                    // 尝试从 <dependencyManagement> 中获取版本
                    String managedKey = groupId + ":" + artifactId;
                    if (managedKeys.contains(managedKey)) version = "";
                }
                deps.add(new Dependency(artifactId.trim(), version != null ? version.trim() : "",
                        groupId.trim(), categorizeDependency(artifactId, groupId),
                        scope != null ? Dependency.DependencyScope.fromValue(scope.trim())
                                : Dependency.DependencyScope.COMPILE));
            }
        } catch (Exception e) {
            logWarn("解析 pom.xml 失败: %s - %s", pomPath, e.getMessage());
        }
        return deps;
    }

    private Set<String> extractManagedDependencyKeys(Document doc) {
        Set<String> keys = new HashSet<>();
        NodeList mgmtList = doc.getElementsByTagName("dependencyManagement");
        for (int i = 0; i < mgmtList.getLength(); i++) {
            Node mgmt = mgmtList.item(i);
            NodeList deps = mgmt.getChildNodes();
            for (int j = 0; j < deps.getLength(); j++) {
                Node depMgmt = deps.item(j);
                if ("dependencies".equals(depMgmt.getNodeName())) {
                    for (int k = 0; k < depMgmt.getChildNodes().getLength(); k++) {
                        Node dep = depMgmt.getChildNodes().item(k);
                        if ("dependency".equals(dep.getNodeName())) {
                            String g = getChildText(dep, "groupId");
                            String a = getChildText(dep, "artifactId");
                            if (g != null && a != null) keys.add(g.trim() + ":" + a.trim());
                        }
                    }
                }
            }
        }
        return keys;
    }

    private boolean isInDependencyManagement(Node depNode) {
        Node parent = depNode.getParentNode();
        while (parent != null) {
            if ("dependencyManagement".equals(parent.getNodeName())) return true;
            parent = parent.getParentNode();
        }
        return false;
    }

    private String getChildText(Node parent, String childName) {
        NodeList list = parent.getChildNodes();
        for (int i = 0; i < list.getLength(); i++) {
            Node node = list.item(i);
            if (childName.equals(node.getNodeName())) {
                return node.getTextContent();
            }
        }
        return null;
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
        } catch (IOException e) {
            logWarn("解析 build.gradle 失败: %s - %s", gradlePath, e.getMessage());
        }
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
        } catch (Exception e) {
            logWarn("识别 API 端点失败: %s - %s", filePath, e.getMessage());
        }
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
        String methodPath = "";
        boolean hasRequestMapping = false;
        Map<String, String> requestMappingAttrs = null;

        for (AnnotationExpr ann : md.getAnnotations()) {
            String annName = ann.getNameAsString();
            Map<String, String> attrs = extractAnnotationAttributes(ann);

            if (SPRING_MVC_ANNOTATIONS.contains(annName)) {
                methodPath = attrs.getOrDefault("value", attrs.getOrDefault("path", ""));

                if ("RequestMapping".equals(annName)) {
                    requestMappingAttrs = attrs;
                    hasRequestMapping = true;
                } else {
                    // @GetMapping / @PostMapping 等 → 单一方法
                    ApiEndpoint.HttpMethod httpMethod = switch (annName) {
                        case "GetMapping" -> ApiEndpoint.HttpMethod.GET;
                        case "PostMapping" -> ApiEndpoint.HttpMethod.POST;
                        case "PutMapping" -> ApiEndpoint.HttpMethod.PUT;
                        case "DeleteMapping" -> ApiEndpoint.HttpMethod.DELETE;
                        case "PatchMapping" -> ApiEndpoint.HttpMethod.PATCH;
                        default -> ApiEndpoint.HttpMethod.GET;
                    };
                    addEndpoint(endpoints, md, className, basePath, filePath, methodPath, httpMethod);
                    return; // 只处理一个注解
                }
            } else if (JAXRS_ANNOTATIONS.contains(annName)) {
                if ("Path".equals(annName)) continue;
                ApiEndpoint.HttpMethod httpMethod = ApiEndpoint.HttpMethod.fromValue(annName);
                for (AnnotationExpr ma : md.getAnnotations()) {
                    if ("Path".equals(ma.getNameAsString())) {
                        Map<String, String> pa = extractAnnotationAttributes(ma);
                        methodPath = pa.getOrDefault("value", "");
                    }
                }
                addEndpoint(endpoints, md, className, basePath, filePath, methodPath, httpMethod);
                return;
            }
        }

        // @RequestMapping 特殊处理：无 method = 所有方法；数组 = 拆分成多个
        if (hasRequestMapping && requestMappingAttrs != null) {
            String methodAttr = requestMappingAttrs.get("method");
            String path = requestMappingAttrs.getOrDefault("value",
                    requestMappingAttrs.getOrDefault("path", ""));

            if (methodAttr == null || methodAttr.isEmpty()) {
                // 没有指定 method → 为每个 HTTP 方法生成一个端点
                for (ApiEndpoint.HttpMethod m : ApiEndpoint.HttpMethod.values()) {
                    addEndpoint(endpoints, md, className, basePath, filePath, path, m);
                }
            } else {
                // 解析 method 数组：{RequestMethod.POST, RequestMethod.GET} 或 "POST"
                for (ApiEndpoint.HttpMethod m : parseHttpMethods(methodAttr)) {
                    addEndpoint(endpoints, md, className, basePath, filePath, path, m);
                }
            }
        }
    }

    private List<ApiEndpoint.HttpMethod> parseHttpMethods(String methodAttr) {
        String cleaned = methodAttr.replaceAll("[{}]", "").replace("RequestMethod.", "");
        String[] parts = cleaned.split(",");
        List<ApiEndpoint.HttpMethod> result = new ArrayList<>();
        for (String part : parts) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                try {
                    result.add(ApiEndpoint.HttpMethod.fromValue(trimmed));
                } catch (Exception e) {
                    logWarn("无法解析 HTTP 方法: %s", trimmed);
                }
            }
        }
        return result.isEmpty() ? List.of(ApiEndpoint.HttpMethod.GET) : result;
    }

    private void addEndpoint(List<ApiEndpoint> endpoints, MethodDeclaration md,
                             String className, String basePath, String filePath,
                             String methodPath, ApiEndpoint.HttpMethod httpMethod) {
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
                                    "模块: " + name, true,
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
                    "Java 包: " + moduleName, true,
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
