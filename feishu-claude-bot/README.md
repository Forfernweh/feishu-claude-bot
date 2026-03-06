# 飞书 Claude Bot

在飞书中使用 Claude AI 的机器人。

## 功能特点

- 🤖 基于 Claude CLI 的 AI 对话
- 💬 支持多会话管理（命名会话、会话切换、历史保持）
- 📊 消息队列异步处理，- 💾 SQLite 持久化存储
- ❤️ 健康检查端点

## 快速开始

### 1. 前置要求

- Node.js v18+
- Claude CLI（已登录）
- 飞书开发者账号

### 2. 安装

```bash
cd feishu-claude-bot
npm install
```

### 3. 配置

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. 鎷取飞书凭证

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 在「凭证与基础信息」获取 App ID 和 App Secret
4. 在「权限管理」开通：
   - `im:message` - 获取与发送消息
   - `im:message:send_as_bot` - 以应用身份发消息
5. 在「事件订阅」开启「使用长连接接收事件」，添加：
   - `im.message.receive_v1` - 接收消息

### 5. 启动

```bash
npm run dev
```

## 使用方法

在飞书群聊中发送消息即可触发机器人回复。

### 命令列表

| 命令 | 说明 |
|------|------|
| `/help` | 查看帮助 |
| `/new <名称>` | 创建命名会话 |
| `/new` | 清除当前会话历史 |
| `/switch <名称>` | 切换到已有会话 |
| `/sessions` | 列出所有会话 |
| `/delete <名称>` | 删除指定会话 |
| `/clear` | 清除当前会话历史 |
| `/health` | 查看系统健康状态 |
| `/stats` | 查看统计信息 |

## 项目结构

```
feishu-claude-bot/
├── src/
│   ├── config.ts        # 配置
│   └── v2/
│       ├── index.ts      # 主入口
│       ├── card.ts        # 卡片消息
│       ├── session.ts     # 会话管理
│       ├── queue.ts       # 消息队列
│       └── health.ts      # 健康检查
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 健康检查

- `GET /health` - 简单健康状态
- `GET /health/detail` - 详细健康状态

## 注意事项

1. **安全**: 不要将 `.env` 文件提交到版本控制
2. **权限**: 确保已开通所有必要的飞书 API 权限
3. **超时**: Claude 响应默认 3 分钟超时

## License

MIT
