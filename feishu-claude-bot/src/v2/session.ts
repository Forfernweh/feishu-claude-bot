/**
 * 会话管理模块 - 支持命名会话
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Session {
  id: string;
  chatId: string;
  name: string;
  userId: string;
  workDir: string;
  createdAt: number;
  lastActiveAt: number;
  status: 'active' | 'archived';
  messageCount: number;
  isCurrent: boolean;
}

export class SessionManager {
  private db: Database.Database;
  private currentSessionCache: Map<string, { session: Session; messages: Message[] }> = new Map();
  private sessionTimeout: number;
  private defaultWorkDir: string;

  constructor(dataDir?: string, timeoutMinutes: number = 60) {
    const dbPath = dataDir
      ? path.join(dataDir, 'sessions.db')
      : path.join(process.cwd(), '.data', 'sessions.db');

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.sessionTimeout = timeoutMinutes * 60 * 1000;
    this.defaultWorkDir = process.env.HOME || os.homedir();

    this.initDatabase();
    this.loadCurrentSessions();
    console.log(`[Session] SQLite 数据库已初始化: ${dbPath}`);
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'default',
        user_id TEXT,
        work_dir TEXT,
        created_at INTEGER,
        last_active_at INTEGER,
        status TEXT DEFAULT 'active',
        message_count INTEGER DEFAULT 0,
        is_current INTEGER DEFAULT 1,
        UNIQUE(chat_id, name)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        timestamp INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  private loadCurrentSessions(): void {
    const sessions = this.db.prepare(`
      SELECT * FROM sessions WHERE status = 'active' AND is_current = 1
    `).all() as Session[];

    for (const session of sessions) {
      const messages = this.db.prepare(`
        SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp
      `).all(session.id) as Message[];

      session.workDir = (session as any).work_dir || this.defaultWorkDir;
      session.isCurrent = Boolean((session as any).is_current);

      this.currentSessionCache.set(session.chatId, { session, messages });
    }

    console.log(`[Session] 已加载 ${sessions.length} 个当前会话`);
  }

  getOrCreateSession(chatId: string, userId?: string): Session {
    let data = this.currentSessionCache.get(chatId);

    if (data && Date.now() - data.session.lastActiveAt > this.sessionTimeout) {
      this.archiveSession(data.session.id);
      data = undefined;
    }

    if (!data) {
      const existingSession = this.db.prepare(`
        SELECT * FROM sessions WHERE chat_id = ? AND is_current = 1 AND status = 'active'
      `).get(chatId) as Session & { work_dir: string; is_current: number } | undefined;

      if (existingSession) {
        existingSession.workDir = existingSession.work_dir || this.defaultWorkDir;
        existingSession.isCurrent = Boolean(existingSession.is_current);

        const messages = this.db.prepare(`
          SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp
        `).all(existingSession.id) as Message[];

        data = { session: existingSession as Session, messages };
        this.currentSessionCache.set(chatId, data);
      } else {
        return this.createNamedSession(chatId, 'default', userId);
      }
    }

    return data!.session;
  }

  createNamedSession(chatId: string, name: string, userId?: string): Session {
    const cleanName = name.trim().slice(0, 50);
    if (!cleanName) throw new Error('会话名称无效');

    const existing = this.db.prepare(`
      SELECT * FROM sessions WHERE chat_id = ? AND name = ?
    `).get(chatId, cleanName) as Session & { work_dir: string } | undefined;

    if (existing) return this.switchToSession(chatId, cleanName);

    this.db.prepare(`UPDATE sessions SET is_current = 0 WHERE chat_id = ?`).run(chatId);

    const session: Session = {
      id: `sid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      chatId,
      name: cleanName,
      userId: userId || 'unknown',
      workDir: this.defaultWorkDir,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      status: 'active',
      messageCount: 0,
      isCurrent: true,
    };

    this.db.prepare(`
      INSERT INTO sessions (id, chat_id, name, user_id, work_dir, created_at, last_active_at, status, message_count, is_current)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      session.id, session.chatId, session.name, session.userId, session.workDir,
      session.createdAt, session.lastActiveAt, session.status, session.messageCount
    );

    const data: { session: Session; messages: Message[] } = { session, messages: [] };
    this.currentSessionCache.set(chatId, data);
    console.log(`[Session] 创建新会话: ${cleanName}`);

    return session;
  }

  switchToSession(chatId: string, name: string): Session {
    const cleanName = name.trim();

    const targetSession = this.db.prepare(`
      SELECT * FROM sessions WHERE chat_id = ? AND name = ? AND status = 'active'
    `).get(chatId, cleanName) as Session & { work_dir: string; is_current: number } | undefined;

    if (!targetSession) throw new Error(`会话不存在: ${cleanName}`);

    this.db.prepare(`UPDATE sessions SET is_current = 0 WHERE chat_id = ?`).run(chatId);
    this.db.prepare(`UPDATE sessions SET is_current = 1, last_active_at = ? WHERE id = ?`)
      .run(Date.now(), targetSession.id);

    const session: Session = {
      ...targetSession,
      workDir: (targetSession as any).work_dir || this.defaultWorkDir,
      isCurrent: true,
    };

    const messages = this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp
    `).all(targetSession.id) as Message[];

    const data: { session: Session; messages: Message[] } = { session, messages };
    this.currentSessionCache.set(chatId, data);
    console.log(`[Session] 切换到会话: ${cleanName}`);

    return session;
  }

  listSessions(chatId: string): Array<{ name: string; messageCount: number; lastActiveAt: number; isCurrent: boolean }> {
    const sessions = this.db.prepare(`
      SELECT name, message_count, last_active_at, is_current
      FROM sessions
      WHERE chat_id = ? AND status != 'closed'
      ORDER BY last_active_at DESC
    `).all(chatId) as { name: string; message_count: number; last_active_at: number; is_current: number }[];

    return sessions.map(s => ({
      name: s.name,
      messageCount: s.message_count,
      lastActiveAt: s.last_active_at,
      isCurrent: Boolean(s.is_current),
    }));
  }

  deleteSession(chatId: string, name: string): boolean {
    const currentData = this.currentSessionCache.get(chatId);
    if (currentData && currentData.session.name === name) {
      throw new Error('不能删除当前正在使用的会话，请先切换到其他会话');
    }

    const result = this.db.prepare(`
      UPDATE sessions SET status = 'closed' WHERE chat_id = ? AND name = ?
    `).run(chatId, name);

    if (result.changes > 0) {
      console.log(`[Session] 已删除会话: ${name}`);
      return true;
    }
    return false;
  }

  getCurrentSessionName(chatId: string): string {
    const data = this.currentSessionCache.get(chatId);
    return data?.session.name || 'default';
  }

  addMessage(chatId: string, role: 'user' | 'assistant', content: string): Message {
    const data = this.currentSessionCache.get(chatId);
    if (!data) throw new Error(`会话不存在: ${chatId}`);

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      sessionId: data.session.id,
      role,
      content,
      timestamp: Date.now(),
    };

    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(message.id, message.sessionId, message.role, message.content, message.timestamp);

    data.messages.push(message);
    data.session.messageCount = data.messages.length;
    data.session.lastActiveAt = Date.now();

    this.db.prepare(`UPDATE sessions SET message_count = ?, last_active_at = ? WHERE id = ?`)
      .run(data.session.messageCount, data.session.lastActiveAt, data.session.id);

    return message;
  }

  getHistory(chatId: string, limit?: number): Message[] {
    const data = this.currentSessionCache.get(chatId);
    if (!data) return [];

    const messages = data.messages;

    // 智能压缩： 超过30条时压缩旧消息
    if (messages.length > 30) {
      this.compressOldMessages(chatId);
      return limit ? data.messages.slice(-limit) : [...data.messages];
    }

    return limit ? messages.slice(-limit) : [...messages];
  }

  private compressOldMessages(chatId: string): void {
    const data = this.currentSessionCache.get(chatId);
    if (!data || data.messages.length <= 20) return;

    const recentMessages = data.messages.slice(-15);
    const oldMessages = data.messages.slice(0, -15);

    if (oldMessages.length < 5) return;

    const summary = this.generateSummary(oldMessages);
    const summaryMessage: Message = {
      id: `summary_${Date.now()}`,
      sessionId: data.session.id,
      role: 'assistant',
      content: `[历史摘要] ${summary}`,
      timestamp: Date.now(),
    };

    for (const msg of oldMessages) {
      this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(msg.id);
    }

    this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(summaryMessage.id, summaryMessage.sessionId, summaryMessage.role, summaryMessage.content, summaryMessage.timestamp);

    data.messages = [summaryMessage, ...recentMessages];
    data.session.messageCount = data.messages.length;
    this.db.prepare(`UPDATE sessions SET message_count = ? WHERE id = ?`)
      .run(data.session.messageCount, data.session.id);

    console.log(`[Session] 已压缩 ${oldMessages.length} 条旧消息为摘要`);
  }

  private generateSummary(messages: Message[]): string {
    const topics = new Set<string>();
    const codeFiles = new Set<string>();

    for (const msg of messages) {
      const content = msg.content;
      const topicMatch = content.match(/(?:如何|怎么|什么是|为什么|怎样)[^?\n]{0,20}/g);
      if (topicMatch) topicMatch.forEach(t => topics.add(t.slice(0, 30)));

      const fileMatch = content.match(/[\w/-]+\.(ts|js|py|go|java|rs|tsx|jsx)/g);
      if (fileMatch) fileMatch.forEach(f => codeFiles.add(f));
    }

    const parts: string[] = [];
    if (topics.size > 0) parts.push(`讨论主题: ${Array.from(topics).slice(0, 3).join(', ')}`);
    if (codeFiles.size > 0) parts.push(`涉及文件: ${Array.from(codeFiles).slice(0, 5).join(', ')}`);

    if (parts.length === 0) return `共 ${messages.length} 条对话`;
    return parts.join('; ');
  }

  getWorkDir(chatId: string): string {
    const data = this.currentSessionCache.get(chatId);
    return data?.session.workDir || this.defaultWorkDir;
  }

  closeSession(chatId: string): void {
    const data = this.currentSessionCache.get(chatId);
    if (data) {
      this.db.prepare(`UPDATE sessions SET status = 'closed' WHERE id = ?`).run(data.session.id);
      this.currentSessionCache.delete(chatId);
    }
  }

  clearHistory(chatId: string): boolean {
    const data = this.currentSessionCache.get(chatId);
    if (!data) return false;

    this.db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(data.session.id);

    data.messages = [];
    data.session.messageCount = 0;
    this.db.prepare(`UPDATE sessions SET message_count = 0 WHERE id = ?`).run(data.session.id);

    console.log(`[Session] 已清除会话历史: ${data.session.name}`);
    return true;
  }

  getSessionStats(): { active: number; total: number } {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM sessions`).get() as { count: number } | undefined;
    return {
      active: this.currentSessionCache.size,
      total: result?.count || 0,
    };
  }

  searchMessages(chatId: string, query: string, limit: number = 10): Array<{
    sessionId: string; sessionName: string; role: 'user' | 'assistant';
    content: string; timestamp: number; snippet: string;
  }> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    const sessions = this.db.prepare(`
      SELECT id, name FROM sessions WHERE chat_id = ? AND status != 'closed'
    `).all(chatId) as { id: string; name: string }[];

    const sessionMap = new Map(sessions.map(s => [s.id, s.name]));
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return [];

    const placeholders = sessionIds.map(() => '?').join(',');
    const messages = this.db.prepare(`
      SELECT session_id, role, content, timestamp
      FROM messages
      WHERE session_id IN (${placeholders})
        AND LOWER(content) LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).get(...sessionIds, `%${cleanQuery}%`, limit) as Array<{
      session_id: string; role: 'user' | 'assistant'; content: string; timestamp: number;
    }>;

    return messages.map(msg => {
      const idx = msg.content.toLowerCase().indexOf(cleanQuery);
      const start = Math.max(0, idx - 50);
      const end = Math.min(msg.content.length, idx + cleanQuery.length + 50);
      const snippet = (start > 0 ? '...' : '') +
                   msg.content.slice(start, end) +
                   (end < msg.content.length ? '...' : '');

      return {
        sessionId: msg.session_id,
        sessionName: sessionMap.get(msg.session_id) || 'unknown',
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        snippet,
      };
    });
  }
}
