# Requirements Document

## Introduction

项目分析工具（Project Analyzer）是一套面向开发者的命令行工具，用于快速分析新接手项目的整体情况。该工具能够自动扫描项目源码，从技术架构、业务功能、主要流程、接口路径等多个维度进行深度分析，并将分析结果生成结构化的 Markdown 格式文档。

工具分为两个版本：

- **Java 版本（project-analyzer-java）**：专门用于分析 Java 项目，基于 Java 开发，利用 Java 原生 AST 解析能力（如 JavaParser）实现最精准的 Java 项目深度分析。
- **TypeScript/Node.js 版本（project-analyzer-ts）**：用于分析 Python、JavaScript/TypeScript、Go 等其他语言项目，基于 Node.js 开发，利用 tree-sitter 等跨语言解析库提供多语言分析能力。

两个版本共享相同的分析维度、报告输出格式和命令行参数规范，确保用户在不同版本间获得一致的使用体验。

## Glossary

- **Analyzer**: 项目分析工具的核心引擎，负责协调各分析模块执行扫描和分析任务
- **Project_Scanner**: 项目扫描器，负责遍历项目目录结构并识别项目类型和语言
- **Architecture_Analyzer**: 技术架构分析模块，负责识别项目的技术栈、框架、依赖和分层结构
- **Business_Analyzer**: 业务功能分析模块，负责识别项目的业务模块和功能划分
- **Flow_Analyzer**: 流程分析模块，负责识别项目的主要业务流程和调用链路
- **API_Analyzer**: 接口分析模块，负责识别和提取项目中定义的 API 接口路径
- **Report_Generator**: 报告生成器，负责将分析结果格式化为 Markdown 文档输出
- **Language_Plugin**: 语言插件，为特定编程语言提供解析和分析能力的可扩展模块
- **Project_Profile**: 项目概况数据模型，包含项目的基本信息、语言、框架等元数据
- **Analysis_Report**: 分析报告数据模型，包含所有维度的分析结果
- **Structure_Mapper**: 项目结构地图生成模块，负责生成可视化的项目目录结构和模块关系图
- **Ops_Doc_Generator**: 启动/部署/配置说明书生成模块，负责自动识别并生成项目的启动方式、部署流程和配置项说明
- **Pitfall_Detector**: 坑点检测模块，负责自动识别项目中的潜在问题、反模式和技术债务
- **Quickstart_Guide_Generator**: 接手速查手册生成模块，负责生成综合性的快速参考手册
- **AI_Memory_Generator**: AI 项目记忆生成模块，负责生成结构化的、可供 AI 检索的项目知识库文档
- **Java_Analyzer**: Java 版本分析工具（project-analyzer-java），基于 Java 开发，专门用于 Java 项目的深度分析，利用 JavaParser 等原生 AST 解析库实现精准的代码解析
- **TS_Analyzer**: TypeScript 版本分析工具（project-analyzer-ts），基于 Node.js 开发，用于 Python、JavaScript/TypeScript、Go 等非 Java 语言项目的分析，利用 tree-sitter 等跨语言解析库

## Requirements

### Requirement 1: 项目扫描与识别

**User Story:** 作为一名开发者，我想要工具能自动扫描项目目录并识别项目类型，以便快速了解项目的基本信息。

#### Acceptance Criteria

1. WHEN 用户指定一个项目根目录路径, THE Project_Scanner SHALL 递归遍历目录结构并生成项目文件清单
2. WHEN 扫描完成, THE Project_Scanner SHALL 识别项目的主要编程语言（基于文件扩展名统计和构建配置文件）
3. WHEN 扫描完成, THE Project_Scanner SHALL 识别项目的构建工具类型（如 Maven、Gradle、npm、pip、go mod 等）
4. WHEN 扫描完成, THE Project_Scanner SHALL 生成 Project_Profile，包含项目名称、主要语言、构建工具、模块列表和文件统计信息
5. IF 指定的路径不存在或不是有效目录, THEN THE Project_Scanner SHALL 返回明确的错误信息，说明路径无效
6. IF 项目目录为空或不包含可识别的源代码文件, THEN THE Project_Scanner SHALL 返回提示信息，说明未检测到可分析的源代码

