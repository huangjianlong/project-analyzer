package com.analyzer.plugin;

import com.analyzer.model.ProjectProfile;

import java.util.List;

public interface AnalysisModuleInterface {
    String getName();
    Object analyze(ProjectProfile profile, List<LanguagePlugin> plugins);
}
