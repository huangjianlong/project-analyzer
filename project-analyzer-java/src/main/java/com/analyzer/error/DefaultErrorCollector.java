package com.analyzer.error;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class DefaultErrorCollector implements ErrorCollector {
    private final List<AnalysisException> errors = new ArrayList<>();
    private final List<AnalysisException> warnings = new ArrayList<>();

    @Override
    public void addError(AnalysisException error) { errors.add(error); }

    @Override
    public void addWarning(AnalysisException warning) { warnings.add(warning); }

    @Override
    public List<AnalysisException> getErrors() { return Collections.unmodifiableList(new ArrayList<>(errors)); }

    @Override
    public List<AnalysisException> getWarnings() { return Collections.unmodifiableList(new ArrayList<>(warnings)); }

    @Override
    public boolean hasErrors() { return !errors.isEmpty(); }

    @Override
    public boolean hasFatalErrors() { return errors.stream().anyMatch(e -> !e.isRecoverable()); }
}
