/**
 * AiMemoryData — AI 记忆数据模型
 */

import type { HttpMethod } from './api-endpoint.js';

export interface AiMemoryData {
  version: string;
  generatedAt: string;
  projectMeta: {
    name: string;
    language: string;
    framework: string;
    buildTool: string;
  };
  modules: AiModuleInfo[];
  apis: AiApiInfo[];
  glossary: GlossaryEntry[];
  codeNavigation: CodeNavEntry[];
}

export interface AiModuleInfo {
  name: string;
  purpose: string;
  coreClasses: {
    name: string;
    publicMethods: string[];
    dependencies: string[];
  }[];
}

export interface AiApiInfo {
  path: string;
  method: HttpMethod;
  description: string;
  parameters: {
    name: string;
    type: string;
    in: 'path' | 'query' | 'body' | 'header';
  }[];
  responseModel?: string;
  businessContext: string;
  relatedModule: string;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  relatedCode: string[];
}

export interface CodeNavEntry {
  feature: string;
  files: string[];
  methods: string[];
}
