# Creator Studio Prompt Builder 开发规划 - 2026-06-05

更新时间：2026-06-05

## 1. 文档目标

本文档用于细化 Creator Studio 中 Prompt Builder 模块的后续开发规划。

Prompt Builder 不应被定位为一个普通的 prompt 拼接表单，而应成为 Creator Studio 的核心生产编排层：

```text
案例 / 模板 / 资产 / 素材 / Brand Kit / Board
  -> PromptSpec
  -> Prompt Compiler
  -> Cowork / Seedream / Batch / 外部工具
  -> 资产 / Run / 评估 / Recipe
```

它的长期目标是把创意生产从“手写一段不可追踪的 prompt”，升级为“可编辑、可验证、可复用、可追踪的 Prompt-as-Code 工作流”。

## 2. 相关文档和代码

| 类型 | 路径 | 用途 |
|---|---|---|
| PRD | `wesight-development-guide/docs/prd-creator-studio-mvp-2026-06-05.md` | Creator Studio MVP 产品范围 |
| 任务拆解 | `wesight-development-guide/docs/TASK-03.md` | Phase 0-11 落地任务 |
| 战略 | `wesight-development-guide/docs/strategy-ai-production-workstation-2026-06-05.md` | AI 生产工作站方向 |
| 素材策略 | `wesight-development-guide/docs/strategy-material-ingestion-and-asset-workflows-2026-06-05.md` | 素材、资产、Context Pack 方向 |
| 参考案例 | `refer/awesome-gpt-image-2/data/cases.json` | 490 个真实案例 |
| 参考模板 | `refer/awesome-gpt-image-2/data/style-library.json` | 22 套工业模板 |
| 参考模板文档 | `refer/awesome-gpt-image-2/docs/templates.md` | 模板结构和防坑指南 |
| Builder UI | `src/renderer/components/creatorStudio/CreatorStudioView.tsx` | Prompt Builder 当前 UI 和入口衔接 |
| Builder 逻辑 | `src/renderer/utils/creatorStudio.ts` | PromptSpec 构建、Prompt 渲染、Cowork draft |
| Builder 类型 | `src/renderer/types/creatorStudio.ts` | Renderer 侧 CreatorPromptSpec |
| 资产类型 | `src/shared/creatorStudio/types.ts` | 主进程和 IPC 共享 PromptSpecSnapshot |
| Board | `src/renderer/components/creatorStudio/CreatorBoard.tsx` | Board 到 Context Pack、Brand Kit |
| Batch | `src/renderer/components/creatorStudio/CreatorBatchPanel.tsx` | 多方向、多模型、多尺寸批量执行 |

## 3. 当前模块定位

当前 Prompt Builder 已经超出 Phase 2 的最小范围。它不是只负责“填表生成 prompt”，而是承担以下职责：

1. 从案例库进入 Builder，保留案例 prompt、分类、风格、场景和 caseIds。
2. 从模板库进入 Builder，保留 templateId、guidance、pitfalls 和 exampleCases。
3. 从资产库进入 Builder，保留历史 promptSpec、promptText、templateId、caseIds 和 variantOfAssetId。
4. 将表单、seed 和素材托盘编译为 `CreatorPromptSpec`。
5. 从 `CreatorPromptSpec` 渲染 copyable prompt。
6. 生成 Context Pack，说明素材 role、本地路径、附件状态和 fallback 信息。
7. 生成 4 个创意方向，并允许选择其中一个方向进入 PromptSpec。
8. 把 prompt 和 PromptSpec 发送到 Cowork，并激活推荐 skills。
9. 保存 Prompt Asset，沉淀为资产库中的可复用 prompt。
10. 为 Board 和 Batch 提供统一结构化输入。

因此，Prompt Builder 是 Creator Studio 的“创意生产配方编辑器”，而不是一个孤立表单。

## 4. 案例库和模板库的使用差异

参考项目 `awesome-gpt-image-2` 中案例和模板的差异非常明确。

案例库是具体实例：

- 有真实图片。
- 有完整原始 prompt。
- 有 sourceLabel、sourceUrl、githubUrl。
- 有 category、styles、scenes。
- 适合学习某张图的结构、叙事、构图、文字和视觉质感。

模板库是抽象方法：

- 有 useWhen。
- 有 guidance。
- 有 pitfalls。
- 有 exampleCases。
- 有模板 cover 和分类标签。
- 适合把一类任务抽象成可复用生产框架。

在 WeSight 中应该形成两个不同的 Builder 模式：

