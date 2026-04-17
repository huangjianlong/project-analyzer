# Implementation Plan: Project Analyzer

## Overview

本实现计划将 Project Analyzer 双版本工具的设计拆分为可执行的编码任务。先完成 TypeScript 版本（project-analyzer-ts），再完成 Java 版本（project-analyzer-java）。每个任务构建在前一个任务的基础上，确保增量可验证。

## Tasks

### Part A: TypeScript 版本 (project-analyzer-ts)

- [x] 1. 初始化 TypeScript 项目骨架
  - [x] 1.1 创建 project-analyzer-ts 目录，初始化 npm 项目（package.json），配置 TypeScript 编译选项（tsconfig.json），添加 fast-check、vitest 等开发依赖
    - 配置 bin 入口为 `project-analyzer`
    - _Requirements: 8.2_
  - [x] 1.2 定义所有核心数据模型的 TypeScript 接口和类型（ProjectProfile、Dependency、AstNode、ApiEndpoint、ModuleInfo、FlowTrace、PitfallRecord、AnalysisReport、AiMemoryData 等）
    - 按设计文档中的数据模型章节逐一定义
    - _Requirements: 1.4, 7.6_
  - [x] 1.3 定义错误处理类型（AnalysisErrorCode、AnalysisError）和 ErrorCollector 接口及其默认实现
    - 实现降级策略中的可恢复/不可恢复错误分类
    - _Requirements: 1.5, 1.6_

- [x] 2. 实现 Language Plugin 接口和基础插件
  - [x] 2.1 定义 LanguagePlugin 接口（getLanguageId、parseFile、extractDependencies、identifyApis、identifyModules）
    - _Requirements: 7.1, 7.6_
  - [x] 2.2 实现 GenericPlugin（基于文件模式匹配的通用分析策略）
    - 当没有对应语言插件时使用此插件
    - _Requirements: 7.5_
  - [x] 2.3 实现 TypeScript/JavaScript Plugin（基于 tree-sitter-typescript 和 tree-sitter-javascript）
    - 支持 Express 路由识别（app.get/post/put/delete）
    - _Requirements: 5.5, 7.3_
  - [x] 2.4 实现 Python Plugin（基于 tree-sitter-python）
    - 支持 Flask/Django 路由识别（@app.route、urlpatterns）
    - _Requirements: 5.5, 7.3_
  - [x] 2.5 实现 Go Plugin（基于 tree-sitter-go）
    - 支持 Gin 路由识别（router.GET 等）
    - _Requirements: 5.5, 7.3_
  - [ ]* 2.6 为 LanguagePlugin 编写单元测试
    - 测试各插件的 parseFile、extractDependencies、identifyApis 方法
    - _Requirements: 7.3_

- [x] 3. 实现 Project Scanner
  - [x] 3.1 实现 ProjectScanner，递归遍历项目目录，生成文件清单，识别主要语言、构建工具和子模块
    - 支持 npm/yarn/pnpm、pip/poetry、go-mod 等构建工具识别
    - 根据文件扩展名统计确定主要语言
    - 生成完整的 ProjectProfile
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 3.2 实现路径校验和空项目检测逻辑
    - 路径不存在或非目录时返回 INVALID_PATH 错误
    - 无可识别源码时返回 EMPTY_PROJECT 错误
    - _Requirements: 1.5, 1.6_
  - [ ]* 3.3 编写属性测试：项目扫描完整性与 ProjectProfile 一致性
    - **Property 1: 项目扫描完整性与 ProjectProfile 一致性**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 4. Checkpoint - 确保基础设施测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 5. 实现 Architecture Analyzer 模块
  - [x] 5.1 实现 ArchitectureAnalyzer，解析依赖配置文件（package.json、requirements.txt、go.mod），提取依赖并按类别分组
    - 识别核心框架和技术（React、Express、Django、Flask、Gin 等）
    - 识别项目分层结构
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 5.2 实现多子模块依赖关系识别和模块依赖图生成
    - _Requirements: 2.5_
  - [ ]* 5.3 编写属性测试：依赖分类正确性
    - **Property 2: 依赖分类正确性**
    - **Validates: Requirements 2.2**

