# Project Analyzer — 项目分析工具

自动化分析新接手项目的命令行工具，从技术架构、业务功能、主要流程、接口路径等多个维度进行深度分析，生成结构化 Markdown 报告和 AI 可检索的知识库文件。

## 双版本

| 版本 | 目标语言 | 运行时 | 运行方式 |
|------|----------|--------|----------|
| **TypeScript 版** (`project-analyzer-ts`) | Python、JS/TS、Go | Node.js 18+ | CLI 命令行 |
| **Java 版** (`project-analyzer-java`) | Java | JDK 17+ / Spring Boot 3.3 | 配置文件 + 启动即分析 |

两个版本共享相同的分析维度和报告输出格式。

---

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

### Java 版（Spring Boot）

#### 方式一：修改配置文件后启动

编辑 `src/main/resources/application.yml`：

```yaml
analyzer:
  project-path: /path/to/your/project   # 要分析的项目路径
  output-dir: ./analysis-reports         # 报告输出目录
  modules: ""                            # 留空=全部，或逗号分隔指定模块
  lang: ""                               # 留空=自动检测
  thresholds:                            # 反模式检测阈值（可选调整）
    max-method-lines: 80
    max-nesting-depth: 4
    max-class-methods: 20
    max-class-lines: 500
    max-file-lines: 1000
```

然后运行：

```bash
cd project-analyzer-java
mvn clean package -DskipTests
java -jar target/project-analyzer-java-0.1.0.jar
```

#### 方式二：通过命令行参数覆盖配置

```bash
java -jar target/project-analyzer-java-0.1.0.jar \
  --analyzer.project-path=/path/to/project \
  --analyzer.output-dir=./reports \
  --analyzer.modules=architecture,api,pitfall
```

#### 方式三：通过环境变量

```bash
ANALYZER_PROJECT_PATH=/path/to/project \
ANALYZER_OUTPUT_DIR=./reports \
java -jar target/project-analyzer-java-0.1.0.jar
```

#### 方式四：IDEA 中运行

1. 用 IDEA 打开 `project-analyzer-java` 目录
2. 等 Maven 导入完成
3. 修改 `src/main/resources/application.yml` 中的 `analyzer.project-path`
4. 右键 `Main.java` → Run 'Main'

---

## 配置说明（Java 版）

`application.yml` 完整配置项：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `analyzer.project-path` | 要分析的项目根目录路径 | `.` |
| `analyzer.output-dir` | 报告输出目录 | `./analysis-reports` |
| `analyzer.modules` | 逗号分隔的模块列表，留空=全部 | `""` |
| `analyzer.lang` | 覆盖语言检测，留空=自动 | `""` |
| `analyzer.thresholds.max-method-lines` | 过长方法阈值 | `80` |
| `analyzer.thresholds.max-nesting-depth` | 过深嵌套阈值 | `4` |
| `analyzer.thresholds.max-class-methods` | God Class 方法数阈值 | `20` |
| `analyzer.thresholds.max-class-lines` | God Class 行数阈值 | `500` |
| `analyzer.thresholds.max-file-lines` | 过长文件阈值 | `1000` |

---

## 命令行参数（TypeScript 版）

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

---

## 可选模块

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

---

## 输出文件

分析完成后在输出目录生成以下文件：

```
analysis-reports/
├── 报告索引.md               # 报告索引（含所有报告链接）
├── 01-项目概览.md            # 项目基本信息和统计
├── 02-技术架构.md            # 依赖、框架、分层结构
├── 03-业务功能.md            # 业务模块和数据模型
├── 04-主要流程.md            # 入口点和调用链
├── 05-接口路径.md            # HTTP API 接口列表
├── 06-项目结构地图.md        # 目录树和模块关系图
├── 07-启动部署配置.md        # 启动方式、Docker、CI/CD、配置项
├── 08-坑点笔记.md            # 反模式、TODO、硬编码、安全风险
├── 09-接手速查手册.md        # 5 分钟速览 + 核心业务速览
├── AI知识库.json             # 结构化 JSON 知识库
├── AI上下文摘要.md           # Markdown 格式 AI 上下文
└── CLAUDE.md                 # Claude Code 项目上下文（可直接使用）
```

---

## 与 Claude Code 集成

分析完成后自动生成 `CLAUDE.md`，复制到项目根目录即可：

```bash
cp analysis-reports/CLAUDE.md ./CLAUDE.md
```

Claude Code 在每次会话开始时自动读取该文件，获得项目的完整上下文。

生成的 `CLAUDE.md` 遵循 Anthropic 推荐的 WHY/WHAT/HOW 结构：
- 项目概述（1-2 行）
- 构建/测试/运行命令
- 目录结构和模块说明
- 技术栈和核心框架
- API 接口速查
- 已知问题和注意事项
- 代码导航索引

---

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

---

## 项目结构

```
├── project-analyzer-ts/           # TypeScript 版本（CLI）
│   ├── src/
│   │   ├── models/                # 数据模型
│   │   ├── errors/                # 错误处理
│   │   ├── plugins/               # 语言插件（TS/JS、Python、Go、Generic）
│   │   ├── scanner/               # 项目扫描器
│   │   ├── modules/               # 9 个分析模块
│   │   ├── report/                # 报告生成器
│   │   ├── analyzer/              # 协调器
│   │   └── cli.ts                 # CLI 入口
│   └── package.json
│
├── project-analyzer-java/         # Java 版本（Spring Boot）
│   ├── src/main/java/com/analyzer/
│   │   ├── model/                 # 数据模型
│   │   ├── error/                 # 错误处理
│   │   ├── plugin/                # 语言插件（JavaPlugin、GenericPlugin）
│   │   ├── scanner/               # 项目扫描器
│   │   ├── module/                # 9 个分析模块
│   │   ├── report/                # 报告生成器
│   │   ├── Main.java              # Spring Boot 入口
│   │   ├── AnalyzerRunner.java    # 启动后自动执行分析
│   │   └── AnalyzerProperties.java # 配置属性绑定
│   ├── src/main/resources/
│   │   └── application.yml        # 配置文件
│   └── pom.xml
│
└── test-fixtures/                 # 测试用例项目
```

---

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
mvn compile                    # 编译
mvn test                       # 运行测试
mvn clean package -DskipTests  # 打包 Spring Boot 可执行 JAR
```

---

## 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 分析成功完成 |
| 1 | 分析过程中发生错误 |

## License

MIT
