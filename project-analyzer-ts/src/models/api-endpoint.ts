/**
 * ApiEndpoint — API 接口数据模型
 */

export interface ApiEndpoint {
  path: string;
  method: HttpMethod;
  handlerClass: string;
  handlerMethod: string;
  parameters: ApiParameter[];
  responseType?: string;
  description?: string;
  tags: string[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ApiParameter {
  name: string;
  type: string;
  in: 'path' | 'query' | 'body' | 'header';
  required: boolean;
  description?: string;
}