| 入口 | Builder 模式 | 应继承内容 | 用户意图 | Prompt 策略 |
|---|---|---|---|---|
| 案例库 | 案例 Remix 模式 | `referencePrompt`、caseIds、styles、scenes、category | 把某个成品迁移到自己的主题 | 保留结构和质感，替换 brief |
| 模板库 | 模板起稿模式 | `templateId`、guidance、pitfalls、exampleCases | 按成熟方法生成新 prompt | 使用模板规则和防坑指南 |
| 资产库 | 资产变体模式 | promptSpec、promptText、variantOfAssetId、素材路径 | 基于已有结果继续生成 | 沿用有效约束，局部变体 |
| 空白 | 自由起稿模式 | 无来源或默认模板 | 从零开始创建 brief | 引导补齐关键字段 |

后续 UI 必须清楚显示当前模式，避免用户误以为“案例生成”和“模板使用”是同一种行为。

## 5. 当前能力评估

### 5.1 已完成能力

| 能力 | 状态 | 说明 |
|---|---|---|
| 案例进入 Builder | 已完成 | 带入原始 prompt、caseIds、styles、scenes |
| 模板进入 Builder | 已完成 | 带入 templateId、guidance、pitfalls、exampleCases |
| 资产进入 Builder | 已完成 | 带入已有 promptSpec 和 variantOfAssetId |
| 表单生成 PromptSpec | 已完成 | 支持核心 MVP 字段 |
| Prompt 渲染 | 已完成 | 支持中文 / 英文，空字段不输出占位 |
| Context Pack | 已完成雏形 | 素材 role、path、mime、attachment、localPath |
| Creative Directions | 已完成雏形 | 固定生成 4 个方向 |
| Send to Cowork | 已完成 | 文本 draft 中包含 PromptSpec JSON |
| Seedream 生成意图 | 已完成雏形 | 检测 skill 和 API 配置状态 |
| 保存 Prompt Asset | 已完成 | 保存 promptText、promptSpec、templateId、caseIds、tags |
| Board 接入 | 已完成雏形 | 可把 prompt、case、asset、direction 加入 Board |
| Batch 接入 | 已完成雏形 | 可按 directions、models、templates、sizes 生成任务矩阵 |

### 5.2 主要短板

| 问题 | 影响 | 建议 |
|---|---|---|
| Builder 模式不清晰 | 用户不知道当前是案例 Remix 还是模板起稿 | 增加 Source Mode 状态和模式化表单 |
| 表单字段偏少 | 无法覆盖 PRD 中目标类型、色彩、输出数量等字段 | 扩展分组表单和 PromptSpec schema |
| PromptSpec 偏扁平 | 后续 provider compiler、lint、diff 难做 | 升级为 `PromptSpecV1` 分层结构 |
| Prompt 渲染偏线性 | 选择方向后仍可能输出全部方向，造成执行歧义 | 增加 Prompt Compiler 和输出模式 |
| Creative Directions 固定 | 无法体现模板、案例、品牌和素材差异 | 改为模板感知和上下文感知 |
| Context Pack 只是清单 | 缺少图像理解、约束摘要和素材使用策略 | 增加素材分析和 role-specific instruction |
| 缺少 PromptSpec Lint | 难发现比例冲突、文字过长、素材角色冲突 | 增加规则检查和质量建议 |
| 保存缺少版本 | 难以复盘 prompt 变更和生产结果 | 增加 version、diff、fork、recipe |
| Cowork metadata 仍是文本 | 后续追踪和复跑依赖正则解析 | P1/P2 扩展结构化 draft metadata |

## 6. 产品目标

### 6.1 用户目标

1. 不会写 prompt 的用户，也能通过案例、模板和表单生成专业 prompt。
2. 有参考图或历史结果的用户，可以快速生成变体。
3. 产品、运营、市场人员可以围绕同一个 brief 快速比较多个方向。
4. 生成结果可以追溯到模板、案例、素材、PromptSpec、模型和执行记录。
5. 成功的 prompt 可以沉淀为私有模板或 recipe。

### 6.2 工程目标

1. Prompt Builder 输出结构化、稳定、可演进的 `PromptSpec`。
2. Prompt 渲染通过 compiler 完成，不在 UI 中散落拼接逻辑。
3. 案例、模板、资产、Board、Batch、Cowork 共享同一 PromptSpec 语义。
4. Provider 特定逻辑不写死在 UI，后续可接 Seedream、GPT Image、ComfyUI、Runway 等。
5. 每次执行和资产沉淀都能保留 provenance。
6. 文案走 i18n，IPC 使用常量，日志不泄露 prompt、API key 和 base64。

## 7. 目标信息架构

Prompt Builder 页面建议重构为三栏或两栏可切换结构：

```text
左侧：Brief / 输入
  - Source Mode
  - Project
  - Task Type
  - Brief
  - Subject
  - Platform
  - Audience
  - Required Text

中间：结构化控制
  - Composition
  - Style
  - Brand
  - Materials
  - Constraints
  - Output
  - Runtime

右侧：生产输出
  - Quality / Lint
  - Prompt Preview
  - Creative Directions
  - Context Pack
  - PromptSpec
  - Actions
```

