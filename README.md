# Project Analyzer — 项目分析工具

自动化分析新接手项目的命令行工具，从技术架构、业务功能、主要流程、接口路径等多个维度进行深度分析，生成结构化 Markdown 报告和 AI 可检索的知识库文件。

## 双版本

| 版本 | 目标语言 | 运行时 | 入口命令 |
|------|----------|--------|----------|
| **TypeScript 版** (`project-analyzer-ts`) | Python、JS/TS、Go | Node.js 18+ | `project-analyzer <path>` |
| **Java 版** (`project-analyzer-java`) | Java | JDK 17+ | `project-analyzer-java <path>` |

两个版本共享相同的分析维度、报告格式和命令行参数。

## 快速开始

### TypeScript 版

```bash
cd project-analyzer-ts
npm install
npm run build

# 分析项目
npx project-analyzer /path/to/your/project

# 指定输出目录
npx project-analyzer /path/to/project -o ./reports

# 只运行部分模块
npx project-analyzer /path/to/project -m architecture,api,pitfall
```

### Java 版

```bash
cd project-analyzer-java
mvn package -DskipTests

# 分析项目
java -jar target/project-analyzer-java-0.1.0.jar /path/to/your/project

# 指定输出目录
java -jar target/project-analyzer-java-0.1.0.jar /path/to/project -o ./reports

# 只运行部分模块
java -jar target/project-analyzer-java-0.1.0.jar /path/to/project -m architecture,api,pitfall
```

## 命令行参数

```
project-analyzer <path> [options]

参数:
  <path>                项目根目录路径

选项:
  -o, --output <dir>    输出目录 (默认: ./analysis-reports/)
  -m, --modules <list>  逗号分隔的分析模块列表 (默认: 全部)
  -l, --lang <language> 覆盖自动检测的语言
  -h, --help            显示帮助信息
  -v, --version         显示版本信息
```

### 可选模块

| 模块名 | 说明 |
|--------|------|
| `architecture` | 技术架构分析（依赖、框架、分层结构） |
| `business` | 业务功能分析（模块划分、数据模型） |
| `flow` | 主要流程分析（入口点、调用链） |
| `api` | 接口路径分析（HTTP API 提取） |
| `structure` | 项目结构地图（目录树、模块关系图） |
| `ops` | 启动/部署/配置说明书 |
| `pitfall` | 坑点笔记（反模式、TODO、硬编码） |
| `quickstart` | 接手速查手册 |
| `ai-memory` | AI 项目记忆（JSON 知识库 + CLAUDE.md） |

## 输出文件

分析完成后在输出目录生成以下文件：

```
analysis-reports/
├── 报告索引.md               # 报告索引
├── 01-项目概览.md            # 项目概览
├── 02-技术架构.md            # 技术架构
├── 03-业务功能.md            # 业务功能
├── 04-主要流程.md            # 主要流程
├── 05-接口路径.md            # 接口路径
├── 06-项目结构地图.md        # 项目结构地图
├── 07-启动部署配置.md        # 启动/部署/配置
├── 08-坑点笔记.md            # 坑点笔记
├── 09-接手速查手册.md        # 接手速查手册
├── AI知识库.json             # AI 知识库 (JSON)
├── AI上下文摘要.md           # AI 上下文摘要
└── CLAUDE.md                 # Claude Code 项目上下文
```

## 与 Claude Code 集成

分析完成后会自动生成 `CLAUDE.md` 文件，可直接复制到项目根目录供 Claude Code 使用：

```bash
# 分析项目
project-analyzer /path/to/project -o /path/to/project/analysis-reports

# 复制 CLAUDE.md 到项目根目录
cp /path/to/project/analysis-reports/CLAUDE.md /path/to/project/CLAUDE.md
```

Claude Code 会在每次会话开始时自动读取 `CLAUDE.md`，获得项目的完整上下文。

生成的 `CLAUDE.md` 遵循 Anthropic 推荐的 WHY/WHAT/HOW 结构，包含：
- 项目概述（1-2 行）
- 构建/测试/运行命令
- 目录结构和模块说明
- 技术栈和核心框架
- API 接口速查
- 已知问题和注意事项
- 代码导航索引

## 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 分析成功完成 |
| 1 | 分析过程中发生错误 |
| 2 | 命令行参数错误 |

## 支持的语言和框架

### Java 版 (project-analyzer-java)
- **AST 解析**: JavaParser（精准的 Java 代码分析）
- **框架识别**: Spring Boot、Spring MVC、JAX-RS、MyBatis、Hibernate
- **构建工具**: Maven、Gradle
- **API 识别**: @RequestMapping、@GetMapping、@Path、@GET 等注解

### TypeScript 版 (project-analyzer-ts)
- **语言支持**: TypeScript/JavaScript、Python、Go
- **框架识别**: Express、React、Vue、Django、Flask、FastAPI、Gin
- **构建工具**: npm/yarn/pnpm、pip/poetry、go mod
- **API 识别**: Express 路由、Flask @app.route、Django urlpatterns、Gin router

## 项目结构

```
├── project-analyzer-ts/       # TypeScript 版本
│   ├── src/
│   │   ├── models/            # 数据模型
│   │   ├── errors/            # 错误处理
│   │   ├── plugins/           # 语言插件
│   │   ├── scanner/           # 项目扫描器
│   │   ├── modules/           # 分析模块
│   │   ├── report/            # 报告生成器
│   │   ├── analyzer/          # 协调器
│   │   └── cli.ts             # CLI 入口
│   └── package.json
│
├── project-analyzer-java/     # Java 版本
│   ├── src/main/java/com/analyzer/
│   │   ├── model/             # 数据模型
│   │   ├── error/             # 错误处理
│   │   ├── plugin/            # 语言插件
│   │   ├── scanner/           # 项目扫描器
│   │   ├── module/            # 分析模块
│   │   ├── report/            # 报告生成器
│   │   └── Main.java          # CLI 入口
│   └── pom.xml
│
└── test-fixtures/             # 测试用例项目
```

## 开发

### TypeScript 版

```bash
cd project-analyzer-ts
npm install
npm run build          # 编译
npm test               # 运行测试 (355 tests)
```

### Java 版

```bash
cd project-analyzer-java
mvn compile            # 编译
mvn test               # 运行测试
mvn package            # 打包可执行 JAR
```

## License

MIT
