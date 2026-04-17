/**
 * AstNode — AST 节点数据模型
 */

export interface AstNode {
  type: AstNodeType;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  modifiers: string[];
  annotations: Annotation[];
  children: AstNode[];
  parameters?: Parameter[];
  returnType?: string;
  superClass?: string;
  interfaces?: string[];
}

export type AstNodeType =
  | 'class' | 'interface' | 'enum'
  | 'method' | 'constructor'
  | 'field' | 'function'
  | 'module' | 'namespace';

export interface Annotation {
  name: string;
  attributes: Record<string, string>;
}

export interface Parameter {
  name: string;
  type: string;
  annotations: Annotation[];
}
