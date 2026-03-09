# 飞书 Claude Bot

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

在飞书中使用 Claude AI 的智能对话机器人，支持多会话管理、历史记录持久化、消息队列处理。

## 功能特点

- **AI 对话** - 基于 Claude CLI 的智能对话能力
- **多会话管理** - 支持创建、切换、删除命名会话
- **历史记录** - SQLite 持久化存储，重启不丢失
- **消息队列** - 异步处理消息，避免阻塞
- **卡片消息** - 美观的飞书卡片格式，支持代码高亮
- **健康检查** - 提供 HTTP 健康检查端点

## 快速开始-也可以将该文件交给Claude，让他帮你配置

### 1. 前置要求

- Node.js v18 或更高版本
- Claude CLI（[安装指南](https://docs.anthropic.com/claude/docs/claude-cli)）
- 飞书开发者账号

### 2. 克隆项目

```bash
git clone https://github.com/Forfernweh/feishu-claude-bot.git
cd feishu-claude-bot
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填写飞书应用凭证：

```env
# 飞书应用配置（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Claude 路径（可选，默认自动检测）
# CLAUDE_PATH=/usr/local/bin/claude

# 服务端口（可选，默认 3000）
# PORT=3000
```

### 5. 获取飞书凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 这里有完整的飞书机器人配置指南：https://cloud.tencent.com/developer/article/2626151
3. 要注意是否开通以下事件：
   - `im:message` - 获取与发送消息
   - `im:message:send_as_bot` - 以应用身份发消息
   - `im.message.receive_v1` - 接收消息

### 6. 启动服务

开发模式（热重载）：

```bash
npm run dev
```

生产模式：

```bash
npm run build
npm start
```

启动成功后会看到：

```
✅ 消息队列已初始化
✅ 会话管理器已初始化
✅ 健康检查器已初始化
✅ 健康检查服务: http://localhost:3000/health
✅ 长连接已建立
```

## 使用方法

在飞书群聊或私聊中直接发送消息即可触发机器人回复。

### 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助信息 | `/help` |
| `/new` | 开始新会话（清除当前历史） | `/new` |
| `/new <名称>` | 创建/切换到命名会话 | `/new project-a` |
| `/switch <名称>` | 切换到已有会话 | `/switch project-a` |
| `/sessions` | 列出所有会话 | `/sessions` |
| `/delete <名称>` | 删除指定会话 | `/delete project-a` |
| `/clear` | 清除当前会话历史 | `/clear` |
| `/health` | 查看系统健康状态 | `/health` |
| `/stats` | 查看统计信息 | `/stats` |

### 使用示例

```
用户: 帮我写一个 Python 的 Hello World
Bot: [回复代码和解释]

用户: /new code-review
Bot: ✅ 已创建会话: code-review

用户: /sessions
Bot: [显示会话列表]
```

## 项目结构

```
feishu-claude-bot/
├── src/
│   ├── config.ts          # 配置管理
│   └── v2/
│       ├── index.ts       # 主入口
│       ├── card.ts        # 飞书卡片消息
│       ├── session.ts     # 会话管理
│       ├── queue.ts       # 消息队列
│       └── health.ts      # 健康检查
├── package.json
├── tsconfig.json
├── .env.example           # 环境变量模板
├── .gitignore
└── README.md
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 简单健康状态检查 |
| `/health/detail` | GET | 详细健康状态（内存、队列、会话等） |

## 配置说明

### 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `FEISHU_APP_ID` | 是 | - | 飞书应用 ID |
| `FEISHU_APP_SECRET` | 是 | - | 飞书应用密钥 |
| `CLAUDE_PATH` | 否 | `/usr/local/bin/claude` | Claude CLI 路径 |
| `PORT` | 否 | `3000` | 健康检查服务端口 |

### 高级配置

在 `src/config.ts` 中可以配置：

```typescript
// 触发前缀（空字符串表示所有消息都触发）
trigger: {
  prefix: '',  // 例如设置为 'bot' 则需要 @bot 才能触发
}

// 用户白名单（空数组表示所有用户都可使用）
security: {
  allowedUsers: [],  // 例如 ['ou_xxx', 'ou_yyy']
}

// Claude 超时时间
claude: {
  timeout: 180000,  // 3 分钟
}
```

## 常见问题

### 1. 机器人不回复消息

- 检查飞书应用权限是否正确配置
- 确认事件订阅已开启并添加了 `im.message.receive_v1`
- 查看控制台是否有错误日志

### 2. Claude 调用失败

- 确认 Claude CLI 已正确安装并登录
- 检查 `CLAUDE_PATH` 配置是否正确
- 在终端运行 `claude --version` 验证

### 3. 会话数据存储在哪里

会话数据存储在项目目录下的 `.data/sessions.db`（SQLite 数据库）。

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript 5.0+
- **飞书 SDK**: @larksuiteoapi/node-sdk
- **数据库**: better-sqlite3
- **构建工具**: tsx / tsc

## 许可证

[MIT License](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request！

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Forfernweh">Forfernweh</a>
</p>
