package com.analyzer.error;

import java.util.List;

public interface ErrorCollector {
    void addError(AnalysisException error);
    void addWarning(AnalysisException warning);
    List<AnalysisException> getErrors();
    List<AnalysisException> getWarnings();
    boolean hasErrors();
    boolean hasFatalErrors();
}