在窄屏或现有布局中，可以先保持左表单右输出，但按 collapsible section 分组。

## 8. PromptSpecV1 规划

当前 `CreatorPromptSpec` 可以作为兼容层保留，但建议新增 versioned schema。

### 8.1 顶层结构

```json
{
  "schemaVersion": "creator.prompt.v1",
  "source": {},
  "brief": {},
  "composition": {},
  "style": {},
  "text": {},
  "materials": [],
  "brand": {},
  "constraints": {},
  "output": {},
  "runtime": {},
  "directions": [],
  "selectedDirectionId": null,
  "contextPack": {},
  "provenance": {},
  "quality": {}
}
```

### 8.2 source

用于表达 Builder 从哪里来。

```json
{
  "source": {
    "mode": "case-remix",
    "sourceType": "case",
    "sourceId": "case-493",
    "sourceTitle": "东京旅行 13 格视频封面",
    "templateId": null,
    "caseIds": ["case-493"],
    "variantOfAssetId": null,
    "referencePrompt": "..."
  }
}
```

建议枚举：

- `blank`
- `case-remix`
- `template-draft`
- `asset-variant`
- `board-context`
- `batch-task`

### 8.3 brief

表达用户要完成什么任务。

```json
{
  "brief": {
    "taskType": "social-cover",
    "subject": "东京 48 小时旅行攻略",
    "goal": "生成小红书视频封面",
    "platform": "xiaohongshu",
    "audience": "第一次去东京的年轻旅行用户",
    "message": "第一次去也不踩坑",
    "language": "zh"
  }
}
```

### 8.4 composition

表达画面布局、比例和视觉层级。

```json
{
  "composition": {
    "aspectRatio": "4:5",
    "layout": "poster-grid",
    "cameraDistance": "medium",
    "subjectPlacement": "center",
    "hierarchy": "large title, visual collage, small labels",
    "safeArea": "avoid text near edges"
  }
}
```

### 8.5 style

表达视觉风格。

```json
{
  "style": {
    "visualStyle": "realistic travel editorial poster",
    "styles": ["UI", "Poster", "Realistic"],
    "scenes": ["Travel", "Social"],
    "mood": "energetic, useful, premium",
    "colorPreference": ["red", "white", "black"],
    "lighting": "natural daylight",
    "texture": "clean digital poster"
  }
}
```

### 8.6 text

把图中文字从普通字符串升级为可检查对象。

```json
{
  "text": {
    "requiredText": [
      {
        "content": "东京48小时",
        "priority": "hero",
        "mustBeReadable": true
      },
      {
        "content": "第一次去也不踩坑",
        "priority": "secondary",
        "mustBeReadable": true
      }
    ],
    "forbiddenText": [],
    "locale": "zh-CN"
  }
}
```

### 8.7 materials

素材不只记录 path，还要表达用途和使用策略。

```json
{
  "materials": [
    {
      "id": "material-1",
      "role": "brand",
      "source": "file",
      "name": "logo.png",
      "path": "/Users/demo/logo.png",
      "mimeType": "image/png",
      "hasImageAttachment": true,
      "localPathAvailable": true,
      "usage": "use logo only as brand reference, do not redraw incorrectly",
      "analysis": {
        "dominantColors": ["#111111", "#ffffff"],
        "contentSummary": "black and white wordmark"
      }
    }
  ]
}
```

### 8.8 brand

Brand Kit 应进入 PromptSpec，而不是只拼进 visualStyle。

```json
{
  "brand": {
    "colors": ["#111111", "#ffffff"],
    "logoPath": "/Users/demo/logo.png",
    "tone": "premium, calm, direct",
    "visualPreferences": "clean typography, high contrast",
    "bannedWords": ["cheap", "fake"]
  }
}
```

### 8.9 constraints

统一放置硬约束、负向要求和质量要求。

```json
{
  "constraints": {
    "negativeRequirements": [
      "no unreadable text",
      "no distorted UI",
      "do not cover the main subject with labels"
    ],
    "hardRequirements": [
      "all required text must be readable",
      "keep aspect ratio 4:5"
    ],
    "pitfalls": [
      "avoid generic layout",
      "avoid mixed platform UI patterns"
    ]
  }
}
```

### 8.10 output

输出配置应服务于单次生成和 Batch。

```json
{
  "output": {
    "count": 4,
    "sizes": ["4:5", "1:1"],
    "deliverableType": "image",
    "quality": "production draft",
    "saveToAssets": true
  }
}
```

### 8.11 runtime

runtime 不直接绑定 UI，而是表达能力要求。

```json
{
  "runtime": {
    "preferredProvider": "seedream",
    "requiredCapabilities": ["image", "reference-image", "readable-text"],
    "activeSkillIds": ["seedream", "gpt-image-2-style-library"],
    "fallback": "copy-prompt"
  }
}
```