- [x] 6. 实现 Business Analyzer 模块
  - [x] 6.1 实现 BusinessAnalyzer，基于目录结构识别业务功能模块，提取关键类和文件列表，推断模块功能描述
    - 支持推断结果标注（isInferred）
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [x] 6.2 实现数据模型提取（Entity/Model/DTO 类的字段信息）
    - _Requirements: 3.4_
  - [ ]* 6.3 编写属性测试：数据模型提取一致性
    - **Property 3: 数据模型提取一致性**
    - **Validates: Requirements 3.4**

- [x] 7. 实现 Flow Analyzer 模块
  - [x] 7.1 实现 FlowAnalyzer，识别入口点（Controller 方法、main 函数、事件处理器），进行静态调用链分析（最大深度 5 层）
    - 标注外部依赖调用
    - _Requirements: 4.1, 4.2, 4.3, 4.5_
  - [ ]* 7.2 编写属性测试：调用链深度约束
    - **Property 4: 调用链深度约束**
    - **Validates: Requirements 4.2**

- [x] 8. 实现 API Analyzer 模块
  - [x] 8.1 实现 ApiAnalyzer，提取 HTTP API 接口定义，记录完整路径、HTTP 方法、参数和响应类型，按 Controller/模块分组
    - 支持 Express、Flask、Gin 等框架的路由识别
    - 支持 Swagger/OpenAPI 注解提取
    - 标注动态参数
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]* 8.2 编写属性测试：API 接口提取完整性
    - **Property 5: API 接口提取完整性**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.6**

- [x] 9. 实现 Structure Mapper 模块
  - [x] 9.1 实现 StructureMapper，生成目录树结构图（含文件数量统计和功能标注），实现深层目录折叠和自动生成目录标注
    - _Requirements: 9.1, 9.4, 9.5, 9.6_
  - [x] 9.2 实现模块关系图和子模块依赖关系图的 Mermaid 格式生成
    - _Requirements: 9.2, 9.3_
  - [ ]* 9.3 编写属性测试：目录树生成完整性与标注正确性
    - **Property 9: 目录树生成完整性与标注正确性**
    - **Validates: Requirements 9.1, 9.4**
  - [ ]* 9.4 编写属性测试：模块依赖图有效性
    - **Property 10: 模块依赖图有效性**
    - **Validates: Requirements 9.2, 9.3**
  - [ ]* 9.5 编写属性测试：目录折叠规则
    - **Property 11: 目录折叠规则**
    - **Validates: Requirements 9.5, 9.6**

- [x] 10. Checkpoint - 确保核心分析模块测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 11. 实现 Ops Doc Generator 模块
  - [x] 11.1 实现 OpsDocGenerator，识别启动方式（npm scripts、main 函数、Makefile 等），解析容器化配置（Dockerfile、docker-compose.yml），解析 CI/CD 配置文件
    - 支持推断启动方式并标注
    - _Requirements: 10.1, 10.2, 10.3, 10.7_
  - [x] 11.2 实现配置项提取（application.yml、.env、config.json 等）和外部依赖服务识别
    - _Requirements: 10.4, 10.5_
  - [x] 11.3 实现多环境配置对照表生成
    - _Requirements: 10.6_
  - [ ]* 11.4 编写属性测试：Ops 信息提取完整性
    - **Property 16: Ops 信息提取完整性**
    - **Validates: Requirements 10.1, 10.2, 10.3**
  - [ ]* 11.5 编写属性测试：配置项提取完整性
    - **Property 17: 配置项提取完整性**
    - **Validates: Requirements 10.4**
  - [ ]* 11.6 编写属性测试：环境配置对照表正确性
    - **Property 18: 环境配置对照表正确性**
    - **Validates: Requirements 10.6**

