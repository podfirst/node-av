import { AVSEEK_CUR, AVSEEK_END, AVSEEK_SET, AVSEEK_SIZE } from '../constants/constants.js';
import { IOContext } from '../lib/index.js';
import { IO_BUFFER_SIZE } from './constants.js';
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
export class IOStream {
    static create(input, options = {}) {
        const { bufferSize = IO_BUFFER_SIZE } = options;
        // Handle Buffer
        if (Buffer.isBuffer(input)) {
            return this.createFromBuffer(input, bufferSize);
        }
        // Handle custom callbacks
        if (typeof input === 'object' && 'read' in input) {
            return this.createFromCallbacks(input, bufferSize);
        }
        throw new TypeError('Invalid input type. Expected Buffer or IOInputCallbacks');
    }
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
    static createFromBuffer(buffer, bufferSize) {
        let position = 0;
        const ioContext = new IOContext();
        ioContext.allocContextWithCallbacks(bufferSize, 0, (size) => {
            if (position >= buffer.length) {
                return null; // EOF
            }
            const chunk = buffer.subarray(position, Math.min(position + size, buffer.length));
            position += chunk.length;
            return chunk;
        }, undefined, (offset, whence) => {
            switch (whence) {
                case AVSEEK_SIZE:
                    return BigInt(buffer.length);
                case AVSEEK_SET:
                    position = Number(offset);
                    break;
                case AVSEEK_CUR:
                    position += Number(offset);
                    break;
                case AVSEEK_END:
                    position = buffer.length + Number(offset);
                    break;
            }
            // Clamp position
            position = Math.max(0, Math.min(position, buffer.length));
            return BigInt(position);
        });
        return ioContext;
    }
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
    static createFromCallbacks(callbacks, bufferSize) {
        // We only support read mode in the high-level API
        // Write mode would be needed for custom output, which we don't currently support
        if (!callbacks.read) {
            throw new Error('Read callback is required');
        }
        const ioContext = new IOContext();
        ioContext.allocContextWithCallbacks(bufferSize, 0, // Always read mode
        callbacks.read, undefined, // No write callback in high-level API
        callbacks.seek);
        return ioContext;
    }
}
//# sourceMappingURL=io-stream.js.map