### 8.12 directions

方向应可解释、可选择、可独立编译。

```json
{
  "directions": [
    {
      "id": "bold-campaign",
      "title": "强冲击 Campaign",
      "strategy": "large headline with high contrast visual symbol",
      "composition": {},
      "style": {},
      "promptFocus": "提高标题张力和社交传播感",
      "risk": "文字可能压住主体，需要保持安全区"
    }
  ],
  "selectedDirectionId": "bold-campaign"
}
```

### 8.13 provenance

provenance 是资产闭环和治理的基础。

```json
{
  "provenance": {
    "projectId": "default",
    "templateId": "poster-campaign-system",
    "caseIds": ["case-493"],
    "boardId": "board-1",
    "batchRunId": null,
    "batchTaskId": null,
    "createdAt": 1780660000000,
    "updatedAt": 1780660000000
  }
}
```

### 8.14 quality

quality 可以先由规则生成，后续接 LLM。

```json
{
  "quality": {
    "score": 82,
    "issues": [
      {
        "severity": "warning",
        "code": "required_text_too_long",
        "message": "主标题过长，可能影响图片中文字可读性"
      }
    ]
  }
}
```

## 9. Prompt Compiler 规划

未来不建议让 `renderCreatorPrompt()` 直接承担所有 provider 输出。应新增 Prompt Compiler 层。

```text
PromptSpecV1
  -> compilePrompt(spec, target)
      target=copyText
      target=coworkDraft
      target=seedream
      target=gptImage
      target=batchTask
      target=externalConnector
```

### 9.1 Compiler 输出目标

| Target | 用途 | 输出 |
|---|---|---|
| `copyText` | 用户复制 prompt | 可读 prompt 文本 |
| `coworkDraft` | 发送到 Cowork | prompt + PromptSpec + active skills + attachments |
| `seedream` | 图片生成 | provider 适配 prompt、size、references |
| `batchTask` | 批量任务 | 带 batchRunId、batchTaskId 的 task prompt |
| `assetRecipe` | 保存 recipe | 可复用 spec + defaults |
| `externalConnector` | 外部工具 | prompt、素材路径、输出目标 |

### 9.2 Compiler 原则

1. UI 不直接拼 provider prompt。
2. 模板 guidance 和 pitfalls 必须进入 compiler，而不是只作为展示文本。
3. 选择单个 creative direction 后，默认只编译 selected direction。
4. 未选择方向时，可输出方向建议，但执行 prompt 应明确“先选方向”或“生成多个方向”。
5. Provider 不支持的能力必须降级或提示，例如不支持 reference image 时不能静默忽略素材。

## 10. PromptSpec Lint 规划

Prompt Builder 需要一个检查系统，帮助用户在发送生成前发现问题。

### 10.1 规则类型

| 类型 | 示例 | 严重级别 |
|---|---|---|
| 必填缺失 | 没有 subject、taskType、aspectRatio | error / warning |
| 比例冲突 | 表单是 4:5，输出尺寸选择 16:9 | error |
| 文字风险 | requiredText 超长、多个标题同为 hero | warning |
| 模板风险 | 命中 templatePitfalls 中的禁忌 | warning |
| 素材风险 | role=negative 却被当作 reference | error |
| 路径风险 | localPath unavailable 且无 attachment | warning |
| 模型能力风险 | 选择模型不支持 reference image | error |
| 品牌风险 | 使用 bannedWords | error |
| 过度宽泛 | 主题过短、visualStyle 过空 | info / warning |
| 隐私风险 | prompt 中可能包含本地敏感路径或 token | warning |

### 10.2 UI 表达

建议在右侧 Prompt Preview 上方增加 `Quality Check` 区域：

- 总分。
- error / warning / info 数量。
- 一键定位字段。
- 一键应用建议。
- 允许 warning 下继续发送，error 默认阻止直接生成，但允许复制 prompt。

### 10.3 工程实现

建议新增：

```text
src/renderer/utils/creatorPromptLint.ts
src/renderer/utils/creatorPromptLint.test.ts
```

输出结构：

```typescript
interface CreatorPromptLintIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  fieldPath: string;
  messageKey: string;
  suggestionKey?: string;
}
```

UI 文案必须通过 i18n。

## 11. Creative Directions 规划

当前 directions 是固定规则。后续应分三步增强。

### 11.1 P0+：模板感知

根据模板 category 和 styles 决定方向池。

示例：

| 模板类别 | 推荐方向 |
|---|---|
| UI & Interfaces | 高保真产品截图、社媒伪截图、信息仪表盘、直播界面 |
| Posters & Typography | 强标题海报、概念字体、商业 campaign、极简品牌海报 |
| Infographic | 流程图、对比图、科学图谱、模块化说明图 |
| Product & Commerce | 电商主图、生活方式场景、功能卖点图、包装视觉 |

