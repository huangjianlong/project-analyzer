/**
 * Barrel export — 所有核心数据模型
 */

// ProjectProfile
export type {
  ProjectProfile,
  LanguageStat,
  BuildToolType,
  SubModule,
  FileStats,
} from './project-profile.js';

// Dependency
export type {
  Dependency,
  DependencyCategory,
  DependencyScope,
} from './dependency.js';

// AstNode
export type {
  AstNode,
  AstNodeType,
  Annotation,
  Parameter,
} from './ast-node.js';

// ApiEndpoint
export type {
  ApiEndpoint,
  HttpMethod,
  ApiParameter,
} from './api-endpoint.js';

// ModuleInfo
export type { ModuleInfo } from './module-info.js';

// FlowTrace
export type {
  FlowTrace,
  EntryPoint,
  CallStep,
} from './flow-trace.js';

// PitfallRecord
export type {
  PitfallRecord,
  PitfallCategory,
} from './pitfall-record.js';

// AnalysisReport and all sub-types
export type {
  AnalysisReport,
  ReportMetadata,
  ArchitectureResult,
  LayerInfo,
  FrameworkInfo,
  MermaidGraph,
  BusinessResult,
  DataModelInfo,
  DataFieldInfo,
  FlowResult,
  ApiResult,
  ApiGroup,
  StructureResult,
  DirectoryNode,
  OpsResult,
  StartupInfo,
  ContainerConfig,
  CiCdPipeline,
  CiCdStage,
  ConfigItem,
  ExternalService,
  EnvComparisonTable,
  EnvComparisonItem,
  PitfallResult,
  QuickstartResult,
  BusinessOverviewEntry,
  ApiQuickRefEntry,
  AiMemoryResult,
} from './analysis-report.js';

// AiMemoryData
export type {
  AiMemoryData,
  AiModuleInfo,
  AiApiInfo,
  GlossaryEntry,
  CodeNavEntry,
} from './ai-memory.js';

// OpsConfig
export type { OpsConfig } from './ops-config.js';
