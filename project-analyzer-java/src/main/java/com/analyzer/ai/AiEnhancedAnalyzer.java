package com.analyzer.ai;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;

import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 使用大模型增强分析结果。
 *
 * 针对小上下文窗口（10K token）优化：
 * - 每次请求只处理一个模块/接口
 * - prompt 极简，只发元信息不发代码
 * - system prompt 精简到一行
 * - 限制回复长度
 */
public class AiEnhancedAnalyzer {

    /** 极简 system prompt，节省 token。/no_think 禁用 qwen3 的 thinking 模式 */
    private static final String SYS = "/no_think\n你是代码分析专家，用中文简短回答。";

    private final LlmService llm;
    private final int batchSize;

    public AiEnhancedAnalyzer(LlmService llm) {
        this.llm = llm;
        this.batchSize = 5; // API 接口每批最多 5 个
    }

    /**
     * 增强业务模块描述 — 逐个模块请求，每次只发模块名+类名。
     */
    public void enhanceBusinessModules(BusinessResult business) {
        if (business == null || business.getModules() == null) return;

        for (ModuleInfo mod : business.getModules()) {
            try {
                // 极简 prompt：只发模块名和核心类名
                StringBuilder prompt = new StringBuilder();
                prompt.append("模块「").append(shortName(mod.getName())).append("」");
                if (mod.getKeyClasses() != null && !mod.getKeyClasses().isEmpty()) {
                    prompt.append("，含类: ").append(
                            mod.getKeyClasses().stream().limit(3).collect(Collectors.joining(",")));
                }
                prompt.append("。用一句话描述功能（20字内）");

                String resp = llm.chat(SYS, prompt.toString());
                String desc = clean(resp);
                System.out.println("    [AI] 模块「" + shortName(mod.getName()) + "」→ raw=" 
                        + (resp == null ? "null" : resp.length() + "chars") + ", clean=" + desc);
                if (!desc.isBlank() && desc.length() < 100) {
                    mod.setDescription(desc);
                    mod.setInferred(false);
                }
            } catch (Exception e) {
                System.err.println("    [AI] 模块「" + mod.getName() + "」异常: " + e.getMessage());
            }
        }
    }

    /**
     * 为 API 接口生成描述 — 每批最多 5 个接口。
     */
    public void enhanceApiDescriptions(ApiResult apis) {
        if (apis == null || apis.getEndpoints() == null) return;

        List<ApiEndpoint> needDesc = apis.getEndpoints().stream()
                .filter(ep -> ep.getDescription() == null || ep.getDescription().isBlank())
                .toList();

        // 分批处理，每批 batchSize 个
        for (int i = 0; i < needDesc.size(); i += batchSize) {
            List<ApiEndpoint> batch = needDesc.subList(i,
                    Math.min(i + batchSize, needDesc.size()));
            try {
                enhanceApiBatch(batch);
            } catch (Exception e) {
                // 单批失败不影响其他
            }
        }
    }

    private void enhanceApiBatch(List<ApiEndpoint> batch) {
        // 极简 prompt
        StringBuilder prompt = new StringBuilder("为以下接口各写一句功能描述（10字内）：\n");
        for (int i = 0; i < batch.size(); i++) {
            ApiEndpoint ep = batch.get(i);
            prompt.append(i + 1).append(". ")
                    .append(ep.getMethod()).append(" ").append(ep.getPath())
                    .append("\n");
        }

        String resp = llm.chat(SYS, prompt.toString());
        if (resp == null) return;

        String[] lines = clean(resp).split("\n");
        for (int i = 0; i < Math.min(lines.length, batch.size()); i++) {
            String desc = lines[i].replaceAll("^\\d+[.、]\\s*", "").trim();
            if (!desc.isBlank() && desc.length() < 50) {
                batch.get(i).setDescription(desc);
            }
        }
    }

    /**
     * 为高严重度坑点生成修复建议 — 逐个请求。
     */
    public void enhancePitfallSuggestions(PitfallResult pitfalls) {
        if (pitfalls == null || pitfalls.getRecords() == null) return;

        List<PitfallRecord> highPitfalls = pitfalls.getRecords().stream()
                .filter(r -> r.getSeverity() == PitfallRecord.Severity.HIGH)
                .limit(3) // 最多 3 个，节省请求
                .toList();

        for (PitfallRecord record : highPitfalls) {
            try {
                // 极简 prompt
                String prompt = "问题：" + truncate(record.getDescription(), 60)
                        + "。给修复建议（30字内）";
                String resp = llm.chat(SYS, prompt);
                String suggestion = clean(resp);
                if (!suggestion.isBlank() && suggestion.length() < 100) {
                    record.setSuggestion(suggestion);
                }
            } catch (Exception e) {
                // 单个失败不影响其他
            }
        }
    }

    /**
     * 生成项目总结 — 单次请求，只发关键元信息。
     */
    public String generateProjectSummary(AnalysisReport report) {
        try {
            StringBuilder prompt = new StringBuilder();
            prompt.append("项目「").append(report.getProfile().getProjectName()).append("」");
            prompt.append("，").append(report.getProfile().getPrimaryLanguage());
            prompt.append("，").append(report.getProfile().getBuildTool().getValue());

            if (report.getArchitecture() != null && report.getArchitecture().getFrameworks() != null
                    && !report.getArchitecture().getFrameworks().isEmpty()) {
                prompt.append("，框架: ").append(report.getArchitecture().getFrameworks().stream()
                        .map(FrameworkInfo::getName).limit(3).collect(Collectors.joining(",")));
            }

            if (report.getBusiness() != null && report.getBusiness().getModules() != null) {
                prompt.append("，").append(report.getBusiness().getModules().size()).append("个模块");
            }

            if (report.getApis() != null) {
                prompt.append("，").append(report.getApis().getTotalCount()).append("个API");
            }

            prompt.append("。写项目总结（50字内）");

            String resp = llm.chat(SYS, prompt.toString());
            return clean(resp);
        } catch (Exception e) {
            return null;
        }
    }

    // ── 工具方法 ──

    /** 清理模型回复：去掉 think 标签、markdown 格式等 */
    private String clean(String response) {
        if (response == null || response.isBlank()) return "";
        // 去掉 <think>...</think>（包括跨行内容）
        String s = response.replaceAll("(?s)<think>.*?</think>", "").trim();
        // 如果清理后为空，尝试提取 </think> 之后的内容
        if (s.isEmpty() && response.contains("</think>")) {
            s = response.substring(response.lastIndexOf("</think>") + "</think>".length()).trim();
        }
        // 去掉 markdown 粗体/斜体
        s = s.replaceAll("[*_`#]", "").trim();
        // 去掉开头换行
        s = s.replaceAll("^[\\s\\n]+", "");
        // 取第一行有意义的内容
        for (String line : s.split("\n")) {
            String t = line.trim();
            if (!t.isEmpty() && t.length() > 2) return t;
        }
        return s.length() > 200 ? s.substring(0, 200) : s;
    }

    /** 截取模块名最后一段（去掉包路径前缀） */
    private String shortName(String name) {
        if (name.contains(".")) {
            String[] parts = name.split("\\.");
            return parts[parts.length - 1];
        }
        return name;
    }

    /** 截断字符串 */
    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) + "..." : s;
    }
}