- [x] 12. 实现 Pitfall Detector 模块
  - [x] 12.1 实现 PitfallDetector，检测反模式（过长方法、过深嵌套、God Class 等），识别漏洞/废弃依赖，识别 TODO/FIXME/HACK/XXX 标记注释，检测硬编码配置值
    - 支持可配置的阈值（OpsConfig）
    - 识别编码风格不一致
    - 标注缺少测试的核心模块
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  - [ ]* 12.2 编写属性测试：代码模式检测完整性
    - **Property 12: 代码模式检测完整性**
    - **Validates: Requirements 11.3, 11.5, 11.6**
  - [ ]* 12.3 编写属性测试：反模式检测阈值正确性
    - **Property 19: 反模式检测阈值正确性**
    - **Validates: Requirements 11.1**
  - [ ]* 12.4 编写属性测试：漏洞依赖检测正确性
    - **Property 20: 漏洞依赖检测正确性**
    - **Validates: Requirements 11.2**

- [x] 13. 实现 Quickstart Guide Generator 模块
  - [x] 13.1 实现 QuickstartGuideGenerator，生成接手速查手册（5 分钟速览、开发环境搭建、核心业务速览、注意事项、接口速查表）
    - 注意事项仅包含严重程度为"高"的坑点
    - 模块未产生有效结果时标注"信息不足，建议手动补充"
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [ ]* 13.2 编写属性测试：接手速查手册结构与过滤正确性
    - **Property 13: 接手速查手册结构与过滤正确性**
    - **Validates: Requirements 12.1, 12.2, 12.4, 12.5, 12.6**

- [x] 14. 实现 AI Memory Generator 模块
  - [x] 14.1 实现 AiMemoryGenerator，生成 JSON 格式知识库文件（含项目元数据、模块信息、接口定义、术语表、代码导航索引）和 Markdown 格式 AI 上下文摘要
    - 包含版本标识和生成时间戳
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  - [x] 14.2 实现版本差异对比功能（compareVersions），标注新增、修改和删除的内容
    - _Requirements: 13.8_
  - [ ]* 14.3 编写属性测试：AI 记忆数据序列化 round-trip
    - **Property 14: AI 记忆数据序列化 round-trip**
    - **Validates: Requirements 13.1, 13.6**
  - [ ]* 14.4 编写属性测试：AI 记忆版本差异对比
    - **Property 15: AI 记忆版本差异对比**
    - **Validates: Requirements 13.8**

- [x] 15. Checkpoint - 确保所有分析模块测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 16. 实现 Report Generator
  - [x] 16.1 实现 ReportGenerator，按设计文档中的报告模板规范生成所有 Markdown 报告文件（01-project-overview.md 至 09-quickstart.md、ai-memory.json、ai-context.md）
    - 每份报告包含通用头部（项目名称、生成时间、分析工具版本）
    - 模块未产生有效结果时在报告中说明原因
    - _Requirements: 6.1, 6.2, 6.6_
  - [x] 16.2 实现汇总索引文档（README.md）生成，包含所有报告的相对链接和简要说明
    - _Requirements: 6.4_
  - [x] 16.3 实现输出目录管理（自动创建不存在的目录，默认输出到 analysis-reports/）
    - _Requirements: 6.3, 6.5_
  - [ ]* 16.4 编写属性测试：报告生成完整性
    - **Property 6: 报告生成完整性**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 16.5 编写属性测试：索引文档完整性
    - **Property 7: 索引文档完整性**
    - **Validates: Requirements 6.4**

- [x] 17. 实现 Analyzer 协调器和 CLI 命令行接口
  - [x] 17.1 实现 Analyzer 协调器，按顺序调用 Scanner → 分析模块 → ReportGenerator，集成 ErrorCollector 实现降级策略
    - 支持通过 --modules 参数选择性执行分析模块
    - 默认执行所有模块
    - _Requirements: 7.4, 8.6_
  - [x] 17.2 实现 CLI 命令行解析器，支持 `project-analyzer <path>` 命令和所有参数（--output、--modules、--lang、--help、--version）
    - 参数错误时显示帮助信息，退出码 2
    - 分析过程中输出进度信息，完成后输出摘要和报告路径
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.7_
  - [ ]* 17.3 编写属性测试：命令行参数解析正确性
    - **Property 8: 命令行参数解析正确性**
    - **Validates: Requirements 8.3**

