package com.analyzer.error;

public class AnalysisException extends Exception {
    private final AnalysisErrorCode code;
    private final String module;
    private final String filePath;
    private final boolean recoverable;

    public AnalysisException(AnalysisErrorCode code, String message, boolean recoverable) {
        super(message);
        this.code = code;
        this.module = null;
        this.filePath = null;
        this.recoverable = recoverable;
    }

    public AnalysisException(AnalysisErrorCode code, String message, boolean recoverable,
                             String module, String filePath, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.module = module;
        this.filePath = filePath;
        this.recoverable = recoverable;
    }

    public AnalysisErrorCode getCode() { return code; }
    public String getModule() { return module; }
    public String getFilePath() { return filePath; }
    public boolean isRecoverable() { return recoverable; }
}
