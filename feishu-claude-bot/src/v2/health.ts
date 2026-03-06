/**
 * 健康检查模块 - 监控服务运行状态
 */

import * as os from 'os';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  uptime: number;
  timestamp: number;
  version: string;
  memory: { total: number; free: number; used: number; usagePercent: number };
  queue: { pending: number; processing: number; totalProcessed: number; totalFailed: number };
  sessions: { active: number; total: number };
  claude: { available: boolean; lastCheck: number };
}

export class HealthChecker {
  private startTime: number = Date.now();
  private version: string = '1.0.0';
  private lastClaudeCheck: number = 0;
  private claudeAvailable: boolean = false;
  private getQueueStats: () => HealthStatus['queue'];
  private getSessionStats: () => { active: number; total: number };

  constructor(
    getQueueStats: () => HealthStatus['queue'],
    getSessionStats: () => { active: number; total: number }
  ) {
    this.getQueueStats = getQueueStats;
    this.getSessionStats = getSessionStats;
  }

  getStatus(): HealthStatus {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    const queueStats = this.getQueueStats();
    const sessionStats = this.getSessionStats();

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (!this.claudeAvailable) status = 'unhealthy';
    else if (queueStats.pending > 10 || (usedMemory / totalMemory) > 0.98) status = 'degraded';

    return {
      status,
      uptime: Date.now() - this.startTime,
      timestamp: Date.now(),
      version: this.version,
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercent: (usedMemory / totalMemory) * 100,
      },
      queue: queueStats,
      sessions: sessionStats,
      claude: {
        available: this.claudeAvailable,
        lastCheck: this.lastClaudeCheck,
      },
    };
  }

  async checkClaude(): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      const claudePath = process.env.CLAUDE_PATH || '/usr/local/bin/claude';

      return new Promise((resolve) => {
        const proc = spawn(claudePath, ['--version'], { timeout: 5000 });
        proc.on('close', (code: number) => {
          this.lastClaudeCheck = Date.now();
          this.claudeAvailable = code === 0;
          resolve(this.claudeAvailable);
        });
        proc.on('error', () => {
          this.lastClaudeCheck = Date.now();
          this.claudeAvailable = false;
          resolve(false);
        });
      });
    } catch {
      this.claudeAvailable = false;
      return false;
    }
  }

  getSimpleStatus(): { ok: boolean; timestamp: number } {
    return { ok: this.claudeAvailable, timestamp: Date.now() };
  }
}