- [x] 18. Checkpoint - TypeScript 版本完整性验证
  - 确保所有测试通过，如有问题请向用户确认。

### Part B: Java 版本 (project-analyzer-java)

- [x] 19. 初始化 Java 项目骨架
  - [x] 19.1 创建 project-analyzer-java 目录，初始化 Maven 项目（pom.xml），配置 Java 17+、JavaParser 3.26+、jqwik 等依赖
    - 配置 maven-shade-plugin 打包可执行 JAR
    - 入口命令为 `project-analyzer-java`
    - _Requirements: 8.1_
  - [x] 19.2 定义所有核心数据模型的 Java 类（ProjectProfile、Dependency、AstNode、ApiEndpoint、ModuleInfo、FlowTrace、PitfallRecord、AnalysisReport、AiMemoryData 等）
    - 与 TypeScript 版本的数据模型一一对应
    - _Requirements: 1.4, 14.1_
  - [x] 19.3 定义错误处理类型（AnalysisErrorCode 枚举、AnalysisException 类）和 ErrorCollector 接口及其默认实现
    - _Requirements: 1.5, 1.6_

- [x] 20. 实现 Java Language Plugin
  - [x] 20.1 定义 LanguagePlugin 接口（Java 版本）
    - _Requirements: 7.1, 7.6_
  - [x] 20.2 实现 JavaPlugin（基于 JavaParser），支持 Java 源码 AST 解析、依赖提取（pom.xml/build.gradle）、Spring MVC/JAX-RS 注解识别、模块划分
    - _Requirements: 5.1, 7.2_
  - [x] 20.3 实现 GenericPlugin（Java 版本，基于文件模式匹配的通用分析策略）
    - _Requirements: 7.5_
  - [ ]* 20.4 为 JavaPlugin 编写单元测试
    - 测试 parseFile、extractDependencies、identifyApis 方法
    - _Requirements: 7.2_