### 11.2 P1：上下文感知

方向生成应参考：

- subject。
- taskType。
- platform。
- templateGuidance。
- templatePitfalls。
- referencePrompt。
- Brand Kit。
- selected Board cards。
- material roles。

### 11.3 P2：Agent 辅助生成

可提供“生成更多方向”按钮，让 Creative Producer 基于 PromptSpec 生成 3-6 个方向。

要求：

1. 每个方向必须有 title、strategy、composition、style、promptFocus、risk。
2. 每个方向必须能独立进入 Batch。
3. 方向需要可保存到 Board。
4. 方向生成结果要可编辑，不能只读。

## 12. Context Pack 规划

Context Pack 需要从“素材清单”升级为“可执行上下文”。

### 12.1 当前能力

当前 Context Pack 包含：

- material role。
- name。
- path。
- mime。
- attachment。
- localPath。
- fallback note。

### 12.2 下一步能力

| 能力 | 说明 |
|---|---|
| 素材摘要 | 对图片素材生成内容摘要 |
| 色彩提取 | 从品牌图、参考图提取主色 |
| 角色约束 | 每个 role 生成明确使用说明 |
| 冲突检测 | 检查 brand/reference/style/negative 的冲突 |
| Board selection 摘要 | 把 Board 卡片压缩为生产上下文 |
| 素材优先级 | primary reference、secondary reference、avoid |
| 可视化预览 | 在 Builder 中展示当前 Context Pack 来源 |

### 12.3 Role 使用策略

| Role | Compiler 行为 |
|---|---|
| `reference` | 参考主体、构图或整体方向，但不强制复制 |
| `style` | 参考色彩、质感、光线、时代感 |
| `brand` | 保留品牌色、logo、语气和禁用词 |
| `source` | 作为事实来源，不作为视觉风格来源 |
| `negative` | 只用于避免，不得作为正向参考 |

## 13. 页面交互规划

### 13.1 顶部 Source Mode

Builder 顶部增加来源状态条。

显示内容：

- 当前模式：案例 Remix / 模板起稿 / 资产变体 / 空白起稿。
- 来源标题。
- templateId / caseIds。
- 一键查看来源。
- 一键清空来源。
- 一键保存为 Recipe。

### 13.2 表单分组

建议初始分组：

1. Brief：任务类型、主题、目标、平台、受众。
2. Subject：主体、产品、人、空间、界面、场景。
3. Text：主标题、副标题、标签、按钮、禁止文字。
4. Composition：比例、布局、镜头、层级、安全区。
5. Style：风格、色彩、氛围、光线、材质。
6. Materials：素材托盘和 role。
7. Output：输出数量、尺寸、模型能力、保存策略。
8. Constraints：负向要求、模板 pitfalls、品牌禁用词。

### 13.3 Prompt Preview

Prompt Preview 应提供三种视图：

| 视图 | 用途 |
|---|---|
| `Final Prompt` | 发送给模型的最终文本 |
| `Structured Spec` | PromptSpec JSON |
| `Diff / Explain` | 说明来源模板、案例和品牌如何影响 prompt |

### 13.4 Actions

动作建议分组：

| 分组 | 动作 |
|---|---|
| 基础 | Copy Prompt、Copy Spec |
| 资产 | Save Prompt Asset、Save as Recipe |
| 执行 | Send to Cowork、Generate with Seedream |
| 批量 | Create Batch、Generate directions |
| 上下文 | Add to Board、Use Board Selection |

## 14. 数据和持久化规划

### 14.1 Prompt Asset

现有 Prompt Asset 需要补充：

- schemaVersion。
- promptSpecVersion。
- parentPromptAssetId。
- recipeId。
- selectedDirectionId。
- materialSnapshot。
- qualityIssues。

### 14.2 Recipe

Recipe 是可复用生产配方，建议后续新增数据模型。

```text
creator_recipes
- id
- project_id
- title
- description
- source_prompt_asset_id
- prompt_spec_json
- default_runtime_json
- default_output_json
- tags_json
- created_at
- updated_at
```

Recipe 用途：

- 周更海报。
- 社媒封面。
- 电商主图。
- 信息图。
- 品牌固定视觉。
- 自动化任务。

### 14.3 Prompt Version

```text
creator_prompt_versions
- id
- prompt_asset_id
- version
- prompt_text
- prompt_spec_json
- change_note
- created_at
```

用途：

- diff。
- rollback。
- 复盘采用率。
- 对比同一 prompt 的模型表现。

## 15. 与 Cowork 的集成规划

### 15.1 当前方式

当前 Cowork draft 是文本兼容方案：

````text
[Creator Studio]
templateId: ...
caseIds: ...

PromptSpec:
```json
...
```

Prompt:
```text
...
```
````

