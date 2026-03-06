/**
 * v2 主入口 - 飞书 Claude Bot
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { Client, LogLevel } from '@larksuiteoapi/node-sdk';
import * as http from 'http';
import { spawn } from 'child_process';
import { config } from '../config';
import { MessageQueue } from './queue';
import { SessionManager } from './session';
import { HealthChecker } from './health';
import {
  createClaudeResponseCard,
  createSimpleCard,
  createSessionListCard,
  createHelpCard,
  createErrorCard,
  createSuccessCard,
  createProcessingCard,
} from './card';

// 创建组件
const client = new Client({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  appType: 'self_build',
  domain: 'https://open.feishu.cn',
  logLevel: LogLevel.error,
});

const queue = new MessageQueue(3);
const sessionManager = new SessionManager();
const healthChecker = new HealthChecker(
  () => queue.getStats(),
  () => sessionManager.getSessionStats()
);

// 启动
console.log('正在启动 v2 服务...');
console.log('✅ 消息队列已初始化');
console.log('✅ 会话管理器已初始化');
console.log('✅ 健康检查器已初始化');

// 健康检查服务
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthChecker.getSimpleStatus()));
  } else if (req.url === '/health/detail') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(healthChecker.getStatus()));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

healthServer.listen(config.server.port, () => {
  console.log(`✅ 健康检查服务: http://localhost:${config.server.port}/health`);
});

healthChecker.checkClaude();

// 长连接
async function startLongConnection() {
  const { WS } = await import('@larksuiteoapi/node-sdk/cjs');
  const ws = WS({
    client,
    logger: client.logger,
    domain: 'https://open.feishu.cn',
  });

  ws.on('start', () => console.log('✅ 长连接已建立'));

  ws.on('im.message.receive_v1', async (data: any) => {
    try {
      await handleMessage(data);
    } catch (error) {
      console.error('处理消息出错:', error);
    }
  });

  ws.on('error', (error: Error) => console.error('长连接错误:', error.message));

  ws.on('stop', () => {
    console.log('长连接已断开，5秒后重连...');
    setTimeout(() => ws.start(), 5000);
  });

  ws.start();
}

async function handleMessage(event: any) {
  const { sender, message } = event;
  const chatId = message.chat_id;
  const messageId = message.message_id;

  if (message.message_type !== 'text') return;

  const content = JSON.parse(message.content);
  const text = content.text || '';

  if (config.trigger.prefix && !text.startsWith(config.trigger.prefix)) return;

  if (config.security.allowedUsers.length > 0) {
    const userId = sender.sender_id?.user_id || '';
    if (userId && !config.security.allowedUsers.includes(userId)) return;
  }

  let actualMessage = config.trigger.prefix
    ? text.slice(config.trigger.prefix.length)
    : text;
  actualMessage = actualMessage.trim();

  if (!actualMessage) return;

  console.log(`[消息] ${actualMessage.slice(0, 50)}...`);

  // 命令处理
  if (actualMessage === '/help') {
    await sendCardReply(messageId, createHelpCard());
    return;
  }

  if (actualMessage === '/clear') {
    sessionManager.clearHistory(chatId);
    await sendCardReply(messageId, createSuccessCard('会话历史已清除'));
    return;
  }

  if (actualMessage === '/new') {
    sessionManager.clearHistory(chatId);
    await sendCardReply(messageId, createSuccessCard('已开始新会话'));
    return;
  }

  if (actualMessage.startsWith('/switch ')) {
    const name = actualMessage.slice(8).trim();
    try {
      sessionManager.switchToSession(chatId, name);
      await sendCardReply(messageId, createSuccessCard(`已切换到: ${name}`));
    } catch (error) {
      await sendCardReply(messageId, createErrorCard(error instanceof Error ? error.message : '切换失败'));
    }
    return;
  }

  if (actualMessage === '/sessions') {
    const sessions = sessionManager.listSessions(chatId);
    await sendCardReply(messageId, createSessionListCard(sessions));
    return;
  }

  if (actualMessage.startsWith('/delete ')) {
    const name = actualMessage.slice(8).trim();
    try {
      sessionManager.deleteSession(chatId, name);
      await sendCardReply(messageId, createSuccessCard(`已删除: ${name}`));
    } catch (error) {
      await sendCardReply(messageId, createErrorCard(error instanceof Error ? error.message : '删除失败'));
    }
    return;
  }

  if (actualMessage === '/health') {
    const health = healthChecker.getStatus();
    await sendCardReply(messageId, createSimpleCard(
      '系统状态',
      `**状态**: ${health.status}\n**运行时间**: ${Math.floor(health.uptime / 1000)}秒\n**队列**: ${health.queue.pending} 待处理`,
      '📊'
    ));
    return;
  }

  if (actualMessage === '/stats') {
    const queueStats = queue.getStats();
    await sendCardReply(messageId, createSimpleCard(
      '统计',
      `**已处理**: ${queueStats.totalProcessed}\n**待处理**: ${queueStats.pending}\n**失败**: ${queueStats.totalFailed}`,
      '📊'
    ));
    return;
  }

  // 注册处理器并加入队列
  if (!queue.hasHandler(chatId)) {
    queue.registerHandler(chatId, (item) => processMessage(item));
  }

  queue.enqueue(messageId, chatId, actualMessage);
}

async function processMessage(item: { messageId: string; chatId: string; message: string }) {
  const { messageId, chatId, message } = item;

  // 添加反应
  await addReaction(messageId, '👀');

  // 发送处理中状态
  const statusMsg = await sendCardReply(messageId, createProcessingCard());

  // 获取会话和工作目录
  sessionManager.getOrCreateSession(chatId);
  const workDir = sessionManager.getWorkDir(chatId);

  // 添加用户消息到历史
  sessionManager.addMessage(chatId, 'user', message);

  // 获取历史
  const history = sessionManager.getHistory(chatId);

  // 调用 Claude
  try {
    const response = await callClaude(message, workDir, history);

    // 添加回复到历史
    sessionManager.addMessage(chatId, 'assistant', response);

    // 更新消息
    await client.im.message.update({
      path: { message_id: statusMsg?.data?.message_id || messageId },
      data: { content: JSON.stringify(createClaudeResponseCard(response)) },
    });

    // 添加成功反应
    await addReaction(messageId, '✅');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    await client.im.message.update({
      path: { message_id: statusMsg?.data?.message_id || messageId },
      data: { content: JSON.stringify(createErrorCard(errorMessage)) },
    });
    await addReaction(messageId, '❌');
  }
}

async function callClaude(
  message: string,
  workDir: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = ['-p', message, '--print'];

    if (history.length > 0) {
      const context = history.map(h => `[${h.role}]: ${h.content}`).join('\n\n');
      args.unshift('-c', context);
    }

    const proc = spawn(config.claude.path, args, {
      cwd: workDir,
      env: { ...process.env, TERM: 'dumb' },
      timeout: config.claude.timeout,
    });

    let output = '';
    proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    proc.on('close', (code: number) => {
      if (code === 0) resolve(output.trim() || '(无输出)');
      else reject(new Error(`Claude 退出码: ${code}`));
    });

    proc.on('error', (err: Error) => reject(new Error(`Claude 启动失败: ${err.message}`)));
  });
}

async function sendCardReply(messageId: string, card: any) {
  try {
    return await client.im.message.reply({
      path: { message_id: messageId },
      params: { receive_id_type: 'chat_id' },
      data: {
        content: JSON.stringify(card),
        msg_type: 'interactive',
      },
    });
  } catch (error) {
    console.error('发送消息失败:', error);
    return null;
  }
}

async function addReaction(messageId: string, emoji: string) {
  try {
    await client.im.messageReactions.create({
      path: { message_id: messageId },
      params: { reaction_type: 'emoji' },
      data: { reaction_type: 'emoji', reaction: emoji },
    });
  } catch {
    // 忽略错误
  }
}

// 启动
startLongConnection().catch(console.error);