- [x] 21. 实现 Java 版 Project Scanner
  - [x] 21.1 实现 ProjectScanner（Java 版本），递归遍历项目目录，生成 ProjectProfile
    - 支持 Maven/Gradle 构建工具识别
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 21.2 实现路径校验和空项目检测逻辑
    - _Requirements: 1.5, 1.6_
  - [ ]* 21.3 编写属性测试：项目扫描完整性（Java 版 jqwik）
    - **Property 1: 项目扫描完整性与 ProjectProfile 一致性**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 22. Checkpoint - Java 版基础设施测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 23. 实现 Java 版各分析模块
  - [x] 23.1 实现 ArchitectureAnalyzer（Java 版），解析 pom.xml/build.gradle 依赖，按类别分组，识别分层结构和核心框架（Spring Boot、MyBatis 等）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 23.2 实现 BusinessAnalyzer（Java 版），基于包结构识别业务模块，提取 Entity/Model/DTO 数据模型
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 23.3 实现 FlowAnalyzer（Java 版），识别入口点，进行静态调用链分析（最大深度 5 层），解析 Spring 依赖注入追踪接口到实现类
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 23.4 实现 ApiAnalyzer（Java 版），提取 Spring MVC 和 JAX-RS 注解定义的 HTTP API 接口，支持 Swagger/OpenAPI 注解
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_
  - [x] 23.5 实现 StructureMapper（Java 版），生成目录树和 Mermaid 格式模块关系图
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 23.6 实现 OpsDocGenerator（Java 版），识别启动方式、解析容器化和 CI/CD 配置、提取配置项、生成环境对照表
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
  - [x] 23.7 实现 PitfallDetector（Java 版），检测反模式、漏洞依赖、标记注释、硬编码配置
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  - [x] 23.8 实现 QuickstartGuideGenerator（Java 版），生成接手速查手册
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x] 23.9 实现 AiMemoryGenerator（Java 版），生成 JSON 知识库和 Markdown 上下文摘要，支持版本差异对比
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
  - [ ]* 23.10 为各分析模块编写属性测试（Java 版 jqwik）
    - **Property 2: 依赖分类正确性** — Validates: Requirements 2.2
    - **Property 3: 数据模型提取一致性** — Validates: Requirements 3.4
    - **Property 4: 调用链深度约束** — Validates: Requirements 4.2
    - **Property 5: API 接口提取完整性** — Validates: Requirements 5.1, 5.2, 5.3, 5.6
    - **Property 9: 目录树生成完整性与标注正确性** — Validates: Requirements 9.1, 9.4
    - **Property 10: 模块依赖图有效性** — Validates: Requirements 9.2, 9.3
    - **Property 11: 目录折叠规则** — Validates: Requirements 9.5, 9.6
    - **Property 12: 代码模式检测完整性** — Validates: Requirements 11.3, 11.5, 11.6
    - **Property 13: 接手速查手册结构与过滤正确性** — Validates: Requirements 12.1, 12.2, 12.4, 12.5, 12.6
    - **Property 14: AI 记忆数据序列化 round-trip** — Validates: Requirements 13.1, 13.6
    - **Property 15: AI 记忆版本差异对比** — Validates: Requirements 13.8
    - **Property 16: Ops 信息提取完整性** — Validates: Requirements 10.1, 10.2, 10.3
    - **Property 17: 配置项提取完整性** — Validates: Requirements 10.4
    - **Property 18: 环境配置对照表正确性** — Validates: Requirements 10.6
    - **Property 19: 反模式检测阈值正确性** — Validates: Requirements 11.1
    - **Property 20: 漏洞依赖检测正确性** — Validates: Requirements 11.2

- [x] 24. Checkpoint - Java 版分析模块测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 25. 实现 Java 版 Report Generator 和 CLI
  - [x] 25.1 实现 ReportGenerator（Java 版），按报告模板规范生成所有 Markdown 报告和索引文档
    - 报告格式与 TypeScript 版本完全一致
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 14.1_
  - [x] 25.2 实现 Analyzer 协调器（Java 版），集成 ErrorCollector 和降级策略
    - _Requirements: 7.4, 8.6_
  - [x] 25.3 实现 CLI 命令行解析器（Java 版），支持 `project-analyzer-java <path>` 和所有参数，退出码规范与 TypeScript 版本一致
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.7, 14.3, 14.4_
  - [ ]* 25.4 编写属性测试：报告生成完整性和索引文档完整性（Java 版 jqwik）
    - **Property 6: 报告生成完整性** — Validates: Requirements 6.1, 6.2
    - **Property 7: 索引文档完整性** — Validates: Requirements 6.4
    - **Property 8: 命令行参数解析正确性** — Validates: Requirements 8.3

### Part C: 双版本一致性验证

- [x] 26. 双版本输出格式一致性验证
  - [x] 26.1 编写集成测试，使用相同的测试项目分别运行 Java 版本和 TypeScript 版本，对比报告章节结构、AI 记忆 JSON Schema、控制台输出格式是否一致
    - _Requirements: 14.1, 14.2, 14.5_
  - [ ]* 26.2 编写属性测试：双版本输出格式一致性
    - **Property 21: 双版本输出格式一致性**
    - **Validates: Requirements 14.1, 14.2, 14.5**

- [x] 27. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的子任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保可追溯性
- Checkpoint 任务用于增量验证，确保每个阶段的代码质量
- TypeScript 版本使用 fast-check 进行属性测试，Java 版本使用 jqwik
- 属性测试验证设计文档中定义的 21 个正确性属性
- 单元测试验证具体示例、边界条件和错误处理
