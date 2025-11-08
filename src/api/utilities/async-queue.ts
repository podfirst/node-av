/**
 * AsyncQueue provides a promise-based blocking queue similar to FFmpeg's ThreadQueue.
 *
 * Unlike FFmpeg's pthread-based blocking, this uses Promises to achieve
 * non-blocking async behavior while maintaining queue semantics.
 *
 * @example
 * ```typescript
 * const queue = new AsyncQueue<Frame>(8);
 *
 * // Producer
 * await queue.send(frame);  // Blocks if queue full
 *
 * // Consumer
 * const frame = await queue.receive();  // Blocks if queue empty
 *
 * // Cleanup
 * queue.close();
 * ```
 */
export class AsyncQueue<T> {
  private queue: T[] = [];
  private sendWaiters: (() => void)[] = [];
  private receiveWaiters: (() => void)[] = [];
  private maxSize: number;
  private closed = false;

  /**
   * Creates a new AsyncQueue.
   *
   * @param maxSize Maximum number of items in queue before send() blocks
   */
  constructor(maxSize: number) {
    if (maxSize <= 0) {
      maxSize = 1;
    }
    this.maxSize = maxSize;
  }

  /**
   * Current number of items in the queue.
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Whether the queue is closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Maximum queue size (from constructor).
   */
  get capacity(): number {
    return this.maxSize;
  }

  /**
   * Number of producers waiting to send (backpressure indicator).
   */
  get waitingSenders(): number {
    return this.sendWaiters.length;
  }

  /**
   * Number of consumers waiting to receive.
   */
  get waitingReceivers(): number {
    return this.receiveWaiters.length;
  }

  /**
   * Sends an item to the queue.
   *
   * If the queue is full, this method blocks (awaits) until space is available.
   *
   * @param item Item to send
   *
   * @returns Promise that resolves when item is sent
   *
   * @example
   * ```typescript
   * await queue.send(item);
   * ```
   */
  async send(item: T): Promise<void> {
    if (this.closed) {
      return;
    }

    // Block if queue full
    while (this.queue.length >= this.maxSize && !this.closed) {
      await new Promise<void>((resolve) => this.sendWaiters.push(resolve));
    }

    if (this.closed) {
      return;
    }

    this.queue.push(item);

    // Wake up one receiver if waiting (just signal, don't remove item)
    const receiver = this.receiveWaiters.shift();
    if (receiver) {
      receiver(); // Signal that item is available
    }
  }

  /**
   * Receives an item from the queue.
   *
   * If the queue is empty and not closed, this method blocks (awaits) until an item is available.
   * If the queue is closed and empty, returns null.
   *
   * @returns Next item from queue, or null if closed and empty
   *
   * @example
   * ```typescript
   * const item = await queue.receive();
   * ```
   */
  async receive(): Promise<T | null> {
    // Loop until we get an item or queue is closed
    while (true) {
      // If queue has items, return immediately
      if (this.queue.length > 0) {
        const item = this.queue.shift()!;

        // Wake up one sender if waiting
        const sender = this.sendWaiters.shift();
        if (sender) {
          sender();
        }

        return item;
      }

      // If closed and empty, return null
      if (this.closed) {
        return null;
      }

      // Block until signaled
      await new Promise<void>((resolve) => {
        this.receiveWaiters.push(resolve);
      });

      // After waking up, loop back to check queue again
    }
  }

  /**
   * Closes the queue, rejecting any pending sends and resolving pending receives with null.
   *
   * @example
   * ```typescript
   * queue.close();
   * ```
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Wake up all waiting senders
    const senders = this.sendWaiters.splice(0);
    for (const sender of senders) {
      sender();
    }

    // Wake up all waiting receivers (they will get null from empty queue check)
    const receivers = this.receiveWaiters.splice(0);
    for (const receiver of receivers) {
      receiver();
    }
  }
}
