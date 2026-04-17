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
                .connectTimeout(Duration.ofSeconds(config.getTimeout()))
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
                    "stream", false
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
                    return (String) message.get("content");
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
        try {
            String url = config.getBaseUrl().replaceAll("/+$", "") + "/models";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(5))
                    .GET().build();
            HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (Exception e) {
            return false;
        }
    }
}
