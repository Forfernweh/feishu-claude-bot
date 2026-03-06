/**
 * 消息队列模块 - 异步处理消息，避免阻塞
 */

interface QueueItem {
  id: string;
  messageId: string;
  chatId: string;
  message: string;
  timestamp: number;
  retryCount: number;
  priority: number;
}

export class MessageQueue {
  private queues: Map<string, QueueItem[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private stats = {
    pending: 0,
    processing: 0,
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    avgProcessingTime: 0,
  };
  private processingTimes: number[] = [];
  private maxRetries: number;
  private maxQueueSize: number;
  private handlers: Map<string, (item: QueueItem) => Promise<void>> = new Map();

  constructor(maxRetries: number = 3, maxQueueSize: number = 50) {
    this.maxRetries = maxRetries;
    this.maxQueueSize = maxQueueSize;
  }

  registerHandler(chatId: string, handler: (item: QueueItem) => Promise<void>): void {
    this.handlers.set(chatId, handler);
  }

  enqueue(messageId: string, chatId: string, message: string, priority: number = 5): string {
    const id = `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const item: QueueItem = {
      id, messageId, chatId, message,
      timestamp: Date.now(),
      retryCount: 0,
      priority,
    };

    if (!this.queues.has(chatId)) {
      this.queues.set(chatId, []);
    }

    const queue = this.queues.get(chatId)!;
    if (queue.length >= this.maxQueueSize) {
      console.log(`[Queue] 队列已满，拒绝消息: ${id}`);
      return '';
    }

    queue.push(item);
    queue.sort((a, b) => a.priority - b.priority);
    this.stats.totalQueued++;
    console.log(`[Queue] 消息入队: ${id}`);

    this.processNext(chatId);
    return id;
  }

  private async processNext(chatId: string): Promise<void> {
    if (this.processing.get(chatId)) return;
    const queue = this.queues.get(chatId);
    if (!queue || queue.length === 0) return;

    this.processing.set(chatId, true);
    const item = queue.shift()!;
    const startTime = Date.now();

    try {
      const handler = this.handlers.get(chatId);
      if (handler) await handler(item);

      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      if (this.processingTimes.length > 100) this.processingTimes.shift();
      this.stats.avgProcessingTime =
        this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
      this.stats.totalProcessed++;
    } catch (error) {
      if (item.retryCount < this.maxRetries) {
        item.retryCount++;
        queue.unshift(item);
      } else {
        this.stats.totalFailed++;
      }
    } finally {
      this.processing.set(chatId, false);
      if (queue.length > 0) {
        setTimeout(() => this.processNext(chatId), 100);
      }
    }
  }

  getStats() {
    const queuesList = Array.from(this.queues.entries()).map(([chatId, queue]) => ({
      chatId, length: queue.length
    }));
    return {
      ...this.stats,
      pending: queuesList.reduce((sum, q) => sum + q.length, 0),
      processing: Array.from(this.processing.values()).filter(v => v).length,
      queues: queuesList,
    };
  }

  isProcessing(chatId: string): boolean {
    return this.processing.get(chatId) || false;
  }

  hasHandler(chatId: string): boolean {
    return this.handlers.has(chatId);
  }
}
