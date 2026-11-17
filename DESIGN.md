---
name: 里下河农企增长 Agent
description: 中性浅色、系统设置式的经营工作台
colors:
  paper: "#f5f5f7"
  surface: "#fff"
  sidebar: "#fafafa"
  subtle: "#f5f5f7"
  selected: "#e9e9ed"
  ink: "#1d1d1f"
  muted: "#6e6e73"
  line: "#e5e5ea"
  control-line: "#c7c7cc"
  accent: "#007aff"
  link: "#0066cc"
  focus: "#007aff"
  success: "#287747"
  success-surface: "#edf6ef"
  warning: "#865a15"
  warning-surface: "#fff7e8"
  danger: "#b13a32"
  danger-surface: "#fff1ef"
  chart-primary: "#637c9c"
  chart-secondary: "#c3cbd6"
  chart-fill: "#edf1f6"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.025em"
  title:
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
    letterSpacing: "0"
  label:
    fontSize: "13px"
  caption:
    fontSize: "12px"
  metric:
    fontSize: "clamp(23px, 2.15vw, 31px)"
    fontWeight: 600
    lineHeight: 1.7
    letterSpacing: "-0.025em"
rounded:
  panel: "18px"
  card: "15px"
  control: "11px"
  navigation: "10px"
  pill: "999px"
spacing:
  page: "clamp(24px, 3.4vw, 56px)"
  panel: "24px"
  import-panel: "28px"
  control: "10px 17px"
  field: "9px 12px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "{spacing.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.control}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.field}"
  navigation-active:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel}"
  chip-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
---

# Design System: 里下河农企增长 Agent

## Overview

**Creative North Star: "中性浅色系统工作台"**

按 Ray 明确指定的 Apple Developer Console / macOS 设置式方向实现。浅灰画布、白色分组、石墨黑操作与系统字体共同提供稳定、清楚的经营界面；蓝色只承担链接、焦点和选框的识别。保留垛田标志轮廓，以石墨灰单色版本融入工作台。

以任务、数据和真实状态建立层级。密度通过留白、分组和文字层级调节，不以大面积品牌色、聊天气泡或装饰效果填充页面。此文件记录当前已实现的视觉系统；产品能力和约束见 `PRODUCT.md`，页面任务见对应 surface brief。

**Key Characteristics:**

- 中性浅色表面，清晰但克制的分组。
- 系统字体、紧凑正文、稳定的数字对齐。
- 石墨黑主操作、蓝色链接与键盘焦点、保留语义状态色。
- 桌面侧栏与手机可展开导航共用六个入口。

## Colors

前置 tokens 与 `src/styles/globals.css` 保持一致；颜色角色由用途区分。

### Primary

- **石墨正文与操作色**（`ink`）：正文、关键数字、主按钮与单色标志。
- **系统蓝**（`accent` / `focus`）：选框、光标、键盘焦点；**链接蓝**（`link`）用于可执行文字链接。

### Secondary

- **图表蓝灰**（`chart-primary` / `chart-secondary` / `chart-fill`）：低饱和数据序列与面积填充，图例与序列一一对应。

### Neutral

- **浅灰画布**（`paper` / `subtle`）：页面背景与次级分组；**纯白表面**（`surface`）：主面板、卡片和输入。
- **侧栏浅灰**（`sidebar`）与**选中灰**（`selected`）：区分导航区域和当前位置。
- **次级灰**（`muted`）：标签、解释、来源与辅助说明；**分割灰**（`line`）和**控件描边灰**（`control-line`）分别用于结构与可交互边界。
- **成功、风险、错误语义色**（`success*` / `warning*` / `danger*`）：与文字状态配对，用浅底色承载局部状态，负数保留相应语义。

**The Semantic Color Rule.** 品牌不占用成功色。状态色必须传达实际状态，不能代替状态文字。

## Typography

所有界面采用前置 `headline` / `body` 中的系统字体栈，不下载字体或增加字体依赖。标题和正文使用同一家族，通过字号、字重、行距分层。

- **Headline**：页面标题使用前置 `headline`；手机降至（28px）。
- **Title**：分区标题使用前置 `title`；报告文档标题为（26px / 1.4，600）。
- **Body**：主要正文使用前置 `body`；建议正文与长文本采用更宽松的行距（1.85–1.9）。
- **Label / Caption**：标签和说明采用前置 `label` / `caption`；全局署名为（11px，400）。
- **Metric**：指标使用前置 `metric`，手机为（`clamp(20px, 5.55vw, 24px)`）；表格和关键指标采用 `tabular-nums`，不是另载等宽字体。
- 手机输入、选择框、文本域字号为（16px），避免密集小字影响填写。

**The Complete Number Rule.** 金额、百分比和单位应保持可核对；报告宽表通过局部滚动保留完整数字，不把小数末位挤成孤立一行。

## Layout

桌面固定侧栏宽（208px），主内容按同样宽度偏移；主容器最大宽（1320px，含内边距），水平留白使用前置 `spacing.page`，默认顶部（44px）。主分组间距与标准面板内边距为（24px），导入双栏面板内边距为（28px）。导入入口按（1.15 : 1）分配上传和样例，图表按（1.1 : 1）排列。

| 条件    | 当前布局行为                                                                     |
| ------- | -------------------------------------------------------------------------------- |
| ≥1600px | 顶部留白增加到52px，上传区域最小高度260px；内容继续受最大宽约束。                |
| ≤1150px | 看板指标与字段映射为两列，图表和排行纵排；脚本标题占整行。                       |
| ≤900px  | 上传与样例改为单列；导入样式还保留较早920px收窄规则，最终900px规则决定入口列数。 |
| ≤700px  | 隐藏固定侧栏，使用可展开手机菜单；六个入口完整保留，知识、事实、脚本、文案纵排。 |

