/**
 * AnalysisModuleInterface — 分析模块统一接口
 *
 * 所有分析模块（ArchitectureAnalyzer、BusinessAnalyzer 等）都实现此接口。
 */

import type {
  ProjectProfile,
  ArchitectureResult,
  BusinessResult,
  FlowResult,
  ApiResult,
  StructureResult,
  OpsResult,
  PitfallResult,
  QuickstartResult,
  AiMemoryResult,
} from '../models/index.js';
import type { LanguagePlugin } from './language-plugin.js';

/** Union of all possible analysis module result types. */
export type ModuleResult =
  | ArchitectureResult
  | BusinessResult
  | FlowResult
  | ApiResult
  | StructureResult
  | OpsResult
  | PitfallResult
  | QuickstartResult
  | AiMemoryResult;

export interface AnalysisModuleInterface {
  /** 返回模块名称（如 'architecture', 'business'） */
  getName(): string;

  /** 执行分析并返回结果 */
  analyze(profile: ProjectProfile, plugins: LanguagePlugin[]): Promise<ModuleResult>;
}
