/**
 * PitfallRecord — 坑点记录数据模型
 */

export interface PitfallRecord {
  category: PitfallCategory;
  severity: 'high' | 'medium' | 'low';
  filePath: string;
  line?: number;
  description: string;
  suggestion: string;
}

export type PitfallCategory =
  | 'anti-pattern'
  | 'deprecated-dep'
  | 'security-risk'
  | 'todo-marker'
  | 'code-style'
  | 'hardcoded-config'
  | 'missing-test';
