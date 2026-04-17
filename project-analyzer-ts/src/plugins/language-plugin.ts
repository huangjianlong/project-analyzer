/**
 * LanguagePlugin — 语言插件接口
 *
 * 所有语言插件（TypeScript/JS、Python、Go、Generic）都必须实现此接口，
 * 提供统一的源码解析、依赖提取、接口识别和模块划分能力。
 */

import type { AstNode, Dependency, ApiEndpoint, ModuleInfo } from '../models/index.js';

export interface LanguagePlugin {
  /** 获取支持的语言标识（如 'typescript', 'python', 'go'） */
  getLanguageId(): string;

  /** 解析源码文件，返回 AST 节点列表 */
  parseFile(filePath: string): AstNode[];

  /** 从项目中提取依赖信息 */
  extractDependencies(projectRoot: string): Dependency[];

  /** 识别 API 接口定义 */
  identifyApis(filePath: string): ApiEndpoint[];

  /** 识别模块划分 */
  identifyModules(projectRoot: string): ModuleInfo[];
}
