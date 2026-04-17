/**
 * ModuleInfo — 模块信息数据模型
 */

export interface ModuleInfo {
  name: string;
  path: string;
  description: string;
  isInferred: boolean;
  keyClasses: string[];
  keyFiles: string[];
  dependencies: string[];
}
