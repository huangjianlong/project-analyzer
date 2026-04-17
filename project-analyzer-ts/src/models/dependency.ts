/**
 * Dependency — 依赖信息数据模型
 */

export interface Dependency {
  name: string;
  version: string;
  group?: string;
  category: DependencyCategory;
  scope: DependencyScope;
}

export type DependencyCategory =
  | 'web-framework' | 'database' | 'cache'
  | 'message-queue' | 'security' | 'testing'
  | 'logging' | 'utility' | 'other';

export type DependencyScope =
  | 'compile' | 'runtime' | 'test' | 'provided';