### Requirement 2: 技术架构分析

**User Story:** 作为一名开发者，我想要了解项目的技术架构，以便快速掌握项目的技术栈和分层结构。

#### Acceptance Criteria

1. WHEN Project_Profile 生成完成, THE Architecture_Analyzer SHALL 解析项目的依赖配置文件（如 pom.xml、build.gradle、package.json、requirements.txt、go.mod）并提取所有第三方依赖及其版本信息
2. WHEN 依赖解析完成, THE Architecture_Analyzer SHALL 将依赖按类别分组（如 Web 框架、数据库、缓存、消息队列、安全、测试、工具类等）
3. WHEN 源码扫描完成, THE Architecture_Analyzer SHALL 识别项目的分层结构（如 Controller/Service/Repository、MVC、微服务模块等）
4. WHEN 源码扫描完成, THE Architecture_Analyzer SHALL 识别项目使用的核心框架和技术（如 Spring Boot、MyBatis、React、Django 等）
5. WHEN 项目包含多个子模块, THE Architecture_Analyzer SHALL 识别模块间的依赖关系并生成模块依赖图描述

### Requirement 3: 业务功能分析

**User Story:** 作为一名开发者，我想要了解项目的业务功能模块划分，以便快速理解项目的业务范围。

#### Acceptance Criteria

1. WHEN 源码扫描完成, THE Business_Analyzer SHALL 基于包结构（Java）或目录结构（其他语言）识别业务功能模块
2. WHEN 业务模块识别完成, THE Business_Analyzer SHALL 为每个业务模块提取关键类和文件列表
3. WHEN 业务模块识别完成, THE Business_Analyzer SHALL 基于类名、方法名和注释信息推断每个模块的功能描述
4. WHEN 项目包含数据模型定义（如 Entity、Model、DTO 类）, THE Business_Analyzer SHALL 提取数据模型列表及其字段信息
5. IF 项目缺少清晰的模块划分, THEN THE Business_Analyzer SHALL 基于文件聚类和命名模式尝试推断功能分组，并在报告中标注为"推断结果"

### Requirement 4: 主要流程分析

**User Story:** 作为一名开发者，我想要了解项目的主要业务流程和调用链路，以便快速理解核心业务逻辑。

#### Acceptance Criteria

1. WHEN 源码扫描完成, THE Flow_Analyzer SHALL 识别项目的入口点（如 Controller 方法、main 函数、事件处理器等）
2. WHEN 入口点识别完成, THE Flow_Analyzer SHALL 对每个入口点进行静态调用链分析，追踪方法调用层级（最大深度为 5 层）
3. WHEN 调用链分析完成, THE Flow_Analyzer SHALL 生成主要流程的文本描述，包含调用顺序和关键方法说明
4. WHEN 项目使用 Spring 等依赖注入框架, THE Flow_Analyzer SHALL 解析依赖注入配置以正确追踪接口到实现类的调用关系
5. IF 调用链中存在无法解析的外部依赖调用, THEN THE Flow_Analyzer SHALL 在流程描述中标注该调用为"外部依赖"并继续分析

### Requirement 5: 接口路径分析

**User Story:** 作为一名开发者，我想要获取项目中所有 API 接口的完整列表，以便快速了解项目对外提供的服务能力。

#### Acceptance Criteria

1. WHEN 源码扫描完成, THE API_Analyzer SHALL 识别并提取所有 HTTP API 接口定义（支持 Spring MVC 注解如 @RequestMapping、@GetMapping 等，以及 JAX-RS 注解如 @Path、@GET 等）
2. WHEN 接口提取完成, THE API_Analyzer SHALL 为每个接口记录完整路径、HTTP 方法、请求参数和响应类型
3. WHEN 接口提取完成, THE API_Analyzer SHALL 按业务模块或 Controller 对接口进行分组
4. WHEN 项目包含 API 文档配置（如 Swagger/OpenAPI 注解）, THE API_Analyzer SHALL 提取接口的描述信息和文档注释
5. WHEN 项目为非 Java 语言, THE API_Analyzer SHALL 支持识别对应框架的路由定义（如 Express 的 app.get、Flask 的 @app.route、Gin 的 router.GET 等）
6. IF 接口路径包含动态参数（如路径变量、查询参数）, THEN THE API_Analyzer SHALL 在接口记录中明确标注参数名称和类型

