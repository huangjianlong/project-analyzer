package com.analyzer.plugin;

import com.analyzer.model.ApiEndpoint;
import com.analyzer.model.AstNode;
import com.analyzer.model.Dependency;
import com.analyzer.model.ModuleInfo;

import java.nio.file.Path;
import java.util.List;

public interface LanguagePlugin {
    String getLanguageId();
    List<AstNode> parseFile(Path filePath);
    List<Dependency> extractDependencies(Path projectRoot);
    List<ApiEndpoint> identifyApis(Path filePath);
    List<ModuleInfo> identifyModules(Path projectRoot);
}
