/**
 * 飞书卡片消息格式化模块
 */

const LANGUAGE_MAP: Record<string, string> = {
  'js': 'JavaScript', 'javascript': 'JavaScript',
  'ts': 'TypeScript', 'typescript': 'TypeScript',
  'py': 'Python', 'python': 'Python',
  'go': 'Go', 'java': 'Java',
  'sh': 'Shell', 'bash': 'Shell', 'shell': 'Shell',
  'sql': 'SQL', 'html': 'HTML', 'css': 'CSS',
  'json': 'JSON', 'yaml': 'YAML', 'yml': 'YAML',
  'md': 'Markdown', 'markdown': 'Markdown',
};

function parseContent(text: string): { type: 'text' | 'code'; content: string; language?: string }[] {
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim();
      if (textContent) parts.push({ type: 'text', content: textContent });
    }

    const language = match[1] || 'plaintext';
    const code = match[2].trim();
    parts.push({
      type: 'code',
      content: code,
      language: LANGUAGE_MAP[language.toLowerCase()] || language,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex).trim();
    if (textContent) parts.push({ type: 'text', content: textContent });
  }

  return parts;
}

function textToRichText(text: string): any[] {
  const elements: any[] = [];
  let processed = text;

  // 处理行内代码
  processed = processed.replace(/`([^`]+)`/g, '<font color="grey">$1</font>');
  // 处理加粗
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  // 处理斜体
  processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');

  const lines = processed.split('\n');
  for (const line of lines) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: line || ' ' } });
  }

  return elements;
}

function createCodeBlock(code: string, language: string): any {
  const MAX_CODE_LENGTH = 30000;
  if (code.length > MAX_CODE_LENGTH) {
    code = code.slice(0, MAX_CODE_LENGTH) + '\n... (内容过长已截断)';
  }

  return {
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**${language}**\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\``,
    },
  };
}

export function createClaudeResponseCard(response: string): any {
  const parts = parseContent(response);
  const elements: any[] = [];

  for (const part of parts) {
    if (part.type === 'code') {
      elements.push(createCodeBlock(part.content, part.language || 'plaintext'));
    } else {
      elements.push(...textToRichText(part.content));
    }
  }

  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'note',
    elements: [{
      tag: 'lark_md',
      content: `_🤖 Claude · ${new Date().toLocaleTimeString('zh-CN')}_`,
    }],
  });

  return { config: { wide_screen_mode: true }, elements };
}

export function createSimpleCard(title: string, content: string, icon?: string): any {
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'plain_text', content: `${icon || '📌'} ${title}` } },
      { tag: 'hr' },
      ...textToRichText(content),
    ],
  };
}

export function createSuccessCard(message: string): any {
  return {
    config: { wide_screen_mode: true },
    elements: [{ tag: 'div', text: { tag: 'plain_text', content: `✅ ${message}` } }],
  };
}

export function createErrorCard(error: string, suggestion?: string): any {
  const elements: any[] = [
    { tag: 'div', text: { tag: 'plain_text', content: '❌ 发生错误' }, text_color: 'red' },
    { tag: 'hr' },
    { tag: 'div', text: { tag: 'lark_md', content: `\`\`\`\n${error.slice(0, 1000)}\n\`\`\`` } },
  ];

  if (suggestion) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💡 **建议**: ${suggestion}` } });
  }

  return { config: { wide_screen_mode: true }, elements };
}

export function createProcessingCard(action: string = '正在思考', elapsed?: number): any {
  const timeInfo = elapsed !== undefined ? ` (${elapsed}秒)` : '';
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `⏳ ${action}${timeInfo}...` } },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '💡 长时间任务会持续更新状态' }] },
    ],
  };
}

export function createSessionListCard(sessions: Array<{
  name: string; messageCount: number; lastActiveAt: number; isCurrent: boolean;
}>): any {
  const elements: any[] = [
    { tag: 'div', text: { tag: 'plain_text', content: '📋 会话列表' } },
    { tag: 'hr' },
  ];

  if (sessions.length === 0) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '_暂无活跃会话，发送消息即可开始_' } });
  } else {
    for (const session of sessions) {
      const currentMark = session.isCurrent ? ' ← **当前**' : '';
      const timeAgo = formatTimeAgo(session.lastActiveAt);

      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `${session.isCurrent ? '▶' : '◦'} **${session.name}**${currentMark}\n${session.messageCount} 条消息 · ${timeAgo}`,
        },
      });
    }

    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'note',
      elements: [{ tag: 'lark_md', content: '`/switch <名称>` 切换会话\n`/delete <名称>` 删除会话' }],
    });
  }

  return { config: { wide_screen_mode: true }, elements };
}

export function createHelpCard(): any {
  return {
    config: { wide_screen_mode: true },
    elements: [
      { tag: 'div', text: { tag: 'plain_text', content: '🤖 飞书 Claude Bot 帮助' } },
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content:
            '**📝 基础命令**\n\n' +
            '`/new <名称>` - 创建命名会话\n' +
            '`/new` - 清除当前历史\n' +
            '`/switch <名称>` - 切换会话\n' +
            '`/sessions` - 列出所有会话\n' +
            '`/delete <名称>` - 删除会话\n\n' +
            '**📊 系统**\n\n' +
            '`/health` - 健康状态\n' +
            '`/stats` - 统计信息\n\n' +
            '**🔍 搜索**\n\n' +
            '`/search <关键词>` - 搜索历史消息',
        },
      },
    ],
  };
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}
