import { Packet } from '../lib/packet.js';
import { Muxer } from './muxer.js';
import { Scheduler, SchedulerControl } from './utilities/scheduler.js';
import type { Stream } from '../lib/stream.js';
/**
 * High-level bitstream filter for packet processing.
 *
 * Provides simplified interface for applying bitstream filters to packets.
 * Handles filter initialization, packet processing, and memory management.
 * Supports both synchronous packet-by-packet filtering and async iteration over packets.
 * Supports filters like h264_mp4toannexb, hevc_mp4toannexb, aac_adtstoasc.
 * Essential for format conversion and stream compatibility in transcoding pipelines.
 *
 * @example
 * ```typescript
 * import { BitStreamFilterAPI } from 'node-av/api';
 *
 * // Create H.264 Annex B converter
 * const filter = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
 *
 * // Filter packet
 * const outputPackets = await filter.filterAll(inputPacket);
 * for (const packet of outputPackets) {
 *   await output.writePacket(packet);
 *   packet.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Filter packet stream
 * const filter = BitStreamFilterAPI.create('hevc_mp4toannexb', videoStream);
 *
 * for await (const packet of filter.packets(input.packets())) {
 *   await output.writePacket(packet);
 *   packet.free();
 * }
 * ```
 *
 * @see {@link BitStreamFilter} For available filters
 * @see {@link BitStreamFilterContext} For low-level API
 * @see {@link Muxer} For writing filtered packets
 */