手机主内容内边距为（28px / 至少20px / 20px），横向考虑安全区；主要按钮与输入至少（44px）高，导航项至少（44px）高。菜单内部可纵向滚动，最高（52dvh）。渠道贡献在手机先于销售趋势显示。

宽表使用自身的横向滚动容器，滚动被限制在表格区域；报告四列以上表格最小宽（640px），打印时解除最小宽并展开内容。页面本身不应产生横向滚动。五档已记录的验证宽度为（1920、1440、1024、390、375px）；它们是验收视口，不是五个 CSS 断点。

根布局统一渲染「奶蛙实验室」底栏。底栏占正常文档流、最小高（56px），短页靠近视口底部，长页位于内容末尾；桌面沿主内容右侧对齐，手机取消侧栏偏移并保留底部安全区。`aria-hidden="true"`、`pointer-events:none`、不可选中，打印隐藏。不得改为覆盖内容的固定浮层。

## Elevation & Depth

通过浅灰画布、白色表面、细线分组和选中灰建立深度。当前系统不依赖卡片阴影、玻璃、发光或渐变；面板不以悬浮效果争夺注意力。结构边线为（1px），按钮与输入的轮廓主要由描边、底色和状态变化提供。

**The Quiet Surface Rule.** 新分组沿用表面与边线的层级，不为普通业务卡片增加装饰性投影。

## Shapes

三档主圆角为前置 `panel` / `card` / `control`：大面板与报告文档、普通卡片、按钮与输入分别使用各自档位。导航为（10px），状态标签采用胶囊形。局部列表项与分页沿用较小的（9px）圆角；不把全部容器都胶囊化。上传区域使用浅灰底与虚线边界，保持原生文件输入语义。

## Components

### Buttons

主操作使用石墨黑底白字，次操作白底、控件灰描边；共享内边距见前置 tokens，桌面最小高（42px）。悬停主按钮转为（#39393d），次按钮转为次级浅灰。禁用保留原生 `disabled`，透明度（0.42）、禁止光标。文字操作使用链接蓝。

共享状态过渡为（140ms，`cubic-bezier(0.16, 1, 0.3, 1)`），只改变底色、描边与文字；遵循减少动态偏好，关闭动画和过渡。当前按钮没有另定义按压形变。

### Inputs / Fields

白底、控件灰（1px）描边、控件圆角，桌面最小高（40px）；占位符为次级灰。保留原生输入、下拉、勾选和折叠。工作台焦点为系统蓝（2px）外轮廓、偏移（3px），全局默认偏移（4px）。不能通过隐藏焦点或跳转入口清理截图。

### Navigation

图标配中文名称，默认次级灰，悬停为浅灰背景，当前项为选中灰、石墨字和（600）字重。桌面与手机共享导航配置及当前项语义。数据设置入口指向现有 `/legal/` 说明页；当前源码没有 API Key 配置 UI，服务端配置与页面授权维持原流程。

### Cards / Containers

普通白色卡片使用前置 `card`；上传与样例采用大面板形态，指标卡以数值为第一层级。事实条、筛选和校验摘要使用次级浅灰。诊断事实、建议、可能原因、动作和来源以文字层级分开，不使用聊天气泡。

### Chips / Feedback

标签使用（12px / 1.5，500）、（4px 9px）内边距。成功、风险、错误分别配对语义前景色和浅底，普通提示使用浅灰；保留错误、缺失字段、演示标记与阻断反馈的实际文字。

### Tables / Reports

表格为（13px）、数字等宽对齐、浅灰表头与（1px）分隔线，行悬停使用侧栏浅灰。报告文档白底、面板圆角、桌面内边距（36px）、手机（22px 18px）；导出工具栏可换行。HTML导出同步系统字体和中性色；打印移除导航、操作工具与署名，保留报告正文和完整表格。

## Do's and Don'ts

### Do:

- **Do** 从 `globals.css` 取语义 tokens，通过 `workspace.css` 维护共享组件，页面样式只表达布局差异。
- **Do** 延续系统字体、中性分组、石墨主按钮和蓝色可交互提示。
- **Do** 保留完整数字、字段核对、错误反馈、来源与授权状态。
- **Do** 为桌面和手机保留同一套六入口导航，并将宽表滚动限制在局部。
- **Do** 将署名留在正常文档流并在打印时隐藏。

### Don't:

- **Don't** 恢复稻米白、深田绿的旧视觉主题，或用大面积绿色提示替代信息层级。
- **Don't** 添加渐变、玻璃、发光、装饰图片或普通卡片悬浮阴影。
- **Don't** 引入下载字体、外部字体请求或为本次视觉方向新增依赖。
- **Don't** 把截图验证视口误写成 CSS 断点，或把独立视觉复核当成人工验收与发布许可。

实现来源：`src/styles/globals.css`、`workspace.css`、页面样式和 `src/app/layout.tsx`。本地实际截图与自动验收记录见 `docs/visual-rebuild-2026-11-18.md`；独立复核的 F1/F2 已 resolved、disposition 为 ship，仅代表记录中的视觉复核范围。最终人工视觉接受、真实模型连接、实体手机/Safari与实际打印成品仍待确认；未推送、合并或部署。没有新增交付用栅格图片，验收截图不作为产品素材。
