import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultErrorCollector } from './error-collector.js';
import type { AnalysisError } from './types.js';

describe('DefaultErrorCollector', () => {
  let collector: DefaultErrorCollector;

  beforeEach(() => {
    collector = new DefaultErrorCollector();
  });

  it('starts with no errors or warnings', () => {
    expect(collector.getErrors()).toEqual([]);
    expect(collector.getWarnings()).toEqual([]);
    expect(collector.hasErrors()).toBe(false);
    expect(collector.hasFatalErrors()).toBe(false);
  });

  it('records errors and exposes them via getErrors()', () => {
    const err: AnalysisError = {
      code: 'PARSE_ERROR',
      message: 'bad syntax',
      recoverable: true,
    };
    collector.addError(err);

    expect(collector.getErrors()).toEqual([err]);
    expect(collector.hasErrors()).toBe(true);
  });

  it('records warnings separately from errors', () => {
    const warn: AnalysisError = {
      code: 'CONFIG_PARSE_ERROR',
      message: 'missing field',
      recoverable: true,
    };
    collector.addWarning(warn);

    expect(collector.getWarnings()).toEqual([warn]);
    expect(collector.hasErrors()).toBe(false);
  });

  it('hasFatalErrors() returns false when all errors are recoverable', () => {
    collector.addError({ code: 'PARSE_ERROR', message: 'a', recoverable: true });
    collector.addError({ code: 'MODULE_ERROR', message: 'b', recoverable: true });

    expect(collector.hasFatalErrors()).toBe(false);
  });

  it('hasFatalErrors() returns true when any error is non-recoverable', () => {
    collector.addError({ code: 'PARSE_ERROR', message: 'a', recoverable: true });
    collector.addError({ code: 'INVALID_PATH', message: 'b', recoverable: false });

    expect(collector.hasFatalErrors()).toBe(true);
  });

  it('getErrors() returns a copy so external mutations do not affect internal state', () => {
    collector.addError({ code: 'UNKNOWN_ERROR', message: 'x', recoverable: true });
    const snapshot = collector.getErrors();
    snapshot.pop();

    expect(collector.getErrors()).toHaveLength(1);
  });

  it('getWarnings() returns a copy so external mutations do not affect internal state', () => {
    collector.addWarning({ code: 'PLUGIN_NOT_FOUND', message: 'w', recoverable: true });
    const snapshot = collector.getWarnings();
    snapshot.pop();

    expect(collector.getWarnings()).toHaveLength(1);
  });

  it('preserves optional fields on AnalysisError', () => {
    const cause = new Error('root cause');
    const err: AnalysisError = {
      code: 'MODULE_ERROR',
      message: 'boom',
      module: 'FlowAnalyzer',
      filePath: '/src/flow.ts',
      cause,
      recoverable: true,
    };
    collector.addError(err);

    const stored = collector.getErrors()[0];
    expect(stored.module).toBe('FlowAnalyzer');
    expect(stored.filePath).toBe('/src/flow.ts');
    expect(stored.cause).toBe(cause);
  });
});
