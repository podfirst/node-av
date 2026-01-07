import type { AVFifoFlag } from '../constants/index.js';
import type { NativeFifo, NativeWrapper } from './native-types.js';
/**
 * Generic FIFO (First-In-First-Out) buffer for arbitrary data types.
 *
 * Provides a thread-safe buffer for generic data elements. Unlike AudioFifo which is
 * specialized for audio samples, Fifo can handle any data type by specifying the element size.
 * Supports automatic growth and manual size management.
 *
 * Direct mapping to FFmpeg's AVFifo.
 *
 * @example
 * ```typescript
 * import { Fifo, FFmpegError } from 'node-av';
 * import { AV_FIFO_FLAG_AUTO_GROW } from 'node-av/constants';
 *
 * // Create FIFO for 32-bit integers
 * const fifo = new Fifo();
 * fifo.alloc(100, 4, AV_FIFO_FLAG_AUTO_GROW);
 * fifo.setAutoGrowLimit(1000);
 *
 * // Write data
 * const data = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
 * const written = await fifo.write(data, 2); // Write 2 elements (8 bytes)
 * FFmpegError.throwIfError(written, 'write');
 *
 * // Read data
 * const outBuffer = Buffer.alloc(8);
 * const read = await fifo.read(outBuffer, 2); // Read 2 elements
 * FFmpegError.throwIfError(read, 'read');
 *
 * // Cleanup
 * fifo.free();
 * ```
 *
 * @see [AVFifo](https://ffmpeg.org/doxygen/trunk/structAVFifo.html) - FFmpeg Doxygen
 */
