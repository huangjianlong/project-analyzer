/**
 * Project Analyzer - TypeScript Version
 *
 * A command-line tool for analyzing project structure, architecture,
 * and business logic across multiple languages (Python, JS/TS, Go).
 */

export { version } from './version.js';

// Data models
export * from './models/index.js';

// Error handling
export * from './errors/index.js';

// Plugin interfaces
export * from './plugins/index.js';

// Scanner
export * from './scanner/index.js';

// Analysis modules
export * from './modules/index.js';

// Report generation
export * from './report/index.js';

// Analyzer coordinator
export * from './analyzer/index.js';