这种方案适合 P0/P1，但后续存在限制：

- 需要正则解析。
- metadata 不稳定。
- 不利于复跑和自动化。
- 不利于 generatedImages 自动关联 batchTask。

### 15.2 目标方式

后续建议扩展 Cowork draft metadata：

```typescript
interface CoworkDraftMetadata {
  domain: 'creator_studio';
  promptSpec: CreatorPromptSpecSnapshot;
  promptText: string;
  activeSkillIds: string[];
  attachments: CoworkAttachment[];
  executionIntent: 'draft' | 'generate' | 'batch-task';
}
```

过渡策略：

1. 保留文本 draft，确保旧 session 可读。
2. 同时写入 metadata。
3. 资产入库优先读 metadata，失败再 fallback 到文本解析。

## 16. 与 Batch 的集成规划

Prompt Builder 和 Batch 不应是两个割裂页面。

### 16.1 Builder 应提供的 Batch 输入

- selected directions。
- output count。
- sizes。
- model capability requirements。
- template variants。
- cost estimate。
- failure policy。

### 16.2 Batch 应反哺 Builder

Batch 结果应允许：

- 选中某张图作为 reference material。
- 从某个 task 回到 Builder 编辑。
- 基于 winning direction 生成更多变体。
- 将高采用率方向保存为 Recipe。

## 17. 与 Board 的集成规划

Board 是 Prompt Builder 的上下文组织层。

### 17.1 Builder -> Board

Builder 可以发送：

- 当前 PromptSpec。
- 当前 final prompt。
- 当前 selected direction。
- 当前素材组合。
- 当前 quality check 结果。

### 17.2 Board -> Builder

Board 可以提供：

- selected cards 的 Context Pack。
- Brand Kit。
- 方向卡片。
- 参考资产。
- 案例组合。

### 17.3 交互建议

Builder 页面增加：

- `Use selected Board cards`。
- `Add current PromptSpec to Board`。
- `Add selected direction to Board`。
- `Open Board context source`。

## 18. 阶段路线图

### 18.1 P0+：可用性和语义清晰

目标：不改动底层架构太多，先让用户理解并稳定使用 Builder。

任务：

1. 增加 Source Mode 状态条。
2. 表单按 Brief / Composition / Style / Materials / Output 分组。
3. 补齐目标类型、色彩偏好、输出数量、受众、构图字段。
4. Prompt Preview 增加 Final Prompt / PromptSpec tabs。
5. 选择 creative direction 后，Final Prompt 默认只展示 selected direction。
6. 增加基础 PromptSpec Lint。
7. 增加“清空来源”和“返回来源详情”。

验收：

- 用户能明确区分案例 Remix、模板起稿、资产变体、空白起稿。
- 从任意入口进入 Builder，来源信息不丢失。
- 长内容不会撑开页面。
- 有 warning 时仍可复制 prompt；有 error 时阻止直接生成。
- `npm run lint`、`npm test -- creator`、`npm run build` 通过。

### 18.2 P1：PromptSpecV1 和 Compiler

目标：把 Prompt Builder 从表单拼接升级为 Prompt-as-Code。

任务：

1. 新增 `PromptSpecV1` 类型和兼容转换函数。
2. 新增 `compileCreatorPrompt()`。
3. 将 copy prompt、Cowork draft、Batch task 迁移到 compiler。
4. 保存 Prompt Asset 时写入 schemaVersion。
5. 增加 PromptSpecV1 单元测试。
6. 保留旧 `CreatorPromptSpec` 到 `PromptSpecV1` 的 adapter。

验收：

- 旧资产仍能作为 reference 打开。
- 新 prompt asset 带 schemaVersion。
- Cowork draft 输出和旧版兼容。
- Batch task 可以从 PromptSpecV1 编译。
- Compiler 测试覆盖中文、英文、模板、案例、素材、方向选择。

### 18.3 P2：智能化和模板动态字段

目标：让 Builder 根据模板、案例和素材动态辅助用户。

任务：

1. 模板库定义 `fieldSchema`。
2. Builder 根据模板显示动态字段。
3. 案例 prompt 逆向拆解为 PromptSpec draft。
4. 自然语言 brief 自动填表。
5. Creative Directions 改为模板感知。
6. Context Pack 增加图片摘要和色彩提取。
7. 模板 useWhen/guidance/pitfalls 在 Builder 中可解释展示。

验收：

- UI Screenshot 模板和 Poster 模板呈现不同字段。
- 从案例进入 Builder 时，能展示“从案例提取的结构”。
- 自动填表结果可编辑，不直接覆盖用户已改字段。
- 方向生成不再固定 4 个通用方向。

### 18.4 P3：Recipe、版本和生产闭环

目标：沉淀可复用生产工作流。

任务：

