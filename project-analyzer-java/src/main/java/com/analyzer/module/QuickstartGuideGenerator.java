package com.analyzer.module;

import com.analyzer.model.*;
import com.analyzer.model.AnalysisReport.*;
import com.analyzer.plugin.AnalysisModuleInterface;
import com.analyzer.plugin.LanguagePlugin;

import java.util.*;

public class QuickstartGuideGenerator implements AnalysisModuleInterface {

    private static final String INSUFFICIENT_DATA = "信息不足，建议手动补充";

    @Override
    public String getName() { return "quickstart"; }

    @Override
    public Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins) {
        return emptyResult();
    }

    public QuickstartResult generateGuide(AnalysisReport report) {
        QuickstartResult result = new QuickstartResult();
        result.setFiveMinuteOverview(buildFiveMinuteOverview(report));
        result.setDevSetupSteps(buildDevSetupSteps(report));
        result.setBusinessOverview(buildBusinessOverview(report));
        result.setWarnings(buildWarnings(report));
        result.setApiQuickRef(buildApiQuickRef(report));
        return result;
    }

    private FiveMinuteOverview buildFiveMinuteOverview(AnalysisReport report) {
        FiveMinuteOverview ov = new FiveMinuteOverview();
        ov.setPurpose(report.getProfile().getProjectName() + " — " + report.getProfile().getPrimaryLanguage() + " 项目");
        ov.setTechStack(report.getArchitecture() != null && report.getArchitecture().getFrameworks() != null
                ? report.getArchitecture().getFrameworks().stream().map(FrameworkInfo::getName).toList()
                : List.of(INSUFFICIENT_DATA));
        ov.setCoreModules(report.getBusiness() != null && report.getBusiness().getModules() != null
                ? report.getBusiness().getModules().stream().map(ModuleInfo::getName).toList()
                : List.of(INSUFFICIENT_DATA));
        ov.setStartupCommand(report.getOps() != null && report.getOps().getStartup() != null
                && !report.getOps().getStartup().isEmpty()
                ? report.getOps().getStartup().get(0).getCommand() : INSUFFICIENT_DATA);
        return ov;
    }

    private List<String> buildDevSetupSteps(AnalysisReport report) {
        List<String> steps = new ArrayList<>();
        String installCmd = getInstallCommand(report.getProfile().getBuildTool());
        if (installCmd != null) steps.add(installCmd);
        if (report.getOps() != null && report.getOps().getStartup() != null
                && !report.getOps().getStartup().isEmpty()) {
            steps.add(report.getOps().getStartup().get(0).getCommand());
        }
        return steps.isEmpty() ? List.of(INSUFFICIENT_DATA) : steps;
    }

    private String getInstallCommand(ProjectProfile.BuildToolType buildTool) {
        return switch (buildTool) {
            case MAVEN -> "mvn install";
            case GRADLE -> "./gradlew build";
            case NPM -> "npm install";
            case YARN -> "yarn install";
            case PNPM -> "pnpm install";
            case PIP -> "pip install -r requirements.txt";
            case POETRY -> "poetry install";
            case GO_MOD -> "go mod download";
            default -> null;
        };
    }

    private List<BusinessOverviewEntry> buildBusinessOverview(AnalysisReport report) {
        if (report.getBusiness() == null || report.getBusiness().getModules() == null
                || report.getBusiness().getModules().isEmpty()) {
            BusinessOverviewEntry entry = new BusinessOverviewEntry();
            entry.setModuleName(INSUFFICIENT_DATA);
            entry.setDescription(INSUFFICIENT_DATA);
            entry.setKeyFiles(List.of());
            entry.setRelatedApis(List.of());
            return List.of(entry);
        }
        List<ApiEndpoint> endpoints = report.getApis() != null && report.getApis().getEndpoints() != null
                ? report.getApis().getEndpoints() : List.of();
        return report.getBusiness().getModules().stream().map(mod -> {
            List<String> relatedApis = endpoints.stream()
                    .filter(ep -> {
                        String handler = ep.getHandlerClass() != null ? ep.getHandlerClass() : "";
                        return handler.contains(mod.getName()) || mod.getPath().contains(handler);
                    })
                    .map(ep -> ep.getMethod() + " " + ep.getPath()).toList();
            BusinessOverviewEntry entry = new BusinessOverviewEntry();
            entry.setModuleName(mod.getName());
            entry.setDescription(mod.getDescription() != null ? mod.getDescription() : INSUFFICIENT_DATA);
            entry.setKeyFiles(mod.getKeyFiles() != null ? mod.getKeyFiles() : List.of());
            entry.setRelatedApis(relatedApis);
            return entry;
        }).toList();
    }

    private List<PitfallRecord> buildWarnings(AnalysisReport report) {
        if (report.getPitfalls() == null || report.getPitfalls().getRecords() == null) return List.of();
        return report.getPitfalls().getRecords().stream()
                .filter(r -> r.getSeverity() == PitfallRecord.Severity.HIGH).toList();
    }

    private List<ApiQuickRefEntry> buildApiQuickRef(AnalysisReport report) {
        if (report.getApis() == null || report.getApis().getEndpoints() == null
                || report.getApis().getEndpoints().isEmpty()) return null;
        return report.getApis().getEndpoints().stream().map(ep -> {
            ApiQuickRefEntry entry = new ApiQuickRefEntry();
            entry.setPath(ep.getPath());
            entry.setMethod(ep.getMethod());
            entry.setDescription(ep.getDescription() != null ? ep.getDescription() : INSUFFICIENT_DATA);
            return entry;
        }).toList();
    }

    private QuickstartResult emptyResult() {
        QuickstartResult r = new QuickstartResult();
        FiveMinuteOverview ov = new FiveMinuteOverview();
        ov.setPurpose(INSUFFICIENT_DATA);
        ov.setTechStack(List.of(INSUFFICIENT_DATA));
        ov.setCoreModules(List.of(INSUFFICIENT_DATA));
        ov.setStartupCommand(INSUFFICIENT_DATA);
        r.setFiveMinuteOverview(ov);
        r.setDevSetupSteps(List.of(INSUFFICIENT_DATA));
        BusinessOverviewEntry entry = new BusinessOverviewEntry();
        entry.setModuleName(INSUFFICIENT_DATA); entry.setDescription(INSUFFICIENT_DATA);
        entry.setKeyFiles(List.of()); entry.setRelatedApis(List.of());
        r.setBusinessOverview(List.of(entry));
        r.setWarnings(List.of());
        return r;
    }
}
