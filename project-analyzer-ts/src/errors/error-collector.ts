/**
 * ErrorCollector interface and default implementation.
 *
 * Collects errors and warnings produced during the analysis pipeline
 * so they can be summarised in the final report and used to decide
 * whether the process should abort (fatal) or continue (degraded).
 */

import type { AnalysisError } from './types.js';

/**
 * Collects analysis errors and warnings.
 */
export interface ErrorCollector {
  /** Record a hard error. */
  addError(error: AnalysisError): void;
  /** Record a non-critical warning. */
  addWarning(warning: AnalysisError): void;
  /** Return all recorded errors. */
  getErrors(): AnalysisError[];
  /** Return all recorded warnings. */
  getWarnings(): AnalysisError[];
  /** True if at least one error has been recorded. */
  hasErrors(): boolean;
  /** True if any recorded error has `recoverable === false`. */
  hasFatalErrors(): boolean;
}

/**
 * Simple in-memory implementation of {@link ErrorCollector}.
 */
export class DefaultErrorCollector implements ErrorCollector {
  private readonly errors: AnalysisError[] = [];
  private readonly warnings: AnalysisError[] = [];

  addError(error: AnalysisError): void {
    this.errors.push(error);
  }

  addWarning(warning: AnalysisError): void {
    this.warnings.push(warning);
  }

  getErrors(): AnalysisError[] {
    return [...this.errors];
  }

  getWarnings(): AnalysisError[] {
    return [...this.warnings];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasFatalErrors(): boolean {
    return this.errors.some((e) => !e.recoverable);
  }
}