### Requirement 6: 分析报告生成

**User Story:** 作为一名开发者，我想要将分析结果生成结构化的 Markdown 文档，以便保存和分享项目分析报告。

#### Acceptance Criteria

1. WHEN 所有分析模块执行完成, THE Report_Generator SHALL 生成以下独立的 Markdown 文档：技术架构报告、业务功能报告、主要流程报告、接口路径报告、项目概览报告、项目结构地图、启动/部署/配置说明书、坑点笔记、接手速查手册和 AI 项目记忆文件
2. THE Report_Generator SHALL 在每份报告中包含生成时间、项目名称和分析工具版本信息
3. WHEN 报告生成完成, THE Report_Generator SHALL 将所有报告文件输出到用户指定的目录（默认为项目根目录下的 `analysis-reports/` 目录）
4. THE Report_Generator SHALL 生成一份汇总索引文档（README.md），包含所有报告的链接和简要说明
5. IF 用户指定的输出目录不存在, THEN THE Report_Generator SHALL 自动创建该目录
6. IF 某个分析模块未产生有效结果, THEN THE Report_Generator SHALL 在对应报告中说明原因，而非生成空报告

### Requirement 7: 多语言兼容支持

**User Story:** 作为一名开发者，我想要工具能兼容多种编程语言的项目，以便分析不同技术栈的项目。

#### Acceptance Criteria

1. THE Analyzer SHALL 通过 Language_Plugin 机制支持可扩展的多语言分析能力
2. THE Java_Analyzer SHALL 内置 Java 语言的 Language_Plugin，利用 JavaParser 等原生 AST 解析库实现精准的 Java 代码解析
3. THE TS_Analyzer SHALL 内置 Python、JavaScript/TypeScript、Go 语言的 Language_Plugin，利用 tree-sitter 等跨语言解析库实现多语言代码解析
4. WHEN 项目包含多种编程语言的源码, THE Analyzer SHALL 为每种检测到的语言加载对应的 Language_Plugin 进行分析
5. WHEN 项目使用的语言没有对应的 Language_Plugin, THE Analyzer SHALL 使用通用分析策略（基于目录结构和文件命名模式）进行基础分析
6. THE Language_Plugin SHALL 提供统一的分析接口，包含：源码解析、依赖提取、接口识别和模块划分四个标准方法
7. THE Java_Analyzer 和 TS_Analyzer SHALL 共享相同的分析维度和报告输出格式，确保不同版本的分析结果具有一致的结构
8. IF 用户需要支持新的编程语言, THEN THE Analyzer SHALL 允许通过实现 Language_Plugin 接口来扩展语言支持

### Requirement 8: 命令行交互

**User Story:** 作为一名开发者，我想要通过命令行方便地使用分析工具，以便集成到日常工作流程中。

#### Acceptance Criteria

1. THE Java_Analyzer SHALL 提供命令行接口，支持通过 `project-analyzer-java <project-path>` 命令启动 Java 项目分析
2. THE TS_Analyzer SHALL 提供命令行接口，支持通过 `project-analyzer <project-path>` 命令启动非 Java 语言项目分析
3. THE Java_Analyzer 和 TS_Analyzer SHALL 支持相同的命令行参数：`--output`（指定输出目录）、`--modules`（指定分析模块，如 architecture、business、flow、api、structure、ops、pitfall、quickstart、ai-memory）、`--lang`（指定项目语言，覆盖自动检测）
4. WHILE 分析任务执行中, THE Analyzer SHALL 在控制台输出当前分析进度和阶段信息
5. WHEN 分析完成, THE Analyzer SHALL 在控制台输出分析摘要和报告文件路径
6. IF 用户未指定任何分析模块, THEN THE Analyzer SHALL 默认执行所有分析模块
7. IF 命令行参数格式错误, THEN THE Analyzer SHALL 显示帮助信息，说明正确的使用方式

### Requirement 9: 项目结构地图

**User Story:** 作为一名开发者，我想要获取可视化的项目目录结构和模块关系图，以便直观地理解项目的整体组织方式和模块间的依赖关系。

#### Acceptance Criteria

