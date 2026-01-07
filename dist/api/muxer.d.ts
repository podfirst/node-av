import { FormatContext } from '../lib/format-context.js';
import { Packet } from '../lib/packet.js';
import { Encoder } from './encoder.js';
import type { OutputFormat, Stream } from '../lib/index.js';
import type { IOOutputCallbacks, MuxerOptions } from './types.js';
export interface AddStreamOptionsWithEncoder {
    encoder?: Encoder;
}
export interface AddStreamOptionsWithInputStream {
    inputStream?: Stream;
}
/**
 * High-level muxer for writing and muxing media files.
 *
 * Provides simplified access to media muxing and file writing operations.
 * Automatically manages header and trailer writing - header is written on first packet,
 * trailer is written on close. Supports lazy initialization for both encoders and streams.
 * Handles stream configuration, packet writing, and format management.
 * Supports files, URLs, and custom I/O with automatic cleanup.
 * Essential component for media encoding pipelines and transcoding.
 *
 * @example
 * ```typescript
 * import { Muxer } from 'node-av/api';
 *
 * // Create output file
 * await using output = await Muxer.open('output.mp4');
 *
 * // Add streams from encoders
 * const videoIdx = output.addStream(videoEncoder);
 * const audioIdx = output.addStream(audioEncoder);
 *
 * // Write packets - header written automatically on first packet
 * await output.writePacket(packet, videoIdx);
 *
 * // Close - trailer written automatically
 * // (automatic with await using)
 * ```
 *
 * @example
 * ```typescript
 * // Stream copy
 * await using input = await Demuxer.open('input.mp4');
 * await using output = await Muxer.open('output.mp4');
 *
 * // Copy stream configuration
 * const videoIdx = output.addStream(input.video());
 *
 * // Process packets - header/trailer handled automatically
 * for await (const packet of input.packets()) {
 *   await output.writePacket(packet, videoIdx);
 *   packet.free();
 * }
 * ```
 *
 * @see {@link Demuxer} For reading media files
 * @see {@link Encoder} For encoding frames to packets
 * @see {@link FormatContext} For low-level API
 */
