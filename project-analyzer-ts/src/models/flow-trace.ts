/**
 * FlowTrace — 流程追踪数据模型
 */

export interface FlowTrace {
  entryPoint: EntryPoint;
  callChain: CallStep[];
  maxDepth: number;
  description: string;
}

export interface EntryPoint {
  type: 'controller' | 'main' | 'event-handler' | 'scheduled' | 'other';
  className: string;
  methodName: string;
  filePath: string;
  httpPath?: string;
}

export interface CallStep {
  depth: number;
  className: string;
  methodName: string;
  filePath: string;
  line: number;
  isExternal: boolean;
  description?: string;
}
