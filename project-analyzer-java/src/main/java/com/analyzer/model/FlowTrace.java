package com.analyzer.model;

import java.util.List;

/**
 * FlowTrace — 流程追踪数据模型
 */
public class FlowTrace {
    private EntryPoint entryPoint;
    private List<CallStep> callChain;
    private int maxDepth;
    private String description;

    public FlowTrace() {}

    public FlowTrace(EntryPoint entryPoint, List<CallStep> callChain, int maxDepth, String description) {
        this.entryPoint = entryPoint;
        this.callChain = callChain;
        this.maxDepth = maxDepth;
        this.description = description;
    }

    public EntryPoint getEntryPoint() { return entryPoint; }
    public void setEntryPoint(EntryPoint entryPoint) { this.entryPoint = entryPoint; }

    public List<CallStep> getCallChain() { return callChain; }
    public void setCallChain(List<CallStep> callChain) { this.callChain = callChain; }

    public int getMaxDepth() { return maxDepth; }
    public void setMaxDepth(int maxDepth) { this.maxDepth = maxDepth; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public static class EntryPoint {
        private EntryPointType type;
        private String className;
        private String methodName;
        private String filePath;
        private String httpPath; // nullable
        private String description; // nullable — 方法描述

        public EntryPoint() {}

        public EntryPoint(EntryPointType type, String className, String methodName,
                          String filePath, String httpPath) {
            this.type = type;
            this.className = className;
            this.methodName = methodName;
            this.filePath = filePath;
            this.httpPath = httpPath;
        }

        public EntryPointType getType() { return type; }
        public void setType(EntryPointType type) { this.type = type; }

        public String getClassName() { return className; }
        public void setClassName(String className) { this.className = className; }

        public String getMethodName() { return methodName; }
        public void setMethodName(String methodName) { this.methodName = methodName; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public String getHttpPath() { return httpPath; }
        public void setHttpPath(String httpPath) { this.httpPath = httpPath; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    public enum EntryPointType {
        CONTROLLER("controller"),
        MAIN("main"),
        EVENT_HANDLER("event-handler"),
        SCHEDULED("scheduled"),
        OTHER("other");

        private final String value;

        EntryPointType(String value) { this.value = value; }
        public String getValue() { return value; }

        public static EntryPointType fromValue(String value) {
            for (EntryPointType t : values()) {
                if (t.value.equals(value)) return t;
            }
            return OTHER;
        }
    }

    public static class CallStep {
        private int depth;
        private String className;
        private String methodName;
        private String filePath;
        private int line;
        private boolean isExternal;
        private String description; // nullable

        public CallStep() {}

        public CallStep(int depth, String className, String methodName,
                        String filePath, int line, boolean isExternal, String description) {
            this.depth = depth;
            this.className = className;
            this.methodName = methodName;
            this.filePath = filePath;
            this.line = line;
            this.isExternal = isExternal;
            this.description = description;
        }

        public int getDepth() { return depth; }
        public void setDepth(int depth) { this.depth = depth; }

        public String getClassName() { return className; }
        public void setClassName(String className) { this.className = className; }

        public String getMethodName() { return methodName; }
        public void setMethodName(String methodName) { this.methodName = methodName; }

        public String getFilePath() { return filePath; }
        public void setFilePath(String filePath) { this.filePath = filePath; }

        public int getLine() { return line; }
        public void setLine(int line) { this.line = line; }

        public boolean isExternal() { return isExternal; }
        public void setExternal(boolean external) { isExternal = external; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }
}
