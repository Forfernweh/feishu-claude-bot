/**
 * 配置文件
 */

export const config = {
  // 飞书应用配置
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
  },

  // 触发配置
  trigger: {
    prefix: '', // 触发前缀，空字符串表示所有消息都触发
  },

  // 安全配置
  security: {
    allowedUsers: [] as string[], // 允许的用户ID列表，空表示所有用户
  },

  // Claude 配置
  claude: {
    path: process.env.CLAUDE_PATH || '/usr/local/bin/claude',
    timeout: 180000, // 3分钟超时
  },

  // 服务配置
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
};
