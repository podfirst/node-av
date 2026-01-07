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
export declare class AsyncQueue<T> {
    private queue;
    private sendWaiters;
    private receiveWaiters;
    private maxSize;
    private closed;
    private error;
    /**
     * Creates a new AsyncQueue.
     *
     * @param maxSize Maximum number of items in queue before send() blocks
     */
    constructor(maxSize: number);
    /**
     * Current number of items in the queue.
     */
    get size(): number;
    /**
     * Whether the queue is closed.
     */
    get isClosed(): boolean;
    /**
     * Error that caused the queue to close, if any.
     */
    get closedWithError(): Error | null;
    /**
     * Maximum queue size (from constructor).
     */
    get capacity(): number;
    /**
     * Number of producers waiting to send (backpressure indicator).
     */
    get waitingSenders(): number;
    /**
     * Number of consumers waiting to receive.
     */
    get waitingReceivers(): number;
    /**
     * Sends an item to the queue.
     *
     * If the queue is full, this method blocks (awaits) until space is available.
     * If the queue was closed with an error, throws that error.
     *
     * @param item Item to send
     *
     * @returns Promise that resolves when item is sent
     *
     * @throws {Error} If the queue was closed with an error via closeWithError()
     *
     * @example
     * ```typescript
     * await queue.send(item);
     * ```
     */
    send(item: T): Promise<void>;
    /**
     * Receives an item from the queue.
     *
     * If the queue is empty and not closed, this method blocks (awaits) until an item is available.
     * If the queue is closed and empty, returns null.
     * If the queue was closed with an error, throws that error.
     *
     * @returns Next item from queue, or null if closed and empty
     *
     * @throws {Error} If the queue was closed with an error via closeWithError()
     *
     * @example
     * ```typescript
     * const item = await queue.receive();
     * ```
     */
    receive(): Promise<T | null>;
    /**
     * Closes the queue, rejecting any pending sends and resolving pending receives with null.
     *
     * @example
     * ```typescript
     * queue.close();
     * ```
     */
    close(): void;
    /**
     * Closes the queue with an error.
     *
     * All pending and future receive() calls will throw this error.
     * Use this to propagate errors through the pipeline.
     *
     * @param error - Error to propagate to consumers
     *
     * @example
     * ```typescript
     * try {
     *   await processItem(item);
     * } catch (error) {
     *   queue.closeWithError(error);
     * }
     * ```
     */
    closeWithError(error: Error): void;
}
