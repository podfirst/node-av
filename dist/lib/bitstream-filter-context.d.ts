import { BitStreamFilter } from './bitstream-filter.js';
import { CodecParameters } from './codec-parameters.js';
import { OptionMember } from './option.js';
import { Rational } from './rational.js';
import type { NativeBitStreamFilterContext, NativeWrapper } from './native-types.js';
import type { Packet } from './packet.js';
/**
 * Bitstream filter context for processing compressed video/audio streams.
 *
 * Applies bitstream filters to modify or analyze compressed packets without
 * full decoding/encoding. Common uses include format conversion (e.g., H.264 MP4 to Annex B),
 * metadata extraction, parameter set manipulation, and packet splitting/merging.
 * Essential for stream compatibility between different containers and decoders.
 *
 * Direct mapping to FFmpeg's AVBSFContext.
 *
 * @example
 * ```typescript
 * import { BitStreamFilterContext, BitStreamFilter, Packet, FFmpegError } from 'node-av';
 *
 * // Create and initialize H.264 stream format converter
 * const ctx = new BitStreamFilterContext();
 * const filter = BitStreamFilter.getByName('h264_mp4toannexb');
 * if (!filter) {
 *   throw new Error('H.264 filter not available');
 * }
 *
 * let ret = ctx.alloc(filter);
 * FFmpegError.throwIfError(ret, 'alloc');
 *
 * ret = ctx.init();
 * FFmpegError.throwIfError(ret, 'init');
 *
 * // Process packets
 * const inputPacket = new Packet();
 * const outputPacket = new Packet();
 *
 * ret = await ctx.sendPacket(inputPacket);
 * FFmpegError.throwIfError(ret, 'sendPacket');
 *
 * ret = await ctx.receivePacket(outputPacket);
 * if (ret >= 0) {
 *   // Process filtered packet
 * }
 *
 * // Cleanup
 * ctx.free();
 * ```
 *
 * @see {@link BitStreamFilter} For available filter types
 * @see {@link Packet} For packet manipulation
 */
