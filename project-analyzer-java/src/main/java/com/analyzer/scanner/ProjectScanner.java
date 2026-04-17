package com.analyzer.scanner;

import com.analyzer.error.AnalysisException;
import com.analyzer.model.ProjectProfile;

public interface ProjectScanner {
    ProjectProfile scan(String projectPath) throws AnalysisException;
}
