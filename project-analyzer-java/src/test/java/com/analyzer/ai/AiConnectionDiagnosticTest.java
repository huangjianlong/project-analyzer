package com.analyzer.ai;

import com.analyzer.AnalyzerProperties;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;

/**
 * AI 接口连通性分层诊断测试。
 * 逐步排查：DNS → TCP → HTTP(无代理设置) → HTTP(ProxySelector.of(null)) → Chat API → LlmService
 *
 * 运行: mvn test -Dtest=AiConnectionDiagnosticTest -pl project-analyzer-java
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AiConnectionDiagnosticTest {

    private static final String HOST = "192.168.0.106";
    private static final int PORT = 1234;
    private static final String BASE_URL = "http://" + HOST + ":" + PORT + "/v1";
    private static final String MODEL = "qwen/qwen3.5-9b";

    @Test
    @Order(1)
    void step1_dnsAndTcp() {
        System.out.println("========== Step 1: DNS + TCP ==========");
        try {
            InetAddress addr = InetAddress.getByName(HOST);
            System.out.println("DNS 解析: " + HOST + " -> " + addr.getHostAddress());
        } catch (Exception e) {
            System.err.println("❌ DNS 失败: " + e.getMessage());
        }
        try (Socket socket = new Socket()) {
            Instant start = Instant.now();
            socket.connect(new InetSocketAddress(HOST, PORT), 5000);
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.out.println("✅ TCP 连接成功 (" + ms + "ms)");
        } catch (IOException e) {
            System.err.println("❌ TCP 连接失败: " + e.getMessage());
        }
    }

    @Test
    @Order(2)
    void step2_httpGet_defaultClient() throws Exception {
        System.out.println("\n========== Step 2: HTTP GET (默认 HttpClient，无代理设置) ==========");
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        doGet(client, "默认HttpClient");
    }

    @Test
    @Order(3)
    void step3_httpGet_noProxy() throws Exception {
        System.out.println("\n========== Step 3: HTTP GET (HttpClient + NO_PROXY) ==========");
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .proxy(HttpClient.Builder.NO_PROXY)
                .build();
        doGet(client, "NO_PROXY");
    }

    @Test
    @Order(4)
    void step4_httpGet_proxySelectorOfNull() throws Exception {
        System.out.println("\n========== Step 4: HTTP GET (ProxySelector.of(null) — LlmService 当前用法) ==========");
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .proxy(ProxySelector.of(null))
                    .build();
            doGet(client, "ProxySelector.of(null)");
        } catch (Exception e) {
            System.err.println("❌ ProxySelector.of(null) 构建/请求异常: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    @Order(5)
    void step5_chatApi_defaultClient() throws Exception {
        System.out.println("\n========== Step 5: Chat API (默认 HttpClient) ==========");
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        doChat(client, "默认HttpClient");
    }

    @Test
    @Order(6)
    void step6_chatApi_proxySelectorOfNull() throws Exception {
        System.out.println("\n========== Step 6: Chat API (ProxySelector.of(null)) ==========");
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(15))
                    .proxy(ProxySelector.of(null))
                    .build();
            doChat(client, "ProxySelector.of(null)");
        } catch (Exception e) {
            System.err.println("❌ 异常: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    @Order(7)
    void step7_llmService() {
        System.out.println("\n========== Step 7: LlmService 封装调用 ==========");
        AnalyzerProperties.Ai config = new AnalyzerProperties.Ai();
        config.setEnabled(true);
        config.setBaseUrl(BASE_URL);
        config.setModel(MODEL);
        config.setMaxTokens(64);
        config.setTimeout(60);
        config.setTemperature(0.3);
        config.setApiKey("");

        System.out.println("config.isEnabled(): " + config.isEnabled());
        System.out.println("config.getBaseUrl(): " + config.getBaseUrl());
        System.out.println("config.getModel(): " + config.getModel());

        LlmService service = new LlmService(config);
        System.out.println("isAvailable(): " + service.isAvailable());

        Instant start = Instant.now();
        String response = service.chat("用中文简短回答", "1+1等于几？");
        long ms = Duration.between(start, Instant.now()).toMillis();

        if (response != null) {
            System.out.println("✅ LlmService 调用成功 (" + ms + "ms)");
            System.out.println("   响应: " + response);
        } else {
            System.err.println("❌ LlmService 返回 null (" + ms + "ms)");
            System.err.println("   检查上方 stderr 输出的具体错误信息");
        }
    }

    // ── 工具方法 ──

    private void doGet(HttpClient client, String label) {
        String url = BASE_URL + "/models";
        System.out.println("GET " + url + " [" + label + "]");
        try {
            Instant start = Instant.now();
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder().uri(URI.create(url)).timeout(Duration.ofSeconds(15)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.out.println("✅ HTTP " + resp.statusCode() + " (" + ms + "ms)");
            System.out.println("   Body: " + resp.body().substring(0, Math.min(200, resp.body().length())));
        } catch (Exception e) {
            System.err.println("❌ 请求失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            if (e.getCause() != null) {
                System.err.println("   Cause: " + e.getCause().getClass().getSimpleName() + ": " + e.getCause().getMessage());
            }
        }
    }

    private void doChat(HttpClient client, String label) {
        String url = BASE_URL + "/chat/completions";
        String json = """
                {
                  "model": "%s",
                  "messages": [
                    {"role": "system", "content": "用中文简短回答"},
                    {"role": "user", "content": "1+1等于几？"}
                  ],
                  "max_tokens": 64,
                  "temperature": 0.3,
                  "stream": false
                }
                """.formatted(MODEL);

        System.out.println("POST " + url + " [" + label + "]");
        try {
            Instant start = Instant.now();
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder()
                            .uri(URI.create(url))
                            .header("Content-Type", "application/json")
                            .timeout(Duration.ofSeconds(120))
                            .POST(HttpRequest.BodyPublishers.ofString(json))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.out.println("✅ HTTP " + resp.statusCode() + " (" + ms + "ms)");
            System.out.println("   Body: " + resp.body().substring(0, Math.min(500, resp.body().length())));
        } catch (Exception e) {
            System.err.println("❌ 请求失败: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            if (e.getCause() != null) {
                System.err.println("   Cause: " + e.getCause().getClass().getSimpleName() + ": " + e.getCause().getMessage());
            }
        }
    }
}
