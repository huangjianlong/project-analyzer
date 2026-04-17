/**
 * Error handling types for Project Analyzer.
 *
 * Defines error codes and the AnalysisError interface used throughout
 * the analysis pipeline. Each error is classified as recoverable or
 * non-recoverable to support the graceful degradation strategy.
 */

/**
 * All possible error codes emitted during analysis.
 *
 * Non-recoverable (fatal) errors:
 *   INVALID_PATH, EMPTY_PROJECT, REPORT_WRITE_ERROR
 *
 * Recoverable errors (analysis continues with degraded output):
 *   PARSE_ERROR, PLUGIN_NOT_FOUND, PLUGIN_ERROR, MODULE_ERROR,
 *   CONFIG_PARSE_ERROR, DEPENDENCY_PARSE_ERROR, TIMEOUT_ERROR, UNKNOWN_ERROR
 */
export type AnalysisErrorCode =
  | 'INVALID_PATH'
  | 'EMPTY_PROJECT'
  | 'PARSE_ERROR'
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_ERROR'
  | 'MODULE_ERROR'
  | 'REPORT_WRITE_ERROR'
  | 'CONFIG_PARSE_ERROR'
  | 'DEPENDENCY_PARSE_ERROR'
  | 'TIMEOUT_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Structured error produced during analysis.
 *
 * `recoverable` determines whether the analysis pipeline can continue
 * (degraded) or must abort immediately.
 */
export interface AnalysisError {
  /** Machine-readable error code. */
  code: AnalysisErrorCode;
  /** Human-readable description of what went wrong. */
  message: string;
  /** Name of the analysis module that raised the error (e.g. "ArchitectureAnalyzer"). */
  module?: string;
  /** File path related to the error, if applicable. */
  filePath?: string;
  /** Original exception, if the error wraps another. */
  cause?: Error;
  /** Whether the analysis can continue despite this error. */
  recoverable: boolean;
}

/**
 * Throwable error class that carries structured {@link AnalysisError} data.
 *
 * Use this when the analysis pipeline needs to abort (non-recoverable)
 * or when a module wants to signal a typed error to the coordinator.
 */
export class AnalysisException extends Error {
  readonly code: AnalysisErrorCode;
  readonly recoverable: boolean;
  readonly module?: string;
  readonly filePath?: string;

  constructor(error: AnalysisError) {
    super(error.message);
    this.name = 'AnalysisException';
    this.code = error.code;
    this.recoverable = error.recoverable;
    this.module = error.module;
    this.filePath = error.filePath;
    if (error.cause) {
      this.cause = error.cause;
    }
  }
}