1. WHEN 项目扫描完成, THE Structure_Mapper SHALL 生成项目的目录树结构图，包含目录层级、文件数量统计和关键文件标注
2. WHEN 项目扫描完成, THE Structure_Mapper SHALL 识别项目中的核心模块，并生成模块关系图的 Mermaid 格式描述
3. WHEN 项目包含多个子模块, THE Structure_Mapper SHALL 生成子模块间的依赖关系图，标注依赖方向和依赖类型（编译依赖、运行时依赖等）
4. THE Structure_Mapper SHALL 在目录树中对关键目录和文件进行功能标注（如"入口文件"、"配置目录"、"测试目录"、"核心业务模块"等）
5. WHEN 目录树层级超过 5 层, THE Structure_Mapper SHALL 对深层目录进行折叠，仅展示关键路径的完整层级
6. IF 项目包含自动生成的目录（如 build、dist、node_modules）, THEN THE Structure_Mapper SHALL 在结构图中标注这些目录为"自动生成"并默认折叠

### Requirement 10: 启动/部署/配置说明书

**User Story:** 作为一名开发者，我想要自动生成项目的启动方式、部署流程和配置项说明，以便快速搭建本地开发环境并了解部署要求。

#### Acceptance Criteria

1. WHEN 项目扫描完成, THE Ops_Doc_Generator SHALL 识别项目的启动方式（如 main 函数入口、启动脚本、npm scripts、Makefile 目标等）并生成启动步骤说明
2. WHEN 项目包含容器化配置（如 Dockerfile、docker-compose.yml）, THE Ops_Doc_Generator SHALL 解析容器配置并生成容器化部署说明
3. WHEN 项目包含 CI/CD 配置文件（如 Jenkinsfile、.github/workflows、.gitlab-ci.yml）, THE Ops_Doc_Generator SHALL 解析流水线配置并生成部署流程说明
4. WHEN 项目包含配置文件（如 application.yml、.env、config.json）, THE Ops_Doc_Generator SHALL 提取所有配置项，并为每个配置项记录名称、默认值、用途说明和是否必填
5. THE Ops_Doc_Generator SHALL 识别项目的外部依赖服务（如数据库、Redis、消息队列、第三方 API）并生成环境依赖清单
6. WHEN 项目包含多个环境配置（如 dev、test、prod）, THE Ops_Doc_Generator SHALL 对比不同环境的配置差异并生成环境配置对照表
7. IF 项目缺少启动脚本或明确的入口点, THEN THE Ops_Doc_Generator SHALL 基于项目类型和框架推断可能的启动方式，并在说明中标注为"推断结果"

### Requirement 11: 坑点笔记

**User Story:** 作为一名开发者，我想要自动识别项目中的潜在问题和技术债务，以便在接手项目时提前了解风险点，避免踩坑。

#### Acceptance Criteria

1. WHEN 源码扫描完成, THE Pitfall_Detector SHALL 识别代码中的反模式（如过长方法、过深嵌套、God Class、循环依赖等）并记录具体位置和严重程度
2. WHEN 依赖分析完成, THE Pitfall_Detector SHALL 识别存在已知安全漏洞或已废弃的第三方依赖，并标注风险等级（高、中、低）
3. WHEN 源码扫描完成, THE Pitfall_Detector SHALL 识别代码中的 TODO、FIXME、HACK、XXX 等标记注释，并按类别和优先级汇总
4. WHEN 源码扫描完成, THE Pitfall_Detector SHALL 识别不一致的编码风格（如混合使用不同命名规范、缩进风格不统一等）
5. WHEN 项目配置分析完成, THE Pitfall_Detector SHALL 识别硬编码的配置值（如数据库连接字符串、API 密钥、文件路径等）并标注为安全风险
6. THE Pitfall_Detector SHALL 为每个识别到的坑点生成包含以下信息的记录：坑点类别、严重程度、涉及文件和行号、问题描述和建议修复方案
7. IF 项目缺少单元测试或测试覆盖率文件, THEN THE Pitfall_Detector SHALL 在坑点笔记中标注"测试覆盖不足"并列出缺少测试的核心模块

### Requirement 12: 接手速查手册