export declare class BitStreamFilterContext extends OptionMember<NativeBitStreamFilterContext> implements Disposable, NativeWrapper<NativeBitStreamFilterContext> {
    private _filter?;
    constructor();
    /**
     * Check if the context has been initialized.
     *
     * Returns true if init() has been successfully called.
     * The context must be initialized before sending/receiving packets.
     */
    get isInitialized(): boolean;
    /**
     * Input codec parameters.
     *
     * Parameters describing the input stream format.
     * These are automatically configured from the input packets in most cases.
     *
     * Direct mapping to AVBSFContext->par_in.
     */
    get inputCodecParameters(): CodecParameters | null;
    /**
     * Output codec parameters.
     *
     * Parameters describing the output stream format after filtering.
     * These reflect any changes made by the bitstream filter.
     *
     * Direct mapping to AVBSFContext->par_out.
     */
    get outputCodecParameters(): CodecParameters | null;
    /**
     * Input time base.
     *
     * Time base of the input packets (timestamps per second).
     * Must be set before init() for proper timestamp handling.
     *
     * Direct mapping to AVBSFContext->time_base_in.
     */
    get inputTimeBase(): Rational;
    set inputTimeBase(value: Rational);
    /**
     * Output time base.
     *
     * Time base of the output packets after filtering.
     * May differ from input if the filter modifies timing.
     *
     * Direct mapping to AVBSFContext->time_base_out.
     */
    get outputTimeBase(): Rational | null;
    /**
     * The bitstream filter being used.
     *
     * Reference to the filter descriptor allocated to this context.
     *
     * Direct mapping to AVBSFContext->filter.
     */
    get filter(): BitStreamFilter | null;
    /**
     * Allocate a bitstream filter context.
     *
     * Allocates and configures the context for the specified filter.
     * Must be called before init().
     *
     * Direct mapping to av_bsf_alloc().
     *
     * @param filter - The bitstream filter to use
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_ENOMEM: Memory allocation failure
     *   - AVERROR_EINVAL: Invalid filter
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const filter = BitStreamFilter.getByName('h264_mp4toannexb');
     * if (!filter) {
     *   throw new Error('Filter not found');
     * }
     *
     * const ret = ctx.alloc(filter);
     * FFmpegError.throwIfError(ret, 'alloc');
     * ```
     *
     * @see {@link init} To initialize after allocation
     * @see {@link BitStreamFilter.getByName} To get filter by name
     */
    alloc(filter: BitStreamFilter): number;
    /**
     * Initialize the bitstream filter context.
     *
     * Initializes the filter with the configured parameters.
     * Must be called after alloc() and before processing packets.
     *
     * Direct mapping to av_bsf_init().
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * // Allocate and initialize
     * const ret1 = ctx.alloc(filter);
     * FFmpegError.throwIfError(ret1, 'alloc');
     *
     * // Set parameters if needed
     * ctx.inputTimeBase = new Rational(1, 25);
     *
     * const ret2 = ctx.init();
     * FFmpegError.throwIfError(ret2, 'init');
     * ```
     *
     * @see {@link alloc} Must be called first
     * @see {@link isInitialized} To check initialization status
     */
    init(): number;
    /**
     * Free the bitstream filter context.
     *
     * Releases all resources associated with the context.
     * The context becomes invalid after calling this.
     *
     * Direct mapping to av_bsf_free().
     *
     * @example
     * ```typescript
     * ctx.free();
     * // Context is now invalid
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     * @see {@link alloc} To allocate
     */
    free(): void;
    /**
     * Flush the bitstream filter.
     *
     * Resets the internal state and discards any buffered data.
     * Useful when seeking or switching streams.
     *
     * Direct mapping to av_bsf_flush().
     *
     * @example
     * ```typescript
     * // Flush when seeking
     * ctx.flush();
     * // Now ready to process packets from new position
     * ```
     */
    flush(): void;
    /**
     * Send a packet to the bitstream filter.
     *
     * Submits a packet for filtering. The filter may buffer the packet
     * internally and require multiple calls to receivePacket() to retrieve
     * all output. Send null to signal end of stream.
     *
     * Direct mapping to av_bsf_send_packet().
     *
     * @param packet - Packet to filter, or null to signal EOF
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Filter needs output to be consumed first
     *   - AVERROR_EOF: Filter has been flushed
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av';
     *
     * const ret = await ctx.sendPacket(inputPacket);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive packets first
     *   const ret2 = await ctx.receivePacket(outputPacket);
     *   FFmpegError.throwIfError(ret2, 'receivePacket');
     * } else {
     *   FFmpegError.throwIfError(ret, 'sendPacket');
     * }
     *
     * // Send EOF
     * await ctx.sendPacket(null);
     * ```
     *
     * @see {@link receivePacket} To retrieve filtered packets
     */
    sendPacket(packet: Packet | null): Promise<number>;
    /**
     * Send a packet to the bitstream filter synchronously.
     * Synchronous version of sendPacket.
     *
     * Submits a packet for filtering. The filter may buffer packets
     * internally and produce output with different timing.
     *
     * Direct mapping to av_bsf_send_packet().
     *
     * @param packet - Packet to filter (null to drain)
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need to receive packets first
     *   - AVERROR_EOF: Filter has been flushed
     *   - AVERROR_EINVAL: Invalid state
     *   - AVERROR(ENOMEM): Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av/constants';
     *
     * // Send packet to filter
     * const ret = ctx.sendPacketSync(inputPacket);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive output first
     *   const outputPacket = new Packet();
     *   ctx.receivePacketSync(outputPacket);
     * } else {
     *   FFmpegError.throwIfError(ret, 'sendPacketSync');
     * }
     *
     * // Drain filter
     * ctx.sendPacketSync(null);
     * ```
     *
     * @see {@link sendPacket} For async version
     */
    sendPacketSync(packet: Packet | null): number;
    /**
     * Receive a filtered packet from the bitstream filter.
     *
     * Retrieves a packet that has been processed by the filter.
     * May need to be called multiple times after each sendPacket().
     *
     * Direct mapping to av_bsf_receive_packet().
     *
     * @param packet - Packet to receive filtered data into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: No more packets available
     *   - AVERROR_EINVAL: Invalid parameters
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av';
     *
     * // Receive all available packets
     * while (true) {
     *   const ret = await ctx.receivePacket(outputPacket);
     *   if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
     *     break;
     *   }
     *   FFmpegError.throwIfError(ret, 'receivePacket');
     *
     *   // Process filtered packet
     *   console.log(`Filtered packet size: ${outputPacket.size}`);
     * }
     * ```
     *
     * @see {@link sendPacket} To submit packets for filtering
     */
    receivePacket(packet: Packet): Promise<number>;
    /**
     * Receive a filtered packet from the bitstream filter synchronously.
     * Synchronous version of receivePacket.
     *
     * Retrieves a packet that has been processed by the filter.
     * May need to be called multiple times after each sendPacketSync().
     *
     * Direct mapping to av_bsf_receive_packet().
     *
     * @param packet - Packet to receive filtered data into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: No more packets available
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av/constants';
     *
     * // Receive filtered packets
     * const outputPacket = new Packet();
     * let ret;
     * while ((ret = ctx.receivePacketSync(outputPacket)) >= 0) {
     *   // Process filtered packet
     *   console.log(`Filtered packet size: ${outputPacket.size}`);
     *   outputPacket.unref();
     * }
     *
     * if (ret !== AVERROR_EAGAIN && ret !== AVERROR_EOF) {
     *   FFmpegError.throwIfError(ret, 'receivePacketSync');
     * }
     * ```
     *
     * @see {@link receivePacket} For async version
     */
    receivePacketSync(packet: Packet): number;
    /**
     * Get the underlying native BitStreamFilterContext object.
     *
     * @returns The native BitStreamFilterContext binding object
     *
     * @internal
     */
    getNative(): NativeBitStreamFilterContext;
    /**
     * Dispose of the bitstream filter context.
     *
     * Implements the Disposable interface for automatic cleanup.
     * Equivalent to calling free().
     *
     * @example
     * ```typescript
     * {
     *   using ctx = new BitStreamFilterContext();
     *   ctx.alloc(filter);
     *   ctx.init();
     *   // Use context...
     * } // Automatically freed when leaving scope
     * ```
     */
    [Symbol.dispose](): void;
}
