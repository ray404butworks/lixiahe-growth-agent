# 泰州 OPC · 里下河农企增长 Agent

面向泰州农企与农特产品经营场景的本地工作台，提供销售数据分析、经营诊断、营销草稿生成与经营报告导出。

## 界面设计

- **地域标识**：从兴化垛田的田块与水道提取轮廓，绘制原创单色 SVG，统一用于工作台标志与浏览器图标。
- **视觉风格**：以稻米白和深田绿为主色，采用简洁排版、清晰分区与精简文案，突出经营数据和主要操作。
- **响应式布局**：桌面端使用固定侧栏；手机端按需展开菜单与筛选，按“核心指标 → 诊断入口 → 渠道贡献 → 销售趋势”组织内容。

## 主要功能

- **数据导入**：支持 CSV、Excel，提供字段映射、数据校验与三类演示样例。
- **经营看板**：展示销售额、订单数、贡献毛益与贡献率，支持日期、渠道筛选和商品对比。
- **经营诊断**：结合经营指标生成建议，展示数据依据、可能原因与下一步动作。
- **营销内容**：核对商品信息后生成短视频脚本、商品文案、社交文案与七日行动清单，支持编辑与复制。
- **本土知识**：整理泰州农业、渠道与物流相关资料，保留来源链接及核验日期。
- **经营报告**：汇总当前数据、诊断与营销草稿，支持 Markdown、HTML、CSV 和打印导出 PDF。

## 快速开始

### 源码运行

环境要求：Node.js 24、pnpm 11.25.0。

```sh
git clone https://github.com/ray404butworks/lixiahe-growth-agent.git
cd lixiahe-growth-agent
pnpm install --frozen-lockfile
pnpm dev
```

开发界面默认地址为 `http://localhost:3000`，本地 API 使用 `8080` 端口。实际地址以终端输出为准。

### 构建与本地预览

```sh
pnpm build
pnpm preview:local
```

构建产物为 `out/` 与 `server-dist/`。本地预览地址为 `http://127.0.0.1:8080`，同时提供页面与 API。

使用已构建的 Windows 演示包时，解压后双击 `start-preview.cmd` 即可启动。关闭终端将停止服务。

## 模型配置

项目默认使用离线规则，销售分析、经营诊断和草稿生成均可直接体验。

接入模型时，将根目录的 `.env.example` 复制为 `.env.local`，填写以下配置并重启服务：

| 配置项                   | 说明                                      |
| ------------------------ | ----------------------------------------- |
| `LIXIAHE_MODEL_ENABLED`  | 模型开关，默认 `false`；启用时设为 `true` |
| `LIXIAHE_MODEL_API_KEY`  | 服务端 API Key                            |
| `LIXIAHE_MODEL_BASE_URL` | 模型服务接口地址                          |
| `LIXIAHE_MODEL_NAME`     | 模型 ID                                   |

密钥保存在本地 `.env.local`，该文件已纳入 Git 忽略规则。模型调用还需在页面中勾选本次授权。详细配置见 [模型接入说明](docs/phase3-configuration.md)。

## 数据处理

销售文件在浏览器中解析，诊断与内容请求由本地服务处理。启用模型后，模型接收汇总指标、建议上下文与来源摘要。

导入数据和生成结果保留在当前页面会话中，刷新页面或清除会话后重置。样例商家与交易均为演示数据。

## 开发与文档

技术栈：Next.js 16、React 19、TypeScript、Recharts、Node.js。

```sh
pnpm lint
pnpm typecheck
pnpm test:all
pnpm test:e2e:growth
```

- [数据契约与计算口径](docs/data-contract.md)
- [服务端设计与接口](docs/phase3-design.md)
- [本土知识来源](docs/phase3-sources.md)
- [前端设计约定](docs/frontend-design.md)

## 许可证

项目遵循 [MIT 许可证](LICENSE)。上游代码来源与复用范围见 [UPSTREAM.json](UPSTREAM.json)。