1. 新增 Recipe 数据模型。
2. 新增 Prompt Version 数据模型。
3. Prompt Asset 支持 diff、fork、rollback。
4. Builder 支持 Save as Recipe。
5. Batch winning direction 可保存为 Recipe。
6. 资产结果可一键回到 Builder 做变体。

验收：

- 用户能创建、复用、导入导出 Recipe。
- 同一 prompt 的版本变化可追踪。
- 生成资产能追溯到 prompt version。
- 资产变体链路可见。

### 18.5 P4：评估、自动化和治理

目标：从“能生成”升级为“能管理生产质量”。

任务：

1. 记录 prompt/spec 的采用率、失败率、收藏率。
2. Builder 展示历史表现。
3. Recipe 支持 scheduled creative workflow。
4. 导出生产包包含 PromptSpec、素材、结果、评审记录。
5. 导出前做敏感信息、来源、授权和未评审资产检查。

验收：

- 用户可以看到模板、模型、方向的表现。
- 自动化任务复用 Recipe。
- 导出包可人工核对关键元数据。

## 19. 建议任务拆解

### 19.0 当前执行状态（2026-06-05）

本节用于把路线图拆成可执行、可验收的当前队列。状态以当前代码为准，后续每个阶段应使用独立分支推进。

| 阶段 | 当前状态 | 已完成证据 | 未闭环项 | 下一步 |
|---|---|---|---|---|
| P0+ | 已完成 | Source Mode、来源条、来源条一键保存 Recipe、表单分组、Preview tabs、selected direction 编译、基础 Lint、来源回跳均已落地 | 无 | 已进入 P1+ 后续阶段 |
| P1 | 已完成 | PromptSpecV1 snapshot、legacy adapter、compiler、Builder 迁移、Batch task 标准块、Asset schemaVersion、Compiler tests 已落地 | Cowork metadata 双写仍属于后续集成增强，不阻塞 P1 compiler 闭环 | 下一阶段推进 P2 Context Pack role strategy |
| P2 | 已完成 | 模板动态字段、案例 prompt 逆向拆解、自然语言填表、模板感知 directions、模板说明展示、Context Pack role strategy、图片尺寸/比例/构图/明暗/对比/色彩摘要已落地 | 无 | 后续可按需升级为 LLM 视觉摘要缓存 |
| P3 | 已完成 | Recipe、Prompt Version、diff、fork、rollback、资产变体链路、Batch winning asset provenance 已落地；批量结果表现统计已在 P4 完成 | 无 | 已进入评估和治理阶段 |
| P4 | 已完成 | Builder 已展示本地 adoption/favorite/selected、Batch completion/failed 统计；模板/模型/方向聚合表现已落地；Recipe 可通过内联排期表单创建 Scheduled Tasks cron 自动化任务；生产包单 JSON manifest 导出已落地；导出前敏感信息、本地路径、授权、用途、来源会话、未评审资产检查已落地 | 无 | 后续进入 P5 时可升级更丰富的自动化模板和交付目标 |

当前 P4 已采用前序确认的推荐决策：

1. Recipe 自动化后续复用现有 scheduled task 系统；当前先完成手动导出和复用闭环。
2. 生产包第一版使用单 JSON manifest，后续再升级 zip 或 WeSight package。
3. 评估指标第一版统计本地 adoption/favorite/selected、Batch completed/failed/skipped，不先接真实成本和失败率接口。

### 19.1 P0+ 任务

| 编号 | 任务 | 文件 | 验收 |
|---|---|---|---|
| PB-0-01 | Source Mode 类型和文案 | `src/renderer/types/creatorStudio.ts`、`i18n.ts` | 四种模式均有中英文文案 |
| PB-0-02 | Builder 顶部来源条 | `CreatorStudioView.tsx` | 显示模式、来源、templateId、caseIds |
| PB-0-03 | 表单分组 | `CreatorStudioView.tsx` | 字段按组展示，移动端不溢出 |
| PB-0-04 | 扩展表单字段 | `creatorStudio.ts`、types、tests | taskType、audience、colorPreference、outputCount 进入 spec |
| PB-0-05 | Prompt Preview tabs | `CreatorStudioView.tsx` | Final Prompt / PromptSpec 可切换 |
| PB-0-06 | 方向选择编译修正 | `creatorStudio.ts` | 选中方向后 Final Prompt 不再混入全部方向 |
| PB-0-07 | 基础 Lint | `creatorPromptLint.ts` | 缺字段、比例冲突、文字过长有提示 |
| PB-0-08 | 测试补充 | `creatorStudio.test.ts`、`creatorPromptLint.test.ts` | 覆盖入口、lint、prompt 渲染 |

### 19.2 P1 任务