export declare class Muxer implements AsyncDisposable, Disposable {
    private formatContext;
    private options;
    private _streams;
    private ioContext?;
    private headerWritten;
    private headerWritePromise?;
    private trailerWritten;
    private isClosed;
    private syncQueue?;
    private sqPacket?;
    private containerMetadataCopied;
    private writeQueue?;
    private writeWorkerPromise?;
    /**
     * @param options - Media output options
     *
     * @internal
     */
    private constructor();
    /**
     * Open muxer for writing.
     *
     * Creates and configures output context for muxing.
     * Automatically creates directories for file output.
     * Supports files, URLs, and custom I/O callbacks.
     *
     * Direct mapping to avformat_alloc_output_context2() and avio_open2().
     *
     * @param target - File path, URL, or I/O callbacks
     *
     * @param options - Output configuration options
     *
     * @returns Opened muxer instance
     *
     * @throws {Error} If format required for custom I/O
     *
     * @throws {FFmpegError} If allocation or opening fails
     *
     * @example
     * ```typescript
     * // Create file output
     * await using output = await Muxer.open('output.mp4');
     * ```
     *
     * @example
     * ```typescript
     * // Create output with specific format
     * await using output = await Muxer.open('output.ts', {
     *   format: 'mpegts'
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Custom I/O callbacks
     * const callbacks = {
     *   write: async (buffer: Buffer) => {
     *     // Write to custom destination
     *     return buffer.length;
     *   },
     *   seek: async (offset: bigint, whence: AVSeekWhence) => {
     *     // Seek in custom destination
     *     return offset;
     *   }
     * };
     *
     * await using output = await Muxer.open(callbacks, {
     *   format: 'mp4',
     *   bufferSize: 8192
     * });
     * ```
     *
     * @see {@link MuxerOptions} For configuration options
     * @see {@link IOOutputCallbacks} For custom I/O interface
     */
    static open(target: string, options?: MuxerOptions): Promise<Muxer>;
    static open(target: IOOutputCallbacks, options: MuxerOptions & {
        format: string;
    }): Promise<Muxer>;
    /**
     * Open muxer for writing synchronously.
     * Synchronous version of open.
     *
     * Creates and configures output context for muxing.
     * Automatically creates directories for file output.
     * Supports files, URLs, and custom I/O callbacks.
     *
     * Direct mapping to avformat_alloc_output_context2() and avio_open2().
     *
     * @param target - File path, URL, or I/O callbacks
     *
     * @param options - Output configuration options
     *
     * @returns Opened muxer instance
     *
     * @throws {Error} If format required for custom I/O
     *
     * @throws {FFmpegError} If allocation or opening fails
     *
     * @example
     * ```typescript
     * // Create file output
     * using output = Muxer.openSync('output.mp4');
     * ```
     *
     * @example
     * ```typescript
     * // Create output with specific format
     * using output = Muxer.openSync('output.ts', {
     *   format: 'mpegts'
     * });
     * ```
     *
     * @see {@link open} For async version
     */
    static openSync(target: string, options?: MuxerOptions): Muxer;
    static openSync(target: IOOutputCallbacks, options: MuxerOptions & {
        format: string;
    }): Muxer;
    /**
     * Check if output is open.
     *
     * @example
     * ```typescript
     * if (!output.isOutputOpen) {
     *   console.log('Output is not open');
     * }
     * ```
     */
    get isOpen(): boolean;
    /**
     * Check if output is initialized.
     *
     * All streams have been initialized.
     * This occurs after the first packet has been written to each stream.
     *
     * @example
     * ```typescript
     * if (!output.isOutputInitialized) {
     *   console.log('Output is not initialized');
     * }
     * ```
     */
    get streamsInitialized(): boolean;
    /**
     * Get all streams in the media.
     *
     * @example
     * ```typescript
     * for (const stream of output.streams) {
     *   console.log(`Stream ${stream.index}: ${stream.codecpar.codecType}`);
     * }
     * ```
     */
    get streams(): Stream[];
    /**
     * Get format name.
     *
     * Returns 'unknown' if output is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(`Format: ${output.formatName}`); // "mov,mp4,m4a,3gp,3g2,mj2"
     * ```
     */
    get formatName(): string;
    /**
     * Get format long name.
     *
     * Returns 'Unknown Format' if output is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(`Format: ${output.formatLongName}`); // "QuickTime / MOV"
     * ```
     */
    get formatLongName(): string;
    /**
     * Get MIME type of the output format.
     *
     * Returns format's native MIME type.
     * For DASH/HLS formats, use {@link getStreamMimeType} for stream-specific MIME types.
     *
     * Returns null if output is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(mp4Output.mimeType); // "video/mp4"
     * console.log(dashOutput.mimeType); // null (DASH has no global MIME type)
     *
     * // For DASH/HLS, get MIME type per stream:
     * console.log(dashOutput.getStreamMimeType(0)); // "video/mp4"
     * ```
     */
    get mimeType(): string | null;
    /**
     * Add a stream to the output (encoder-only mode).
     *
     * Configures output stream from encoder. Stream is initialized lazily from first encoded frame.
     * Use this when generating frames programmatically without an input stream.
     *
     * @param encoder - Encoder for encoding frames to packets
     *
     * @param options - Stream configuration options
     *
     * @param options.inputStream - Optional input stream for metadata/properties
     *
     * @param options.timeBase - Optional custom timebase for the stream
     *
     * @returns Stream index for packet writing
     *
     * @throws {Error} If called after packets have been written or output closed
     *
     * @example
     * ```typescript
     * // Encoder-only (e.g., frame generator)
     * const encoder = await Encoder.create(FF_ENCODER_LIBX264);
     * const streamIdx = output.addStream(encoder);
     * ```
     *
     * @example
     * ```typescript
     * // Encoder with input stream for metadata
     * const streamIdx = output.addStream(encoder, {
     *   inputStream: input.video()
     * });
     * ```
     */
    addStream(encoder: Encoder, options?: AddStreamOptionsWithInputStream): number;
    /**
     * Add a stream to the output (stream copy or transcoding mode).
     *
     * Configures output stream from input stream and optional encoder.
     * Must be called before writing any packets.
     * Returns stream index for packet writing.
     *
     * Automatically copies from input stream:
     * - Codec parameters (stream copy mode)
     * - Metadata
     * - Disposition flags
     * - Frame rates and aspect ratios
     * - Duration hints
     * - HDR/Dolby Vision side data (coded_side_data)
     *
     * When encoder is provided:
     * - Stream is initialized lazily from first encoded frame
     * - Metadata and disposition copied from input stream
     * - Duration hint used for muxer
     *
     * Direct mapping to avformat_new_stream().
     *
     * @param stream - Input stream (source for properties/metadata)
     *
     * @param options - Stream configuration options
     *
     * @param options.encoder - Optional encoder for transcoding
     *
     * @param options.timeBase - Optional custom timebase for the stream
     *
     * @returns Stream index for packet writing
     *
     * @throws {Error} If called after packets have been written or output closed
     *
     * @example
     * ```typescript
     * // Stream copy
     * const videoIdx = output.addStream(input.video());
     * const audioIdx = output.addStream(input.audio());
     * ```
     *
     * @example
     * ```typescript
     * // With encoding
     * const videoIdx = output.addStream(input.video(), {
     *   encoder: videoEncoder
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Stream copy with custom timebase
     * const streamIdx = output.addStream(input.video(), {
     *   timeBase: { num: 1, den: 90000 }
     * });
     * ```
     *
     * @see {@link writePacket} For writing packets to streams
     * @see {@link Encoder} For transcoding source
     */
    addStream(stream: Stream, options?: AddStreamOptionsWithEncoder): number;
    /**
     * Get output stream by index.
     *
     * Returns the stream at the specified index.
     * Use the stream index returned by addStream().
     *
     * @param index - Stream index (returned by addStream)
     *
     * @returns Stream or undefined if index is invalid
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('output.mp4');
     * const videoIdx = output.addStream(encoder);
     *
     * // Get the output stream to inspect codec parameters
     * const stream = output.getStream(videoIdx);
     * if (stream) {
     *   console.log(`Output codec: ${stream.codecpar.codecId}`);
     * }
     * ```
     *
     * @see {@link addStream} For adding streams
     * @see {@link video} For getting video streams
     * @see {@link audio} For getting audio streams
     */
    getStream(index: number): Stream | undefined;
    /**
     * Get video stream by index.
     *
     * Returns the nth video stream (0-based index).
     * Returns undefined if stream doesn't exist.
     *
     * @param index - Video stream index (default: 0)
     *
     * @returns Video stream or undefined
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('output.mp4');
     * output.addStream(videoEncoder);
     *
     * // Get first video stream
     * const videoStream = output.video();
     * if (videoStream) {
     *   console.log(`Video output: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
     * }
     * ```
     *
     * @see {@link audio} For audio streams
     * @see {@link getStream} For direct stream access
     */
    video(index?: number): Stream | undefined;
    /**
     * Get audio stream by index.
     *
     * Returns the nth audio stream (0-based index).
     * Returns undefined if stream doesn't exist.
     *
     * @param index - Audio stream index (default: 0)
     *
     * @returns Audio stream or undefined
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('output.mp4');
     * output.addStream(audioEncoder);
     *
     * // Get first audio stream
     * const audioStream = output.audio();
     * if (audioStream) {
     *   console.log(`Audio output: ${audioStream.codecpar.sampleRate}Hz`);
     * }
     * ```
     *
     * @see {@link video} For video streams
     * @see {@link getStream} For direct stream access
     */
    audio(index?: number): Stream | undefined;
    /**
     * Get output format.
     *
     * Returns the output format used for muxing.
     * May be null if format context not initialized.
     *
     * @returns Output format or null
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('output.mp4');
     * const format = output.outputFormat();
     * if (format) {
     *   console.log(`Output format: ${format.name}`);
     * }
     * ```
     *
     * @see {@link OutputFormat} For format details
     */
    outputFormat(): OutputFormat | null;
    /**
     * Write a packet to the output.
     *
     * Writes muxed packet to the specified stream.
     * Automatically handles:
     * - Stream initialization on first packet (lazy initialization)
     * - Codec parameter configuration from encoder or input stream
     * - Header writing on first packet
     * - Timestamp rescaling between source and output timebases
     * - Sync queue for proper interleaving
     *
     * For encoder sources, the encoder must have processed at least one frame
     * before packets can be written (encoder must be initialized).
     *
     * Uses FFmpeg CLI's sync queue pattern: buffers packets per stream and writes
     * them in DTS order using av_compare_ts for timebase-aware comparison.
     *
     * To signal EOF for a stream, pass null as the packet.
     * This tells the muxer that no more packets will be sent for this stream.
     * The trailer is written only when close() is called.
     *
     * Direct mapping to avformat_write_header() (on first packet) and av_interleaved_write_frame().
     *
     * @param packet - Packet to write (or null to signal EOF for the stream)
     *
     * @param streamIndex - Target stream index
     *
     * @throws {Error} If stream invalid or encoder not initialized
     *
     * @throws {FFmpegError} If write fails
     *
     * @example
     * ```typescript
     * // Write encoded packet - header written automatically on first packet
     * const packet = await encoder.encode(frame);
     * if (packet) {
     *   await output.writePacket(packet, videoIdx);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Stream copy with packet processing
     * for await (const packet of input.packets()) {
     *   if (packet.streamIndex === inputVideoIdx) {
     *     await output.writePacket(packet, outputVideoIdx);
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link addStream} For adding streams
     */
    writePacket(packet: Packet | null | undefined, streamIndex: number): Promise<void>;
    /**
     * Write a packet to the output synchronously.
     * Synchronous version of writePacket.
     *
     * Writes muxed packet to the specified stream.
     * Automatically handles:
     * - Stream initialization on first packet (lazy initialization)
     * - Codec parameter configuration from encoder or input stream
     * - Header writing on first packet
     * - Timestamp rescaling between source and output timebases
     * - Sync queue for proper interleaving
     *
     * For encoder sources, the encoder must have processed at least one frame
     * before packets can be written (encoder must be initialized).
     *
     * Uses FFmpeg CLI's sync queue pattern: buffers packets per stream and writes
     * them in DTS order using av_compare_ts for timebase-aware comparison.
     *
     * To signal EOF for a stream, pass null as the packet.
     * This tells the muxer that no more packets will be sent for this stream.
     * The trailer is written only when close() is called.
     *
     * Direct mapping to avformat_write_header() (on first packet) and av_interleaved_write_frame().
     *
     * @param packet - Packet to write (or null/undefined to signal EOF)
     *
     * @param streamIndex - Target stream index
     *
     * @throws {Error} If stream invalid or encoder not initialized
     *
     * @throws {FFmpegError} If write fails
     *
     * @example
     * ```typescript
     * // Write encoded packet - header written automatically on first packet
     * const packet = encoder.encodeSync(frame);
     * if (packet) {
     *   output.writePacketSync(packet, videoIdx);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Stream copy with packet processing
     * for (const packet of input.packetsSync()) {
     *   if (packet.streamIndex === inputVideoIdx) {
     *     output.writePacketSync(packet, outputVideoIdx);
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link writePacket} For async version
     */
    writePacketSync(packet: Packet | null | undefined, streamIndex: number): void;
    /**
     * Close muxer and free resources.
     *
     * Automatically writes trailer if header was written.
     * Closes the output file and releases all resources.
     * Safe to call multiple times.
     * Automatically called by Symbol.asyncDispose.
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('output.mp4');
     * try {
     *   // Use output - trailer written automatically on close
     * } finally {
     *   await output.close();
     * }
     * ```
     *
     * @see {@link Symbol.asyncDispose} For automatic cleanup
     */
    close(): Promise<void>;
    /**
     * Close muxer and free resources synchronously.
     * Synchronous version of close.
     *
     * Automatically writes trailer if header was written.
     * Closes the output file and releases all resources.
     * Safe to call multiple times.
     * Automatically called by Symbol.dispose.
     *
     * @example
     * ```typescript
     * const output = Muxer.openSync('output.mp4');
     * try {
     *   // Use output - trailer written automatically on close
     * } finally {
     *   output.closeSync();
     * }
     * ```
     *
     * @see {@link close} For async version
     */
    closeSync(): void;
    /**
     * Get underlying format context.
     *
     * Returns the internal format context for advanced operations.
     *
     * @returns Format context
     *
     * @internal
     */
    getFormatContext(): FormatContext;
    /**
     * Setup sync queues based on stream configuration.
     *
     * Called before writing header.
     * Muxing sync queue is created only if nb_interleaved > nb_av_enc
     * (i.e., when there are streamcopy streams).
     *
     * All streams are added as non-limiting (FFmpeg default without -shortest),
     * which means no timestamp-based synchronization - frames are output immediately.
     *
     * @internal
     */
    private setupSyncQueues;
    /**
     * Flush all PreMuxQueues in DTS-sorted order.
     *
     * Implements FFmpeg's PreMuxQueue flush algorithm from mux_task_start().
     * Repeatedly finds the stream with the earliest DTS packet and sends it:
     * - WITH SyncQueue: Sends to SyncQueue for interleaving
     * - WITHOUT SyncQueue: Writes directly to muxer
     * NULL packets (EOF markers) and packets with AV_NOPTS_VALUE have priority (sent first).
     *
     * @internal
     */
    private flushPreMuxQueues;
    /**
     * Flush all PreMuxQueues in DTS-sorted order (synchronous version).
     *
     * Implements FFmpeg's PreMuxQueue flush algorithm from mux_task_start().
     * Repeatedly finds the stream with the earliest DTS packet and sends it:
     * - WITH SyncQueue: Sends to SyncQueue for interleaving
     * - WITHOUT SyncQueue: Writes directly to muxer
     * NULL packets (EOF markers) and packets with AV_NOPTS_VALUE have priority (sent first).
     *
     * @internal
     */
    private flushPreMuxQueuesSync;
    /**
     * Write a packet to the output.
     *
     * @param pkt - Packet to write
     *
     * @param streamInfo - Stream description
     *
     * @param streamIndex - Stream index
     *
     * @internal
     */
    private write;
    /**
     * Internal write implementation.
     * Called either directly or through the write worker.
     *
     * @param pkt - Packet to write
     *
     * @param streamInfo - Stream description
     *
     * @param streamIndex - Stream index
     *
     * @internal
     */
    private writeInternal;
    /**
     * Start background worker for async write queue.
     * Processes write jobs sequentially to prevent race conditions.
     *
     * @internal
     */
    private startWriteWorker;
    /**
     * Write a packet to the output synchronously.
     * Synchronous version of write.
     *
     * @param pkt - Packet to write
     *
     * @param streamInfo - Stream description
     *
     * @param streamIndex - Stream index
     *
     * @internal
     */
    private writeSync;
    /**
     * Streamcopy packet filtering and timestamp offset.
     *
     * Applies streamcopy-specific logic before muxing:
     * 1. Recording time limit check
     * 2. Skip non-keyframe packets at start (unless copyInitialNonkeyframes)
     * 3. Skip packets before ts_copy_start (unless copyPriorStart)
     * 4. Skip packets before startTime
     * 5. Apply start_time timestamp offset
     *
     * @param pkt - Packet to process
     *
     * @param streamInfo - Stream description
     *
     * @param streamIndex - Stream index
     *
     * @returns true if packet should be written, false if packet should be skipped
     *
     * @throws {Error} If recording time limit reached
     *
     * @internal
     */
    private ofStreamcopy;
    /**
     * Fix packet timestamps before muxing.
     *
     * Performs timestamp corrections:
     * 1. Rescales timestamps to output timebase (av_rescale_delta for audio streamcopy)
     * 2. Sets pkt.timeBase to output stream timebase
     * 3. Fixes invalid DTS > PTS relationships
     * 4. Enforces monotonic DTS (never decreasing)
     *
     * @param pkt - Packet to fix
     *
     * @param streamInfo - Stream description
     *
     * @param streamIndex - Stream index
     *
     * @internal
     */
    private muxFixupTs;
    /**
     * Copy container metadata from input to output.
     *
     * Automatically copies global metadata from input Demuxer to output format context.
     * Only copies once (on first call). Removes duration/creation_time metadata.
     *
     * @internal
     */
    private copyContainerMetadata;
    /**
     * Auto-set DEFAULT disposition for first stream of each type.
     *
     * FFmpeg automatically sets DEFAULT flag for the first stream of each type
     * if no stream of that type has DEFAULT set yet.
     *
     * @internal
     */
    private updateDefaultDisposition;
    /**
     * Dispose of muxer.
     *
     * Implements AsyncDisposable interface for automatic cleanup.
     * Equivalent to calling close().
     *
     * @example
     * ```typescript
     * {
     *   await using output = await Muxer.open('output.mp4');
     *   // Use output...
     * } // Automatically closed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Dispose of muxer synchronously.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling closeSync().
     *
     * @example
     * ```typescript
     * {
     *   using output = Muxer.openSync('output.mp4');
     *   // Use output...
     * } // Automatically closed
     * ```
     *
     * @see {@link closeSync} For manual cleanup
     */
    [Symbol.dispose](): void;
}
