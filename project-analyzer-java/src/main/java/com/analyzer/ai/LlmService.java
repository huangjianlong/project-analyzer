package com.analyzer.ai;

import com.analyzer.AnalyzerProperties;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 调用 LM Studio / OpenAI 兼容接口的服务。
 * 使用 /v1/chat/completions 端点。
 */
public class LlmService {

    private final AnalyzerProperties.Ai config;
    private final HttpClient httpClient;
    private final Gson gson = new GsonBuilder().create();

    public LlmService(AnalyzerProperties.Ai config) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)   // LM Studio 只支持 HTTP/1.1
                .connectTimeout(Duration.ofSeconds(30))
                .proxy(HttpClient.Builder.NO_PROXY)      // 不走代理（替换 ProxySelector.of(null)）
                .build();
    }

    /**
     * 发送聊天请求，返回模型回复文本。
     */
    public String chat(String systemPrompt, String userMessage) {
        if (!config.isEnabled()) {
            return null;
        }

        try {
            var requestBody = Map.of(
                    "model", config.getModel(),
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userMessage)
                    ),
                    "max_tokens", config.getMaxTokens(),
                    "temperature", config.getTemperature(),
                    "stream", false,
                    "chat_template_kwargs", Map.of("enable_thinking", false)
            );

            String json = gson.toJson(requestBody);
            String url = config.getBaseUrl().replaceAll("/+$", "") + "/chat/completions";

            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(config.getTimeout()))
                    .POST(HttpRequest.BodyPublishers.ofString(json));

            if (config.getApiKey() != null && !config.getApiKey().isBlank()) {
                builder.header("Authorization", "Bearer " + config.getApiKey());
            }

            HttpResponse<String> response = httpClient.send(builder.build(),
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                System.err.println("  ⚠️ AI 请求失败 (HTTP " + response.statusCode() + "): "
                        + response.body().substring(0, Math.min(200, response.body().length())));
                return null;
            }

            // 解析响应
            @SuppressWarnings("unchecked")
            Map<String, Object> result = gson.fromJson(response.body(), Map.class);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> choices = (List<Map<String, Object>>) result.get("choices");
            if (choices != null && !choices.isEmpty()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                if (message != null) {
                    String content = (String) message.get("content");
                    // 如果 content 为空，尝试从 reasoning_content 提取（qwen3 thinking 模式）
                    if ((content == null || content.isBlank()) && message.containsKey("reasoning_content")) {
                        String reasoning = (String) message.get("reasoning_content");
                        if (reasoning != null && !reasoning.isBlank()) {
                            // 取 reasoning 最后一段作为回答
                            String[] parts = reasoning.split("\n\n");
                            content = parts[parts.length - 1].trim();
                            System.out.println("    [LLM] 从 reasoning_content 提取: " 
                                    + content.substring(0, Math.min(80, content.length())).replace("\n", "\\n"));
                        }
                    }
                    if (content != null && content.length() < 50) {
                        System.out.println("    [LLM] raw content: " + content.replace("\n", "\\n"));
                    } else if (content != null) {
                        System.out.println("    [LLM] raw content (" + content.length() + " chars): " 
                                + content.substring(0, Math.min(100, content.length())).replace("\n", "\\n") + "...");
                    } else {
                        System.out.println("    [LLM] content is null, full message keys: " + message.keySet());
                    }
                    return content;
                }
            }
            return null;

        } catch (Exception e) {
            System.err.println("  ⚠️ AI 请求异常: " + e.getMessage());
            return null;
        }
    }

    /**
     * 检查 LM Studio 是否可用。
     */
    public boolean isAvailable() {
        if (!config.isEnabled()) return false;
        // 跳过预检查，直接返回 true，在实际请求时处理失败
        return true;
    }
}
