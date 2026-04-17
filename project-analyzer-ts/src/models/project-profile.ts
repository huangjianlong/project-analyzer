/**
 * ProjectProfile — 项目概况数据模型
 */

export interface ProjectProfile {
  projectName: string;
  projectPath: string;
  primaryLanguage: string;
  languages: LanguageStat[];
  buildTool: BuildToolType;
  modules: SubModule[];
  fileStats: FileStats;
}

export interface LanguageStat {
  language: string;
  fileCount: number;
  lineCount: number;
  percentage: number;
}

export type BuildToolType =
  | 'maven' | 'gradle'
  | 'npm' | 'yarn' | 'pnpm'
  | 'pip' | 'poetry'
  | 'go-mod'
  | 'unknown';

export interface SubModule {
  name: string;
  path: string;
  language: string;
  buildTool: BuildToolType;
}

export interface FileStats {
  totalFiles: number;
  sourceFiles: number;
  testFiles: number;
  configFiles: number;
  totalLines: number;
}
