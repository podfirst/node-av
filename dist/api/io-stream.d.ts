import { IOContext } from '../lib/index.js';
import type { DemuxerOptions, IOInputCallbacks } from './types.js';
/**
 * Factory for creating custom I/O contexts.
 *
 * Provides simplified creation of I/O contexts from buffers or custom callbacks.
 * Handles buffer management and seek operations for in-memory media.
 * Bridges the gap between high-level media operations and custom I/O sources.
 * Essential for processing media from non-file sources like network streams or memory.
 *
 * @example
 * ```typescript
 * import { IOStream, Demuxer } from 'node-av/api';
 *
 * // From buffer
 * const buffer = await fs.readFile('video.mp4');
 * const ioContext = IOStream.create(buffer);
 * const input = await Demuxer.open(buffer);
 * ```
 *
 * @example
 * ```typescript
 * // Custom I/O callbacks
 * const callbacks = {
 *   read: async (size: number) => {
 *     // Read from custom source
 *     return Buffer.alloc(size);
 *   },
 *   seek: async (offset: bigint, whence: AVSeekWhence) => {
 *     // Seek in custom source
 *     return offset;
 *   }
 * };
 *
 * const ioContext = IOStream.create(callbacks, {
 *   bufferSize: 4096
 * });
 * ```
 *
 * @see {@link IOContext} For low-level I/O operations
 * @see {@link Demuxer} For using I/O contexts
 * @see {@link IOInputCallbacks} For callback interface
 */
export declare class IOStream {
    /**
     * Create I/O context from buffer.
     *
     * Creates an I/O context from an in-memory buffer for reading media data.
     * Automatically handles seek operations and position tracking.
     *
     * @param buffer - Buffer containing media data
     *
     * @param options - I/O configuration options
     *
     * @returns Configured I/O context
     *
     * @example
     * ```typescript
     * const buffer = await fs.readFile('video.mp4');
     * const ioContext = IOStream.create(buffer, {
     *   bufferSize: 8192
     * });
     * ```
     */
    static create(buffer: Buffer, options?: DemuxerOptions): IOContext;
    /**
     * Create I/O context from callbacks.
     *
     * Creates an I/O context using custom read and seek callbacks.
     * Useful for streaming from non-file sources like network or custom storage.
     *
     * @param callbacks - I/O callbacks for read and seek operations
     *
     * @param options - I/O configuration options
     *
     * @returns Configured I/O context
     *
     * @throws {Error} If callbacks missing required read function
     *
     * @example
     * ```typescript
     * const ioContext = IOStream.create({
     *   read: async (size) => {
     *     return await customSource.read(size);
     *   },
     *   seek: async (offset, whence) => {
     *     return await customSource.seek(offset, whence);
     *   }
     * });
     * ```
     */
    static create(callbacks: IOInputCallbacks, options?: DemuxerOptions): IOContext;
    /**
     * Create I/O context from buffer.
     *
     * Sets up read and seek callbacks for in-memory buffer.
     * Manages position tracking and EOF handling.
     *
     * @param buffer - Source buffer
     *
     * @param bufferSize - Internal buffer size
     *
     * @returns Configured I/O context
     *
     * @internal
     */
    private static createFromBuffer;
    /**
     * Create I/O context from callbacks.
     *
     * Sets up custom I/O with user-provided callbacks.
     * Supports read and optional seek operations.
     *
     * @param callbacks - User I/O callbacks
     *
     * @param bufferSize - Internal buffer size
     *
     * @returns Configured I/O context
     *
     * @throws {Error} If read callback not provided
     *
     * @internal
     */
    private static createFromCallbacks;
}