export declare class BitStreamFilterAPI implements Disposable {
    private ctx;
    private bsf;
    private stream;
    private packet;
    private isClosed;
    private inputQueue;
    private outputQueue;
    private workerPromise;
    private nextComponent;
    private pipeToPromise;
    /**
     * @param bsf - Bitstream filter
     *
     * @param ctx - Filter context
     *
     * @param stream - Associated stream
     *
     * @internal
     */
    private constructor();
    /**
     * Create a bitstream filter for a stream.
     *
     * Initializes filter with stream codec parameters.
     * Configures time base and prepares for packet processing.
     *
     * Direct mapping to av_bsf_get_by_name() and av_bsf_alloc().
     *
     * @param filterName - Name of the bitstream filter
     *
     * @param stream - Stream to apply filter to
     *
     * @returns Configured bitstream filter
     *
     * @throws {Error} If initialization fails
     *
     * @throws {FFmpegError} If allocation or initialization fails
     *
     * @example
     * ```typescript
     * // H.264 MP4 to Annex B conversion
     * const filter = BitStreamFilterAPI.create('h264_mp4toannexb', videoStream);
     * ```
     *
     * @example
     * ```typescript
     * // AAC ADTS to ASC conversion
     * const filter = BitStreamFilterAPI.create('aac_adtstoasc', audioStream);
     * ```
     *
     * @example
     * ```typescript
     * // Remove metadata
     * const filter = BitStreamFilterAPI.create('filter_units', stream);
     * ```
     *
     * @see {@link BitStreamFilter.getByName} For filter discovery
     */
    static create(filterName: string, stream: Stream): BitStreamFilterAPI;
    /**
     * Get filter name.
     *
     * @example
     * ```typescript
     * console.log(`Using filter: ${filter.name}`);
     * ```
     */
    get name(): string;
    /**
     * Get output codec parameters.
     *
     * Parameters after filter processing.
     * May differ from input parameters.
     *
     * @example
     * ```typescript
     * const outputParams = filter.outputCodecParameters;
     * console.log(`Output codec: ${outputParams?.codecId}`);
     * ```
     */
    get outputCodecParameters(): import("../index.js").CodecParameters | null;
    /**
     * Get output time base.
     *
     * Time base after filter processing.
     *
     * @example
     * ```typescript
     * const tb = filter.outputTimeBase;
     * console.log(`Output timebase: ${tb?.num}/${tb?.den}`);
     * ```
     */
    get outputTimeBase(): import("../index.js").Rational | null;
    /**
     * Check if filter is open.
     *
     * @example
     * ```typescript
     * if (filter.isBitstreamFilterOpen) {
     *   const packet = await filter.process(frame);
     * }
     * ```
     */
    get isBitstreamFilterOpen(): boolean;
    /**
     * Filter a packet.
     *
     * Sends a packet to the filter and attempts to receive a filtered packet.
     * Handles internal buffering - may return null if more packets needed.
     *
     * **Note**: This method receives only ONE packet per call.
     * A single packet can produce multiple output packets (e.g., codec buffering).
     * To receive all packets from a packet, use {@link filterAll} or {@link packets} instead.
     *
     * Direct mapping to av_bsf_send_packet() and av_bsf_receive_packet().
     *
     * @param packet - Packet to filter
     *
     * @returns Filtered packet, null if more data needed, or null if filter is closed
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * const outPacket = await filter.filter(inputPacket);
     * if (outPacket) {
     *   console.log(`Filtered packet: pts=${outPacket.pts}`);
     *   await output.writePacket(outPacket);
     *   outPacket.free();
     * }
     * ```
     *
     * @see {@link filterAll} For multiple packet filtering
     * @see {@link packets} For stream processing
     * @see {@link flush} For end-of-stream handling
     * @see {@link filterSync} For synchronous version
     */
    filter(packet: Packet): Promise<Packet | null>;
    /**
     * Filter a packet synchronously.
     * Synchronous version of filter.
     *
     * Sends a packet to the filter and attempts to receive a filtered packet.
     * Handles internal buffering - may return null if more packets needed.
     *
     * **Note**: This method receives only ONE packet per call.
     * A single packet can produce multiple output packets (e.g., codec buffering).
     * To receive all packets from a packet, use {@link filterAllSync} or {@link packetsSync} instead.
     *
     * Direct mapping to av_bsf_send_packet() and av_bsf_receive_packet().
     *
     * @param packet - Packet to filter
     *
     * @returns Filtered packet, null if more data needed, or null if filter is closed
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * const outPacket = filter.filterSync(inputPacket);
     * if (outPacket) {
     *   console.log(`Filtered packet: pts=${outPacket.pts}`);
     *   output.writePacketSync(outPacket);
     *   outPacket.free();
     * }
     * ```
     *
     * @see {@link filterAllSync} For multiple packet filtering
     * @see {@link packetsSync} For stream processing
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link filter} For async version
     */
    filterSync(packet: Packet): Packet | null;
    /**
     * Filter a packet to packets.
     *
     * Sends a packet to the filter and receives all available filtered packets.
     * Returns array of packets - may be empty if filter needs more data.
     * One packet can produce zero, one, or multiple packets depending on filter.
     *
     * Direct mapping to av_bsf_send_packet() and av_bsf_receive_packet().
     *
     * @param packet - Packet to filter
     *
     * @returns Array of filtered packets (empty if more data needed or filter is closed)
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * const outputPackets = await filter.filterAll(inputPacket);
     * for (const packet of outputPackets) {
     *   console.log(`Filtered packet: pts=${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filter} For single packet filtering
     * @see {@link packets} For stream processing
     * @see {@link flush} For end-of-stream handling
     * @see {@link filterAllSync} For synchronous version
     */
    filterAll(packet: Packet): Promise<Packet[]>;
    /**
     * Filter a packet to packets synchronously.
     * Synchronous version of filterAll.
     *
     * Sends a packet to the filter and receives all available filtered packets.
     * Returns array of packets - may be empty if filter needs more data.
     * One packet can produce zero, one, or multiple packets depending on filter.
     *
     * Direct mapping to av_bsf_send_packet() and av_bsf_receive_packet().
     *
     * @param packet - Packet to filter
     *
     * @returns Array of filtered packets (empty if more data needed or filter is closed)
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * const outputPackets = filter.filterAllSync(inputPacket);
     * for (const packet of outputPackets) {
     *   console.log(`Filtered packet: pts=${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filterSync} For single packet filtering
     * @see {@link packetsSync} For stream processing
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link filterAll} For async version
     */
    filterAllSync(packet: Packet): Packet[];
    /**
     * Process packet stream through filter.
     *
     * High-level async generator for filtering packet streams.
     * Automatically handles flushing at end of stream.
     * Yields filtered packets ready for output.
     *
     * @param packets - Async iterable of packets
     *
     * @yields {Packet} Filtered packets
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * // Filter entire stream
     * for await (const packet of filter.packets(input.packets())) {
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Chain with decoder
     * const decoder = await Decoder.create(stream);
     * const filter = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
     *
     * for await (const frame of decoder.frames(filter.packets(input.packets()))) {
     *   // Process frames
     *   frame.free();
     * }
     * ```
     *
     * @see {@link filterAll} For filtering single packets
     * @see {@link flush} For end-of-stream handling
     */
    packets(packets: AsyncIterable<Packet | null>): AsyncGenerator<Packet | null>;
    /**
     * Process packet stream through filter synchronously.
     * Synchronous version of packets.
     *
     * High-level sync generator for filtering packet streams.
     * Automatically handles flushing at end of stream.
     * Yields filtered packets ready for output.
     *
     * @param packets - Iterable of packets
     *
     * @yields {Packet} Filtered packets
     *
     * @throws {FFmpegError} If filtering fails
     *
     * @example
     * ```typescript
     * // Filter entire stream
     * for (const packet of filter.packetsSync(packets)) {
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Chain with decoder
     * const decoder = await Decoder.create(stream);
     * const filter = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
     *
     * for (const frame of decoder.framesSync(filter.packetsSync(packets))) {
     *   // Process frames
     *   frame.free();
     * }
     * ```
     *
     * @see {@link packets} For async version
     */
    packetsSync(packets: Iterable<Packet | null>): Generator<Packet | null>;
    /**
     * Flush filter and signal end-of-stream.
     *
     * Sends null packet to filter to signal end-of-stream.
     * Does nothing if filter is closed.
     * Must call receive() or flushPackets() to get remaining buffered packets.
     *
     * Direct mapping to av_bsf_send_packet(NULL) and av_bsf_flush().
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * // Signal end of stream
     * await filter.flush();
     *
     * // Then get remaining packets
     * let packet;
     * while ((packet = await filter.receive()) !== null) {
     *   console.log('Got buffered packet');
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link flushPackets} For async iteration
     * @see {@link receive} For getting buffered packets
     * @see {@link reset} For state reset only
     * @see {@link flushSync} For synchronous version
     */
    flush(): Promise<void>;
    /**
     * Flush filter and signal end-of-stream synchronously.
     * Synchronous version of flush.
     *
     * Sends null packet to filter to signal end-of-stream.
     * Does nothing if filter is closed.
     * Must call receiveSync() or flushPacketsSync() to get remaining buffered packets.
     *
     * Direct mapping to av_bsf_send_packet(NULL) and av_bsf_flush().
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * // Signal end of stream
     * filter.flushSync();
     *
     * // Then get remaining packets
     * let packet;
     * while ((packet = filter.receiveSync()) !== null) {
     *   console.log('Got buffered packet');
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link flushPacketsSync} For sync iteration
     * @see {@link receiveSync} For getting buffered packets
     * @see {@link reset} For state reset only
     * @see {@link flush} For async version
     */
    flushSync(): void;
    /**
     * Receive packet from filter.
     *
     * Gets filtered packets from the filter's internal buffer.
     * Handles packet allocation and error checking.
     * Returns null if filter is closed or no packets available.
     * Call repeatedly until null to drain all buffered packets.
     *
     * Direct mapping to av_bsf_receive_packet().
     *
     * @returns Cloned packet or null if no packets available
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If packet cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * const packet = await filter.receive();
     * if (packet) {
     *   console.log('Got filtered packet');
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Drain all buffered packets
     * let packet;
     * while ((packet = await filter.receive()) !== null) {
     *   console.log(`Packet PTS: ${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filter} For filtering packets
     * @see {@link flush} For signaling end-of-stream
     * @see {@link receiveSync} For synchronous version
     */
    receive(): Promise<Packet | null>;
    /**
     * Receive packet from filter synchronously.
     * Synchronous version of receive.
     *
     * Gets filtered packets from the filter's internal buffer.
     * Handles packet allocation and error checking.
     * Returns null if filter is closed or no packets available.
     * Call repeatedly until null to drain all buffered packets.
     *
     * Direct mapping to av_bsf_receive_packet().
     *
     * @returns Cloned packet or null if no packets available
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If packet cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * const packet = filter.receiveSync();
     * if (packet) {
     *   console.log('Got filtered packet');
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Drain all buffered packets
     * let packet;
     * while ((packet = filter.receiveSync()) !== null) {
     *   console.log(`Packet PTS: ${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filterSync} For filtering packets
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link receive} For async version
     */
    receiveSync(): Packet | null;
    /**
     * Flush all buffered packets as async generator.
     *
     * Convenient async iteration over remaining packets.
     * Automatically sends flush signal and retrieves buffered packets.
     * Useful for end-of-stream processing.
     *
     * @yields {Packet} Buffered packets
     *
     * @example
     * ```typescript
     * // Flush at end of filtering
     * for await (const packet of filter.flushPackets()) {
     *   console.log('Processing buffered packet');
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filter} For filtering packets
     * @see {@link flush} For signaling end-of-stream
     * @see {@link flushPacketsSync} For synchronous version
     */
    flushPackets(): AsyncGenerator<Packet>;
    /**
     * Flush all buffered packets as generator synchronously.
     * Synchronous version of flushPackets.
     *
     * Convenient sync iteration over remaining packets.
     * Automatically retrieves buffered packets after flush.
     * Useful for end-of-stream processing.
     *
     * @yields {Packet} Buffered packets
     *
     * @example
     * ```typescript
     * // Flush at end of filtering
     * for (const packet of filter.flushPacketsSync()) {
     *   console.log('Processing buffered packet');
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link filterSync} For filtering packets
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link flushPackets} For async version
     */
    flushPacketsSync(): Generator<Packet>;
    /**
     * Get associated stream.
     *
     * Returns the stream this filter was created for.
     *
     * @returns Associated stream
     *
     * @example
     * ```typescript
     * const stream = filter.getStream();
     * console.log(`Filtering stream ${stream.index}`);
     * ```
     */
    getStream(): Stream;
    /**
     * Reset filter state.
     *
     * Clears internal buffers and resets filter.
     * Does not dispose resources.
     *
     * Direct mapping to av_bsf_flush().
     *
     * @example
     * ```typescript
     * // Reset for new segment
     * filter.reset();
     * ```
     *
     * @see {@link flush} For reset with packet retrieval
     */
    reset(): void;
    /**
     * Close filter and free resources.
     *
     * Releases filter context and marks as closed.
     * Safe to call multiple times.
     *
     * @example
     * ```typescript
     * filter.close();
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     */
    close(): void;
    /**
     * Dispose of filter.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling dispose().
     *
     * @example
     * ```typescript
     * {
     *   using filter = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
     *   // Use filter...
     * } // Automatically disposed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.dispose](): void;
    /**
     * Send packet to input queue or flush the pipeline.
     *
     * When packet is provided, queues it for filtering.
     * When null is provided, triggers flush sequence:
     * - Closes input queue
     * - Waits for worker completion
     * - Closes output queue (no buffering, bitstream filters are stateless)
     * - Waits for pipeTo task completion
     * - Propagates flush to next component (if any)
     *
     * Used by scheduler system for pipeline control.
     *
     * @param packet - Packet to send, or null to flush
     *
     * @internal
     */
    sendToQueue(packet: Packet | null): Promise<void>;
    /**
     * Receive packet from output queue.
     *
     * @returns Packet from queue or null if closed
     *
     * @internal
     */
    receiveFromQueue(): Promise<Packet | null>;
    /**
     * Worker loop for push-based processing.
     *
     * @internal
     */
    private runWorker;
    /**
     * Pipe output to another bitstream filter.
     *
     * Starts background worker for packet processing.
     * Packets flow through: input → this filter → target filter.
     *
     * @param target - Target bitstream filter
     *
     * @returns Scheduler for continued chaining
     *
     * @example
     * ```typescript
     * const filter1 = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
     * const filter2 = BitStreamFilterAPI.create('dump_extra', stream);
     * filter1.pipeTo(filter2).pipeTo(output, 0);
     * ```
     */
    pipeTo(target: BitStreamFilterAPI): Scheduler<Packet>;
    /**
     * Pipe output to muxer.
     *
     * Terminal stage - writes filtered packets to output file.
     *
     * @param output - Muxer to write to
     *
     * @param streamIndex - Stream index in output
     *
     * @returns Control interface for pipeline
     *
     * @example
     * ```typescript
     * const filter = BitStreamFilterAPI.create('h264_mp4toannexb', stream);
     * const control = filter.pipeTo(output, 0);
     * await control.send(packet);
     * ```
     */
    pipeTo(output: Muxer, streamIndex: number): SchedulerControl<Packet>;
}