| 编号 | 任务 | 文件 | 验收 |
|---|---|---|---|
| PB-1-01 | PromptSpecV1 类型 | `src/shared/creatorStudio/types.ts` | schemaVersion 和分层字段定义完成 |
| PB-1-02 | Legacy adapter | `creatorPromptSpecAdapter.ts` | 旧 spec 可转换到 V1 |
| PB-1-03 | Prompt Compiler | `creatorPromptCompiler.ts` | 支持 copyText、coworkDraft、batchTask |
| PB-1-04 | Builder 迁移 compiler | `CreatorStudioView.tsx` | UI 不直接拼最终 prompt |
| PB-1-05 | Batch 迁移 compiler | `CreatorBatchPanel.tsx` | task prompt 从 compiler 生成 |
| PB-1-06 | Asset 写 schemaVersion | main store 和 IPC | 新资产有 schemaVersion，旧资产可读 |
| PB-1-07 | 测试补充 | tests | Compiler 和 adapter 覆盖主要入口 |

### 19.3 P2 任务

| 编号 | 任务 | 文件 | 验收 |
|---|---|---|---|
| PB-2-01 | 模板 fieldSchema | data import / template types | 不同模板字段不同 |
| PB-2-02 | 动态字段 UI | Builder component | 模板字段可编辑并进入 spec |
| PB-2-03 | 案例 prompt 拆解 | `creatorPromptReverseEngineer.ts` | 可从 referencePrompt 提取结构草案 |
| PB-2-04 | 自然语言填表 | Cowork / local helper | 用户 brief 能生成表单 draft |
| PB-2-05 | 模板感知 directions | `creatorStudio.ts` 或新模块 | UI/Poster/Infographic 方向不同 |
| PB-2-06 | Context Pack 分析 | material analyzer | 图片素材有尺寸、比例、构图、明暗、对比、色彩摘要 |

## 20. 测试策略

### 20.1 单元测试

必须覆盖：

- 从案例 seed 构建 PromptSpec。
- 从模板 seed 构建 PromptSpec。
- 从资产 seed 构建 PromptSpec。
- legacy spec 到 PromptSpecV1。
- Prompt Compiler 中文输出。
- Prompt Compiler 英文输出。
- selected direction 编译。
- Context Pack role 渲染。
- Lint error / warning。
- Batch task 编译。

### 20.2 集成测试

建议覆盖：

- 保存 Prompt Asset 后重新作为 reference 打开。
- Board selected cards 生成 Context Pack 后进入 Builder。
- Builder 创建 Batch run。
- Cowork draft 带 attachments。
- Seedream 未配置时不阻塞 copy prompt。

### 20.3 手工验收

关键路径：

1. 从案例库选择一个案例进入 Builder。
2. 修改主题和文字。
3. 选择一个 creative direction。
4. 检查 lint。
5. 复制 final prompt。
6. 保存 Prompt Asset。
7. 加入 Board。
8. 创建 Batch run。
9. 从 Batch task 发送 Cowork。
10. 生成结果入资产库，并从资产库回到 Builder 做变体。

## 21. 风险和约束

| 风险 | 说明 | 缓解 |
|---|---|---|
| Schema 过早复杂化 | 一次性重构太大，影响现有稳定性 | 保留 legacy adapter，分阶段迁移 |
| UI 变得太重 | Builder 可能变成复杂专业工具 | 默认显示核心字段，高级字段折叠 |
| Prompt 质量不可验证 | Prompt 好坏主观 | 先做规则 lint，再用结果指标校准 |
| Provider 差异大 | 不同模型参数和能力不同 | 用 capability registry 和 compiler target 处理 |
| Cowork metadata 改动影响面大 | 涉及 session、draft、资产解析 | 先双写文本和 metadata |
| 素材分析成本高 | 图片摘要和色彩提取可能耗时 | 懒分析、缓存、用户触发 |
| 隐私和敏感信息 | 本地路径、品牌素材、token 可能进入 prompt | Lint 和导出前检查敏感信息 |

## 22. 非目标

近期不做：

1. 完整节点编辑器。
2. 专业像素级设计编辑器。
3. 云端 DAM。
4. 多人实时协作。
5. 自动发布到社媒或广告平台。
6. 强绑定单一图片模型。
7. 用 UI 硬编码第三方 provider 特殊逻辑。

## 23. 推荐下一步

建议按下面顺序推进：

1. 先做 P0+，把 Builder 模式、表单分组、Lint 和方向选择语义修正好。
2. 再做 P1，把 PromptSpecV1 和 Prompt Compiler 建起来。
3. 然后做 P2 的模板动态字段和案例 prompt 拆解。
4. 最后做 Recipe、Version、评估指标和自动化。

最优先的第一个 PR：

```text
fix/feat(creator): clarify prompt builder modes and add prompt quality checks
```

建议包含：

- Source Mode 状态条。
- 表单分组。
- 基础 Lint。
- selected direction prompt 编译修正。
- 对应单元测试。
