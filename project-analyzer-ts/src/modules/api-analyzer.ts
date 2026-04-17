/**
 * ApiAnalyzer — 接口路径分析模块
 *
 * 从语言插件收集 HTTP API 接口定义，去重、分组，
 * 提取 Swagger/OpenAPI 描述信息。
 */

import type { AnalysisModuleInterface, ModuleResult } from '../plugins/analysis-module.js';
import type { LanguagePlugin } from '../plugins/language-plugin.js';
import type {
  ProjectProfile,
  ApiResult,
  ApiGroup,
  ApiEndpoint,
  AstNode,
} from '../models/index.js';

/** Swagger/OpenAPI annotation names (case-insensitive lookup). */
const SWAGGER_ANNOTATIONS = new Set([
  'api', 'apioperation', 'apiresponse', 'apiresponses',
  'operation', 'schema', 'tag', 'tags',
  'swagger', 'openapi',
]);

export class ApiAnalyzer implements AnalysisModuleInterface {
  getName(): string {
    return 'api';
  }

  async analyze(profile: ProjectProfile, plugins: LanguagePlugin[]): Promise<ModuleResult> {
    // 1. Collect endpoints from all plugins for every source file
    const rawEndpoints = this.collectEndpoints(profile, plugins);

    // 2. Enrich endpoints with Swagger/OpenAPI descriptions from AST
    this.enrichWithSwaggerDescriptions(rawEndpoints, profile, plugins);

    // 3. Deduplicate by path + method
    const endpoints = this.deduplicateEndpoints(rawEndpoints);

    // 4. Group by handler class (Controller / module name)
    const groups = this.groupEndpoints(endpoints);

    const result: ApiResult = {
      endpoints,
      groups,
      totalCount: endpoints.length,
    };

    return result;
  }

  /**
   * Collect API endpoints from all plugins by calling identifyApis on each source file.
   */
  private collectEndpoints(profile: ProjectProfile, plugins: LanguagePlugin[]): ApiEndpoint[] {
    const allEndpoints: ApiEndpoint[] = [];
    const processedFiles = new Set<string>();

    for (const plugin of plugins) {
      const modules = plugin.identifyModules(profile.projectPath);
      for (const mod of modules) {
        for (const filePath of mod.keyFiles) {
          if (processedFiles.has(filePath)) continue;
          processedFiles.add(filePath);

          const endpoints = plugin.identifyApis(filePath);
          allEndpoints.push(...endpoints);
        }
      }
    }

    return allEndpoints;
  }

  /**
   * Enrich endpoints with Swagger/OpenAPI description from AST annotations.
   * Looks for @ApiOperation, @Operation, etc. on methods matching the handler.
   */
  private enrichWithSwaggerDescriptions(
    endpoints: ApiEndpoint[],
    profile: ProjectProfile,
    plugins: LanguagePlugin[],
  ): void {
    // Build a map of handlerClass.handlerMethod → endpoint for quick lookup
    const endpointMap = new Map<string, ApiEndpoint[]>();
    for (const ep of endpoints) {
      const key = `${ep.handlerClass}.${ep.handlerMethod}`.toLowerCase();
      const list = endpointMap.get(key) ?? [];
      list.push(ep);
      endpointMap.set(key, list);
    }

    if (endpointMap.size === 0) return;

    const parsedFiles = new Set<string>();

    for (const plugin of plugins) {
      const modules = plugin.identifyModules(profile.projectPath);
      for (const mod of modules) {
        for (const filePath of mod.keyFiles) {
          if (parsedFiles.has(filePath)) continue;
          parsedFiles.add(filePath);

          const nodes = plugin.parseFile(filePath);
          for (const node of nodes) {
            this.extractSwaggerFromNode(node, '', endpointMap);
          }
        }
      }
    }
  }

  /**
   * Recursively walk AST nodes looking for Swagger/OpenAPI annotations.
   */
  private extractSwaggerFromNode(
    node: AstNode,
    parentClassName: string,
    endpointMap: Map<string, ApiEndpoint[]>,
  ): void {
    const currentClass = (node.type === 'class' || node.type === 'interface')
      ? node.name
      : parentClassName;

    if (node.type === 'method' || node.type === 'function') {
      const key = `${currentClass}.${node.name}`.toLowerCase();
      const matchingEndpoints = endpointMap.get(key);

      if (matchingEndpoints) {
        for (const ann of node.annotations) {
          if (SWAGGER_ANNOTATIONS.has(ann.name.toLowerCase())) {
            const description = ann.attributes['value']
              ?? ann.attributes['summary']
              ?? ann.attributes['description'];
            if (description) {
              for (const ep of matchingEndpoints) {
                if (!ep.description) {
                  ep.description = description;
                }
              }
            }

            // Extract tags
            const tagValue = ann.attributes['tags'] ?? ann.attributes['tag'];
            if (tagValue) {
              const tags = tagValue.split(',').map((t) => t.trim()).filter(Boolean);
              for (const ep of matchingEndpoints) {
                for (const tag of tags) {
                  if (!ep.tags.includes(tag)) {
                    ep.tags.push(tag);
                  }
                }
              }
            }
          }
        }
      }
    }

    for (const child of node.children) {
      this.extractSwaggerFromNode(child, currentClass, endpointMap);
    }
  }

  /**
   * Deduplicate endpoints by path + method combination.
   * Keeps the first occurrence (which has the most complete info).
   */
  private deduplicateEndpoints(endpoints: ApiEndpoint[]): ApiEndpoint[] {
    const seen = new Map<string, ApiEndpoint>();

    for (const ep of endpoints) {
      const key = `${ep.method}:${ep.path}`;
      if (!seen.has(key)) {
        seen.set(key, ep);
      } else {
        // Merge description/tags from duplicate if the first one is missing them
        const existing = seen.get(key)!;
        if (!existing.description && ep.description) {
          existing.description = ep.description;
        }
        for (const tag of ep.tags) {
          if (!existing.tags.includes(tag)) {
            existing.tags.push(tag);
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Group endpoints by handlerClass (Controller / module name).
   */
  private groupEndpoints(endpoints: ApiEndpoint[]): ApiGroup[] {
    const groupMap = new Map<string, ApiEndpoint[]>();

    for (const ep of endpoints) {
      const groupName = ep.handlerClass || 'default';
      const list = groupMap.get(groupName) ?? [];
      list.push(ep);
      groupMap.set(groupName, list);
    }

    const groups: ApiGroup[] = [];
    for (const [name, eps] of groupMap) {
      const basePath = this.inferBasePath(eps);
      groups.push({
        name,
        basePath,
        endpoints: eps,
      });
    }

    return groups;
  }

  /**
   * Infer a common base path from a group of endpoints.
   */
  private inferBasePath(endpoints: ApiEndpoint[]): string | undefined {
    if (endpoints.length === 0) return undefined;

    const paths = endpoints.map((ep) => ep.path);
    if (paths.length === 1) {
      // For a single endpoint, use the path up to the last segment
      const parts = paths[0].split('/').filter(Boolean);
      if (parts.length > 1) {
        return '/' + parts.slice(0, -1).join('/');
      }
      return paths[0];
    }

    // Find common prefix among all paths
    const segments = paths.map((p) => p.split('/').filter(Boolean));
    const minLen = Math.min(...segments.map((s) => s.length));
    const commonParts: string[] = [];

    for (let i = 0; i < minLen; i++) {
      const seg = segments[0][i];
      if (segments.every((s) => s[i] === seg)) {
        commonParts.push(seg);
      } else {
        break;
      }
    }

    return commonParts.length > 0 ? '/' + commonParts.join('/') : undefined;
  }
}
