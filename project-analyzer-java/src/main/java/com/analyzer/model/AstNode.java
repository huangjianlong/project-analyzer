package com.analyzer.model;

import java.util.List;
import java.util.Map;

/**
 * AstNode — AST 节点数据模型
 */
public class AstNode {
    private AstNodeType type;
    private String name;
    private String filePath;
    private int startLine;
    private int endLine;
    private List<String> modifiers;
    private List<Annotation> annotations;
    private List<AstNode> children;
    private List<Parameter> parameters;  // nullable
    private String returnType;           // nullable
    private String superClass;           // nullable
    private List<String> interfaces;     // nullable
    private int nestingDepth;            // 控制流嵌套深度（用于反模式检测）
    private List<String> calledMethodNames; // 方法体内调用的方法名列表

    public AstNode() {}

    public AstNodeType getType() { return type; }
    public void setType(AstNodeType type) { this.type = type; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }

    public int getStartLine() { return startLine; }
    public void setStartLine(int startLine) { this.startLine = startLine; }

    public int getEndLine() { return endLine; }
    public void setEndLine(int endLine) { this.endLine = endLine; }

    public List<String> getModifiers() { return modifiers; }
    public void setModifiers(List<String> modifiers) { this.modifiers = modifiers; }

    public List<Annotation> getAnnotations() { return annotations; }
    public void setAnnotations(List<Annotation> annotations) { this.annotations = annotations; }

    public List<AstNode> getChildren() { return children; }
    public void setChildren(List<AstNode> children) { this.children = children; }

    public List<Parameter> getParameters() { return parameters; }
    public void setParameters(List<Parameter> parameters) { this.parameters = parameters; }

    public String getReturnType() { return returnType; }
    public void setReturnType(String returnType) { this.returnType = returnType; }

    public String getSuperClass() { return superClass; }
    public void setSuperClass(String superClass) { this.superClass = superClass; }

    public List<String> getInterfaces() { return interfaces; }
    public void setInterfaces(List<String> interfaces) { this.interfaces = interfaces; }

    public int getNestingDepth() { return nestingDepth; }
    public void setNestingDepth(int nestingDepth) { this.nestingDepth = nestingDepth; }

    public List<String> getCalledMethodNames() { return calledMethodNames; }
    public void setCalledMethodNames(List<String> calledMethodNames) { this.calledMethodNames = calledMethodNames; }

    public enum AstNodeType {
        CLASS("class"),
        INTERFACE("interface"),
        ENUM("enum"),
        METHOD("method"),
        CONSTRUCTOR("constructor"),
        FIELD("field"),
        FUNCTION("function"),
        MODULE("module"),
        NAMESPACE("namespace");

        private final String value;

        AstNodeType(String value) { this.value = value; }
        public String getValue() { return value; }

        public static AstNodeType fromValue(String value) {
            for (AstNodeType t : values()) {
                if (t.value.equals(value)) return t;
            }
            return CLASS;
        }
    }

    public static class Annotation {
        private String name;
        private Map<String, String> attributes;

        public Annotation() {}

        public Annotation(String name, Map<String, String> attributes) {
            this.name = name;
            this.attributes = attributes;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public Map<String, String> getAttributes() { return attributes; }
        public void setAttributes(Map<String, String> attributes) { this.attributes = attributes; }
    }

    public static class Parameter {
        private String name;
        private String type;
        private List<Annotation> annotations;

        public Parameter() {}

        public Parameter(String name, String type, List<Annotation> annotations) {
            this.name = name;
            this.type = type;
            this.annotations = annotations;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public List<Annotation> getAnnotations() { return annotations; }
        public void setAnnotations(List<Annotation> annotations) { this.annotations = annotations; }
    }
}