export declare class Fifo implements Disposable, NativeWrapper<NativeFifo> {
    private native;
    constructor();
    /**
     * Number of elements currently in the FIFO.
     *
     * Direct mapping to av_fifo_can_read().
     */
    get size(): number;
    /**
     * Number of elements that can be read from the FIFO.
     *
     * Direct mapping to av_fifo_can_read().
     */
    get canRead(): number;
    /**
     * Number of elements that can be written without reallocation.
     *
     * Direct mapping to av_fifo_can_write().
     */
    get canWrite(): number;
    /**
     * Size in bytes of a single element.
     *
     * Direct mapping to av_fifo_elem_size().
     */
    get elemSize(): number;
    /**
     * Allocate an AVFifo buffer.
     *
     * Creates a FIFO buffer with the specified element count, size and flags.
     * The FIFO can be configured to automatically grow when full.
     *
     * Direct mapping to av_fifo_alloc2().
     *
     * @param nbElems - Initial number of elements to allocate
     *
     * @param elemSize - Size in bytes of each element
     *
     * @param flags - Optional flags (e.g., AV_FIFO_FLAG_AUTO_GROW). Defaults to 0
     *
     * @throws {Error} If allocation fails (ENOMEM)
     *
     * @example
     * ```typescript
     * import { Fifo } from 'node-av';
     * import { AV_FIFO_FLAG_AUTO_GROW } from 'node-av/constants';
     *
     * // Fixed size FIFO for 100 32-bit integers
     * const fifo1 = new Fifo();
     * fifo1.alloc(100, 4);
     *
     * // Auto-growing FIFO for 8-byte structures
     * const fifo2 = new Fifo();
     * fifo2.alloc(50, 8, AV_FIFO_FLAG_AUTO_GROW);
     * fifo2.setAutoGrowLimit(1000); // Max 1000 elements
     * ```
     *
     * @see {@link grow} To manually grow the FIFO
     * @see {@link setAutoGrowLimit} To set auto-grow limit
     * @see {@link free} To release the FIFO
     */
    alloc(nbElems: number, elemSize: number, flags?: AVFifoFlag): void;
    /**
     * Free the FIFO buffer and all associated resources.
     *
     * After calling this, the FIFO is invalid and must be reallocated before use.
     *
     * Direct mapping to av_fifo_freep().
     *
     * @example
     * ```typescript
     * fifo.free();
     * // FIFO is now invalid, must call alloc() before using again
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     * @see {@link alloc} To allocate
     */
    free(): void;
    /**
     * Write elements to the FIFO.
     *
     * Writes elements to the FIFO buffer. If AV_FIFO_FLAG_AUTO_GROW was set,
     * automatically reallocates if more space is needed (up to auto-grow limit).
     *
     * Direct mapping to av_fifo_write().
     *
     * @param buf - Data buffer containing elements to write
     *
     * @param nbElems - Number of elements to write
     *
     * @returns Number of elements written (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Not enough space and auto-grow failed/disabled
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Write 4 32-bit integers (16 bytes)
     * const data = Buffer.from([
     *   0x01, 0x00, 0x00, 0x00,  // 1
     *   0x02, 0x00, 0x00, 0x00,  // 2
     *   0x03, 0x00, 0x00, 0x00,  // 3
     *   0x04, 0x00, 0x00, 0x00,  // 4
     * ]);
     * const written = await fifo.write(data, 4);
     * FFmpegError.throwIfError(written, 'write');
     * console.log(`Wrote ${written} elements`);
     * ```
     *
     * @see {@link read} To retrieve elements from FIFO
     * @see {@link canWrite} To check available space
     */
    write(buf: Buffer, nbElems: number): Promise<number>;
    /**
     * Write elements to the FIFO synchronously.
     * Synchronous version of write.
     *
     * Writes elements to the FIFO buffer. Can write fewer elements than requested
     * if space is limited and auto-grow is disabled or has reached the limit.
     *
     * Direct mapping to av_fifo_write().
     *
     * @param buf - Data buffer containing elements to write
     *
     * @param nbElems - Number of elements to write
     *
     * @returns Number of elements written (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Not enough space
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const buffer = Buffer.alloc(32); // 8 elements of 4 bytes each
     * // Fill with data...
     *
     * const written = fifo.writeSync(buffer, 8);
     * FFmpegError.throwIfError(written, 'writeSync');
     * console.log(`Wrote ${written} elements`);
     * ```
     *
     * @see {@link write} For async version
     */
    writeSync(buf: Buffer, nbElems: number): number;
    /**
     * Read and remove elements from the FIFO.
     *
     * Reads up to the specified number of elements from the FIFO.
     * The elements are removed from the FIFO after reading.
     * Buffer must be pre-allocated with sufficient size (nbElems * elemSize).
     *
     * Direct mapping to av_fifo_read().
     *
     * @param buf - Pre-allocated buffer to read into
     *
     * @param nbElems - Maximum number of elements to read
     *
     * @returns Number of elements read (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters or insufficient buffer size
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Check available elements
     * const available = fifo.canRead;
     * if (available >= 10) {
     *   // Read 10 elements (40 bytes for 4-byte elements)
     *   const outBuffer = Buffer.alloc(40);
     *   const read = await fifo.read(outBuffer, 10);
     *   FFmpegError.throwIfError(read, 'read');
     *   console.log(`Read ${read} elements`);
     * }
     * ```
     *
     * @see {@link peek} To read without removing
     * @see {@link canRead} To check available elements
     */
    read(buf: Buffer, nbElems: number): Promise<number>;
    /**
     * Read and remove elements from the FIFO synchronously.
     * Synchronous version of read.
     *
     * Reads up to the specified number of elements from the FIFO.
     * The elements are removed from the FIFO after reading.
     * Buffer must be pre-allocated with sufficient size.
     *
     * Direct mapping to av_fifo_read().
     *
     * @param buf - Pre-allocated buffer to read into
     *
     * @param nbElems - Maximum number of elements to read
     *
     * @returns Number of elements read (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Read up to 20 elements
     * const readBuffer = Buffer.alloc(20 * fifo.elemSize);
     * const read = fifo.readSync(readBuffer, 20);
     * FFmpegError.throwIfError(read, 'readSync');
     *
     * console.log(`Read ${read} elements from FIFO`);
     * console.log(`FIFO now has ${fifo.canRead} elements remaining`);
     * ```
     *
     * @see {@link read} For async version
     */
    readSync(buf: Buffer, nbElems: number): number;
    /**
     * Read elements from the FIFO without removing them.
     *
     * Similar to read() but leaves the elements in the FIFO.
     * Useful for inspecting upcoming data without consuming it.
     * Optionally start reading from an offset.
     *
     * Direct mapping to av_fifo_peek().
     *
     * @param buf - Pre-allocated buffer to peek into
     *
     * @param nbElems - Maximum number of elements to peek
     *
     * @param offset - Offset in elements from start of FIFO. Defaults to 0
     *
     * @returns Number of elements peeked (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters or offset too large
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Peek at next 5 elements without removing them
     * const peekBuffer = Buffer.alloc(5 * fifo.elemSize);
     * const peeked = await fifo.peek(peekBuffer, 5);
     * FFmpegError.throwIfError(peeked, 'peek');
     *
     * // Peek at elements starting at offset 10
     * const peeked2 = await fifo.peek(peekBuffer, 5, 10);
     * FFmpegError.throwIfError(peeked2, 'peek');
     *
     * // Elements are still in FIFO
     * console.log(`FIFO still has ${fifo.canRead} elements`);
     * ```
     *
     * @see {@link read} To read and remove elements
     */
    peek(buf: Buffer, nbElems: number, offset?: number): Promise<number>;
    /**
     * Read elements from the FIFO without removing them synchronously.
     * Synchronous version of peek.
     *
     * Similar to readSync() but leaves the elements in the FIFO.
     * Useful for inspecting upcoming data without consuming it.
     * Optionally start reading from an offset.
     *
     * Direct mapping to av_fifo_peek().
     *
     * @param buf - Pre-allocated buffer to peek into
     *
     * @param nbElems - Maximum number of elements to peek
     *
     * @param offset - Offset in elements from start of FIFO. Defaults to 0
     *
     * @returns Number of elements peeked (>= 0), or negative AVERROR:
     *   - AVERROR_EINVAL: Invalid parameters or offset too large
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Peek at next elements without removing them
     * const peekBuffer = Buffer.alloc(10 * fifo.elemSize);
     * const peeked = fifo.peekSync(peekBuffer, 10);
     * FFmpegError.throwIfError(peeked, 'peekSync');
     *
     * // Elements are still in FIFO
     * console.log(`FIFO still has ${fifo.canRead} elements`);
     * ```
     *
     * @see {@link peek} For async version
     */
    peekSync(buf: Buffer, nbElems: number, offset?: number): number;
    /**
     * Grow the FIFO buffer by the specified number of elements.
     *
     * Increases the allocated size of the FIFO by adding more space.
     * Existing elements are preserved.
     *
     * Direct mapping to av_fifo_grow2().
     *
     * @param inc - Number of additional elements to allocate
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid size
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Grow FIFO to handle more elements
     * const ret = fifo.grow(100);
     * FFmpegError.throwIfError(ret, 'grow');
     * console.log(`New write capacity: ${fifo.canWrite} elements`);
     * ```
     *
     * @see {@link alloc} For initial allocation
     */
    grow(inc: number): number;
    /**
     * Remove all elements from the FIFO.
     *
     * Empties the FIFO buffer without deallocating it.
     * The FIFO remains allocated and ready for new data.
     *
     * Direct mapping to av_fifo_reset2().
     *
     * @example
     * ```typescript
     * fifo.reset();
     * console.log(fifo.canRead);  // 0
     * console.log(fifo.canWrite); // Original allocation size
     * ```
     */
    reset(): void;
    /**
     * Set the maximum number of elements for auto-grow.
     *
     * When AV_FIFO_FLAG_AUTO_GROW is set, the FIFO will automatically grow
     * up to this limit when full. After reaching the limit, writes will fail.
     *
     * Direct mapping to av_fifo_auto_grow_limit().
     *
     * @param maxElems - Maximum number of elements (0 = unlimited)
     *
     * @example
     * ```typescript
     * import { AV_FIFO_FLAG_AUTO_GROW } from 'node-av/constants';
     *
     * const fifo = new Fifo();
     * fifo.alloc(100, 4, AV_FIFO_FLAG_AUTO_GROW);
     * fifo.setAutoGrowLimit(10000); // Limit to 10000 elements
     * ```
     *
     * @see {@link alloc} For setting auto-grow flag
     */
    setAutoGrowLimit(maxElems: number): void;
    /**
     * Get the underlying native Fifo object.
     *
     * @returns The native Fifo binding object
     *
     * @internal
     */
    getNative(): NativeFifo;
    /**
     * Dispose of the FIFO buffer.
     *
     * Implements the Disposable interface for automatic cleanup.
     * Equivalent to calling free().
     *
     * @example
     * ```typescript
     * {
     *   using fifo = new Fifo();
     *   fifo.alloc(100, 4);
     *   // Use fifo...
     * } // Automatically freed when leaving scope
     * ```
     */
    [Symbol.dispose](): void;
}
