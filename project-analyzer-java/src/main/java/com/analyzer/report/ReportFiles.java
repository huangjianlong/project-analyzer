package com.analyzer.report;

import java.util.List;

public class ReportFiles {
    private String indexFile;
    private List<String> reportFiles;

    public ReportFiles() {}

    public ReportFiles(String indexFile, List<String> reportFiles) {
        this.indexFile = indexFile;
        this.reportFiles = reportFiles;
    }

    public String getIndexFile() { return indexFile; }
    public void setIndexFile(String indexFile) { this.indexFile = indexFile; }

    public List<String> getReportFiles() { return reportFiles; }
    public void setReportFiles(List<String> reportFiles) { this.reportFiles = reportFiles; }
}