**User Story:** 作为一名新接手项目的开发者，我想要获取一份综合性的快速参考手册，以便在最短时间内了解项目全貌并开始开发工作。

#### Acceptance Criteria

1. WHEN 所有分析模块执行完成, THE Quickstart_Guide_Generator SHALL 生成一份单文件的接手速查手册，包含项目概览、技术栈速览、核心模块说明、关键流程摘要和常见操作指南
2. THE Quickstart_Guide_Generator SHALL 在手册开头生成"5 分钟速览"章节，用简洁的要点列表概括项目的核心信息（项目用途、技术栈、核心模块、启动方式）
3. THE Quickstart_Guide_Generator SHALL 生成"开发环境搭建"章节，包含从零开始搭建本地开发环境的完整步骤
4. THE Quickstart_Guide_Generator SHALL 生成"核心业务速览"章节，以表格形式列出每个业务模块的名称、功能描述、关键文件和负责的 API 接口
5. THE Quickstart_Guide_Generator SHALL 生成"注意事项"章节，汇总坑点笔记中严重程度为"高"的问题
6. WHEN 项目包含 API 接口, THE Quickstart_Guide_Generator SHALL 生成"接口速查表"章节，以表格形式列出所有接口的路径、方法、功能描述
7. IF 某个分析模块未产生有效结果, THEN THE Quickstart_Guide_Generator SHALL 在手册对应章节中标注"信息不足，建议手动补充"

### Requirement 13: AI 项目记忆

**User Story:** 作为一名使用 AI 辅助开发的开发者，我想要生成结构化的项目知识库文档，以便 AI 工具能够快速检索和理解项目上下文，提供更精准的代码建议。

#### Acceptance Criteria

1. WHEN 所有分析模块执行完成, THE AI_Memory_Generator SHALL 生成符合 JSON 格式的项目知识库文件，包含项目元数据、模块信息、接口定义、技术栈和关键流程
2. THE AI_Memory_Generator SHALL 为每个模块生成语义化的描述信息，包含模块用途、核心类列表、公开方法签名和依赖关系
3. THE AI_Memory_Generator SHALL 生成项目术语表，将项目中的领域术语与代码中的类名、方法名建立映射关系
4. THE AI_Memory_Generator SHALL 生成代码导航索引，记录关键功能点（如用户认证、数据持久化、缓存处理等）对应的源码文件和方法位置
5. WHEN 项目包含 API 接口, THE AI_Memory_Generator SHALL 为每个接口生成结构化描述，包含路径、方法、参数模型、响应模型和业务语义说明
6. THE AI_Memory_Generator SHALL 在知识库文件中包含版本标识和生成时间戳，支持增量更新时的版本对比
7. THE AI_Memory_Generator SHALL 生成一份 Markdown 格式的 AI 上下文摘要文件，适用于直接作为 AI 对话的上下文输入
8. IF 项目结构发生变更后重新生成知识库, THEN THE AI_Memory_Generator SHALL 支持与上一版本进行差异对比，并标注新增、修改和删除的内容

### Requirement 14: 双版本一致性

**User Story:** 作为一名开发者，我想要 Java 版本和 TypeScript 版本的分析工具在输出格式和使用方式上保持一致，以便在不同项目间切换时获得统一的使用体验。

#### Acceptance Criteria

1. THE Java_Analyzer 和 TS_Analyzer SHALL 生成格式完全一致的 Analysis_Report，包含相同的章节结构、字段定义和 Markdown 格式规范
2. THE Java_Analyzer 和 TS_Analyzer SHALL 生成格式完全一致的 AI 项目记忆文件，包含相同的 JSON Schema 结构和 Markdown 上下文摘要格式
3. THE Java_Analyzer 和 TS_Analyzer SHALL 支持完全相同的命令行参数集合，包括 `--output`、`--modules`、`--lang` 及其取值范围
4. THE Java_Analyzer 和 TS_Analyzer SHALL 使用相同的退出码规范（0 表示成功，1 表示分析错误，2 表示参数错误）
5. THE Java_Analyzer 和 TS_Analyzer SHALL 在控制台输出相同格式的进度信息和分析摘要
6. IF 任一版本新增分析维度或报告字段, THEN 另一版本 SHALL 在下一个发布版本中同步更新，保持输出格式一致
