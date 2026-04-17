package com.analyzer.model;

import java.util.List;

/**
 * ApiEndpoint — API 接口数据模型
 */
public class ApiEndpoint {
    private String path;
    private HttpMethod method;
    private String handlerClass;
    private String handlerMethod;
    private List<ApiParameter> parameters;
    private String responseType;   // nullable
    private String description;    // nullable
    private List<String> tags;

    public ApiEndpoint() {}

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public HttpMethod getMethod() { return method; }
    public void setMethod(HttpMethod method) { this.method = method; }

    public String getHandlerClass() { return handlerClass; }
    public void setHandlerClass(String handlerClass) { this.handlerClass = handlerClass; }

    public String getHandlerMethod() { return handlerMethod; }
    public void setHandlerMethod(String handlerMethod) { this.handlerMethod = handlerMethod; }

    public List<ApiParameter> getParameters() { return parameters; }
    public void setParameters(List<ApiParameter> parameters) { this.parameters = parameters; }

    public String getResponseType() { return responseType; }
    public void setResponseType(String responseType) { this.responseType = responseType; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<String> getTags() { return tags; }
    public void setTags(List<String> tags) { this.tags = tags; }

    public enum HttpMethod {
        GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS;

        public static HttpMethod fromValue(String value) {
            return valueOf(value.toUpperCase());
        }
    }

    public static class ApiParameter {
        private String name;
        private String type;
        private ParameterIn in;
        private boolean required;
        private String description; // nullable

        public ApiParameter() {}

        public ApiParameter(String name, String type, ParameterIn in, boolean required, String description) {
            this.name = name;
            this.type = type;
            this.in = in;
            this.required = required;
            this.description = description;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public ParameterIn getIn() { return in; }
        public void setIn(ParameterIn in) { this.in = in; }

        public boolean isRequired() { return required; }
        public void setRequired(boolean required) { this.required = required; }

        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }

        public enum ParameterIn {
            PATH("path"),
            QUERY("query"),
            BODY("body"),
            HEADER("header");

            private final String value;

            ParameterIn(String value) { this.value = value; }
            public String getValue() { return value; }

            public static ParameterIn fromValue(String value) {
                for (ParameterIn p : values()) {
                    if (p.value.equals(value)) return p;
                }
                return QUERY;
            }
        }
    }
}
