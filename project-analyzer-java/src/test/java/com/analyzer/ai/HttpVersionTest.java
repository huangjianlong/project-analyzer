package com.analyzer.ai;

import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;

/**
 * 测试 HTTP/1.1 vs HTTP/2 对 LM Studio 的影响。
 * 运行: mvn test -Dtest=HttpVersionTest
 */
class HttpVersionTest {

    private static final String BASE_URL = "http://192.168.0.106:1234/v1";

    @Test
    void testHttp11() throws Exception {
        System.out.println("========== HTTP/1.1 强制 ==========");
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/models"))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();

        Instant start = Instant.now();
        try {
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.out.println("✅ HTTP/1.1 成功 (" + ms + "ms) 状态码: " + resp.statusCode());
            System.out.println("Body: " + resp.body().substring(0, Math.min(300, resp.body().length())));
        } catch (Exception e) {
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.err.println("❌ HTTP/1.1 失败 (" + ms + "ms): " + e.getMessage());
        }
    }

    @Test
    void testHttp2() throws Exception {
        System.out.println("\n========== HTTP/2 (Java默认) ==========");
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(10))
                .build();

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(BASE_URL + "/models"))
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();

        Instant start = Instant.now();
        try {
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.out.println("✅ HTTP/2 成功 (" + ms + "ms) 状态码: " + resp.statusCode());
            System.out.println("Body: " + resp.body().substring(0, Math.min(300, resp.body().length())));
        } catch (Exception e) {
            long ms = Duration.between(start, Instant.now()).toMillis();
            System.err.println("❌ HTTP/2 失败 (" + ms + "ms): " + e.getMessage());
        }
    }
}
