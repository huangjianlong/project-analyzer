package com.analyzer.ai;

import com.analyzer.AnalyzerProperties;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 单独测试 AI 接口连通性。
 * 运行: mvn test -Dtest=LlmConnectionTest
 */
class LlmConnectionTest {

    private static final String BASE_URL = "http://192.168.0.106:1234/v1";

    @Test
    void testRawHttpConnection() throws Exception {
        System.out.println("=== 测试1: 原生 Java HttpClient 连接 ===");
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/models"))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();

        System.out.println("请求: GET " + BASE_URL + "/models");
        try {
            HttpResponse<String> response = client.send(request,
                    HttpResponse.BodyHandlers.ofString());
            System.out.println("状态码: " + response.statusCode());
            System.out.println("响应: " + response.body().substring(0, Math.min(300, response.body().length())));
        } catch (Exception e) {
            System.err.println("连接失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    void testChatCompletion() throws Exception {
        System.out.println("\n=== 测试2: Chat Completion 请求 ===");
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();

        String json = """
                {
                  "model": "qwen/qwen3.5-9b",
                  "messages": [
                    {"role": "system", "content": "用中文简短回答"},
                    {"role": "user", "content": "1+1等于几？"}
                  ],
                  "max_tokens": 64,
                  "temperature": 0.3,
                  "stream": false
                }
                """;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/chat/completions"))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(60))
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        System.out.println("请求: POST " + BASE_URL + "/chat/completions");
        System.out.println("Body: " + json.trim());
        try {
            HttpResponse<String> response = client.send(request,
                    HttpResponse.BodyHandlers.ofString());
            System.out.println("状态码: " + response.statusCode());
            System.out.println("响应: " + response.body().substring(0, Math.min(500, response.body().length())));
        } catch (Exception e) {
            System.err.println("请求失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    void testLlmService() throws Exception {
        System.out.println("\n=== 测试3: LlmService 封装 ===");
        AnalyzerProperties.Ai config = new AnalyzerProperties.Ai();
        config.setEnabled(true);
        config.setBaseUrl(BASE_URL);
        config.setModel("qwen/qwen3.5-9b");
        config.setMaxTokens(64);
        config.setTimeout(60);
        config.setTemperature(0.3);

        LlmService service = new LlmService(config);
        System.out.println("isAvailable: " + service.isAvailable());

        String response = service.chat("用中文简短回答", "Java的创始人是谁？");
        System.out.println("chat 响应: " + response);
    }
}
