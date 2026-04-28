# TIA Voice

TIA Voice 是一款开源的桌面端上下文感知语音助手。按住全局快捷键说话，语音会被实时转写、智能润色，并自动粘贴到你正在使用的应用中。此外还提供了文本朗读播放器和智能划词工具栏——远不止是一款单纯的语音输入工具。

## 与同类产品的对比

TIA Voice 的灵感来源于 **MacWhisper**、**Wispr Flow**、**Superwhisper** 等桌面语音输入工具，但在纯语音输入之外实现了多项独特能力：

| 功能 | TIA Voice | MacWhisper | Wispr Flow | Superwhisper |
|---|---|---|---|---|
| 全局按住说话语音输入 | ✅ | ✅ | ✅ | ✅ |
| LLM 智能润色与改写 | ✅ | ❌ | ✅ | ✅ |
| 自定义后处理预设 | ✅ | ❌ | ❌ | ❌ |
| 词典规范化 | ✅ | ❌ | ❌ | ❌ |
| 意图路由（口述/编辑/问答） | ✅ | ❌ | ❌ | ❌ |
| 划词工具栏 + 朗读 | ✅ | ❌ | ❌ | ❌ |
| TTS 朗读 + 逐词高亮 | ✅ | ❌ | ❌ | ❌ |
| 多 AI 提供商（DashScope / OpenAI） | ✅ | ✅（本地） | ✅ | ✅ |
| 自带 API Key，数据不出境 | ✅ | N/A | ✅ | ✅ |
| 开源 | ✅ | ❌ | ❌ | ❌ |

## 核心功能

### 语音输入与智能粘贴
按住说话键（macOS 为 `右 Command` / Windows 为 `右 Alt`），自然地说出你想输入的内容，松开即可。TIA Voice 会将你的语音转写为文字，经过 LLM 智能润色后，自动粘贴到当前光标所在位置。

### 智能意图路由
TIA Voice 能理解上下文并自动切换行为模式：

- **口述模式** — 无文本选中，光标在输入框内：直接转写并粘贴你的语音内容。
- **编辑模式** — 输入框内有文本被选中：语音指令将用于改写选中的文本（例如：选中一段话，说「把这句改得更正式一些」）。
- **问答模式** — 在非输入框区域选中文本（如在浏览器中）：你的语音问题会基于选中的文本内容进行回答。

### 划词工具栏
在浏览器中选中文本后，会自动弹出一个浮动工具栏：

- **朗读选中文本** — 通过 CosyVoice TTS 将选中文本转换为自然的语音朗读，并在播放窗口中逐词高亮同步显示。

你还可以通过 `Control+T` 快捷键主动唤出划词工具栏。

### TTS 朗读播放器
除了划词工具栏外，TIA Voice 还内建了完整的 TTS 播放器：

- 基于阿里云 DashScope **CosyVoice v3** 模型，提供高质量、自然流畅的语音输出。
- 单词级时间戳同步——播放音频时转录文字逐词高亮。
- 紧凑的悬浮播放窗口支持播放/暂停、进度拖拽、时间显示。

### LLM 后处理与预设
你说的话会经过 LLM 智能润色：

- 自动修正标点、语法，优化措辞，同时不改变原意。
- **内置预设**：正式风格（专业语气）和随意风格（口语化表达）。
- **自定义预设**：可以定义自己的系统提示词，适配特定写作风格。
- 每个预设都可以独立开关后处理功能。

### 词典规范化
自定义短语映射（例如 `"Buildmind"` → `"BuildMind"`），自动规范化常被语音识别错误的专有名词和术语。词典条目会以高优先级规则注入到 LLM 提示词中。

### 使用统计
在首页仪表盘查看你的语音使用数据：累计输入字数、平均语速（WPM）、转录次数，以及可滚动的历史记录列表。

### 多 AI 提供商支持
可自由选择 AI 后端：

- **ASR（语音转文字）**：DashScope Qwen ASR Flash / OpenAI Whisper
- **LLM（润色与意图理解）**：DashScope Qwen3.5 Flash / OpenAI GPT
- **TTS（文字转语音）**：DashScope CosyVoice v3

自带 API Key，数据直接通过你选择的 AI 服务商处理，不会经过任何第三方服务器。

## 安装与运行

```bash
pnpm install
pnpm dev
```

首次启动后：

1. 在引导对话框中输入你的 DashScope（或 OpenAI）API Key。
2. 根据提示授予 macOS **辅助功能**权限（全局快捷键和自动粘贴需要）。
3. 使用默认的按住说话快捷键开始语音输入。

## 开发

```bash
pnpm dev          # 开发模式启动
pnpm test:run     # 运行测试
pnpm typecheck    # 类型检查
pnpm lint         # 代码检查
```

## 构建

```bash
pnpm build        # 当前平台构建
pnpm build:mac    # macOS 分发包
pnpm build:win    # Windows 分发包
pnpm build:linux  # Linux 分发包
```

## 技术栈

- **运行时**：Electron + React + TypeScript
- **样式**：Tailwind CSS + shadcn/ui + Radix UI
- **AI SDK**：Vercel AI SDK（`ai` 包）
- **全局快捷键**：`uiohook-napi`（原生模块）
- **剪贴板与粘贴**：`@nut-tree-fork/nut-js`
- **文本选中监听**：`selection-hook`（原生模块，支持 Chrome 系列浏览器）
- **TTS**：DashScope CosyVoice API，支持单词级时间戳

## 注意事项

- 默认按住说话键：macOS 为 `右 Command`，Windows 为 `右 Alt`。可在设置中切换为 `右 Option` 或 `右 Control`。
- DashScope 请求默认使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`。如需代理，可通过环境变量 `DASHSCOPE_BASE_URL` 覆盖。
- API Key 仅存储在当前设备的本地应用设置中，除直接 API 调用外不会离开你的设备。
- `uiohook-napi` 是原生依赖。如果安装后全局热键初始化失败，请运行 `pnpm rebuild uiohook-napi` 并重启应用。
