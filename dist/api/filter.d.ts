import { Frame } from '../lib/frame.js';
import { Scheduler } from './utilities/scheduler.js';
import type { AVColorRange, AVColorSpace, AVFilterCmdFlag, AVPixelFormat, AVSampleFormat, EOFSignal } from '../constants/index.js';
import type { FilterContext } from '../lib/filter-context.js';
import type { ChannelLayout, IDimension, IRational } from '../lib/types.js';
import type { Encoder } from './encoder.js';
import type { FilterOptions } from './types.js';
/**
 * High-level filter API for audio and video processing.
 *
 * Provides simplified interface for applying FFmpeg filters to frames.
 * Handles filter graph construction, frame buffering, and command control.
 * Supports both software and hardware-accelerated filtering operations.
 * Essential component for effects, transformations, and format conversions.
 *
 * @example
 * ```typescript
 * import { FilterAPI } from 'node-av/api';
 *
 * // Create video filter - initializes on first frame
 * const filter = FilterAPI.create('scale=1280:720', {
 *   timeBase: video.timeBase,
 * });
 *
 * // Process frame - first frame configures filter graph
 * const output = await filter.process(inputFrame);
 * if (output) {
 *   console.log(`Filtered frame: ${output.width}x${output.height}`);
 *   output.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Hardware-accelerated filtering - hw context detected from frame
 * const filter = FilterAPI.create('hwupload,scale_cuda=1920:1080,hwdownload', {
 *   timeBase: video.timeBase,
 * });
 * // Hardware frames context will be automatically detected from first frame
 * ```
 *
 * @see {@link FilterGraph} For low-level filter graph API
 * @see {@link Frame} For frame operations
 */
export declare class FilterAPI implements Disposable {
    private graph;
    private description;
    private options;
    private buffersrcCtx;
    private buffersinkCtx;
    private frame;
    private initializePromise;
    private initialized;
    private isClosed;
    private calculatedTimeBase;
    private lastFrameProps;
    private inputQueue;
    private outputQueue;
    private workerPromise;
    private nextComponent;
    private pipeToPromise;
    /**
     * @param graph - Filter graph instance
     *
     * @param description - Filter description string
     *
     * @param options - Filter options
     *
     * @internal
     */
    private constructor();
    /**
     * Create a filter with specified description and configuration.
     *
     * Direct mapping to avfilter_graph_parse_ptr() and avfilter_graph_config().
     *
     * @param description - Filter graph description
     *
     * @param options - Filter options
     *
     * @returns Configured filter instance
     *
     * @throws {Error} If cfr=true but framerate is not set
     *
     * @example
     * ```typescript
     * // Simple video filter (VFR mode, auto timeBase)
     * const filter = FilterAPI.create('scale=640:480');
     * ```
     *
     * @example
     * ```typescript
     * // CFR mode with constant framerate
     * const filter = FilterAPI.create('scale=1920:1080', {
     *   cfr: true,
     *   framerate: { num: 25, den: 1 }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Audio filter with resampling
     * const filter = FilterAPI.create('aformat=sample_fmts=s16:sample_rates=44100', {
     *   audioResampleOpts: 'async=1'
     * });
     * ```
     *
     * @see {@link process} For frame processing
     * @see {@link FilterOptions} For configuration options
     */
    static create(description: string, options?: FilterOptions): FilterAPI;
    /**
     * Check if filter is open.
     *
     * @example
     * ```typescript
     * if (filter.isFilterOpen) {
     *   const output = await filter.process(frame);
     * }
     * ```
     */
    get isFilterOpen(): boolean;
    /**
     * Check if filter has been initialized.
     *
     * Returns true after first frame has been processed and filter graph configured.
     * Useful for checking if filter has received frame properties.
     *
     * @returns true if filter graph has been built from first frame
     *
     * @example
     * ```typescript
     * if (!filter.isFilterInitialized) {
     *   console.log('Filter will initialize on first frame');
     * }
     * ```
     */
    get isFilterInitialized(): boolean;
    /**
     * Get buffersink filter context.
     *
     * Provides access to the buffersink filter context for advanced operations.
     * Returns null if filter is not initialized.
     *
     * @returns Buffersink context or null
     *
     * @example
     * ```typescript
     * const sink = filter.buffersink;
     * if (sink) {
     *   const fr = sink.buffersinkGetFrameRate();
     *   console.log(`Output frame rate: ${fr.num}/${fr.den}`);
     * }
     * ```
     */
    get buffersink(): FilterContext | null;
    /**
     * Output frame rate from filter graph.
     *
     * Returns the frame rate determined by the filter graph output.
     * Returns null if filter is not initialized or frame rate is not set.
     *
     * Direct mapping to av_buffersink_get_frame_rate().
     *
     * @returns Frame rate or null if not available
     *
     * @example
     * ```typescript
     * const frameRate = filter.frameRate;
     * if (frameRate) {
     *   console.log(`Filter output: ${frameRate.num}/${frameRate.den} fps`);
     * }
     * ```
     *
     * @see {@link timeBase} For output timebase
     */
    get frameRate(): IRational | null;
    /**
     * Output time base from filter graph.
     *
     * Returns the time base of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_time_base() behavior.
     *
     * Direct mapping to av_buffersink_get_time_base().
     *
     * @returns Time base or null if not initialized
     *
     * @example
     * ```typescript
     * const timeBase = filter.timeBase;
     * if (timeBase) {
     *   console.log(`Filter timebase: ${timeBase.num}/${timeBase.den}`);
     * }
     * ```
     *
     * @see {@link frameRate} For output frame rate
     */
    get timeBase(): IRational | null;
    /**
     * Output format from filter graph.
     *
     * Returns the pixel format (video) or sample format (audio) of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_format() behavior.
     *
     * Direct mapping to av_buffersink_get_format().
     *
     * @returns Pixel format or sample format, or null if not initialized
     *
     * @example
     * ```typescript
     * const format = filter.format;
     * if (format !== null) {
     *   console.log(`Filter output format: ${format}`);
     * }
     * ```
     */
    get format(): AVPixelFormat | AVSampleFormat | null;
    /**
     * Output dimensions from filter graph (video only).
     *
     * Returns the width and height of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_w() and av_buffersink_get_h() behavior.
     * Only meaningful for video filters.
     *
     * Direct mapping to av_buffersink_get_w() and av_buffersink_get_h().
     *
     * @returns Dimensions object or null if not initialized
     *
     * @example
     * ```typescript
     * const dims = filter.dimensions;
     * if (dims) {
     *   console.log(`Filter output: ${dims.width}x${dims.height}`);
     * }
     * ```
     */
    get dimensions(): IDimension | null;
    /**
     * Output sample rate from filter graph (audio only).
     *
     * Returns the sample rate of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_sample_rate() behavior.
     * Only meaningful for audio filters.
     *
     * Direct mapping to av_buffersink_get_sample_rate().
     *
     * @returns Sample rate or null if not initialized
     *
     * @example
     * ```typescript
     * const sampleRate = filter.sampleRate;
     * if (sampleRate) {
     *   console.log(`Filter output sample rate: ${sampleRate} Hz`);
     * }
     * ```
     */
    get sampleRate(): number | null;
    /**
     * Output channel layout from filter graph (audio only).
     *
     * Returns the channel layout of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_ch_layout() behavior.
     * Only meaningful for audio filters.
     *
     * Direct mapping to av_buffersink_get_ch_layout().
     *
     * @returns Channel layout or null if not initialized
     *
     * @example
     * ```typescript
     * const layout = filter.channelLayout;
     * if (layout) {
     *   console.log(`Filter output channels: ${layout.nbChannels}`);
     * }
     * ```
     */
    get channelLayout(): ChannelLayout | null;
    /**
     * Output color space from filter graph (video only).
     *
     * Returns the color space of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_colorspace() behavior.
     * Only meaningful for video filters.
     *
     * Direct mapping to av_buffersink_get_colorspace().
     *
     * @returns Color space or null if not initialized
     *
     * @example
     * ```typescript
     * const colorSpace = filter.colorSpace;
     * if (colorSpace !== null) {
     *   console.log(`Filter output color space: ${colorSpace}`);
     * }
     * ```
     */
    get colorSpace(): AVColorSpace | null;
    /**
     * Output color range from filter graph (video only).
     *
     * Returns the color range of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_color_range() behavior.
     * Only meaningful for video filters.
     *
     * Direct mapping to av_buffersink_get_color_range().
     *
     * @returns Color range or null if not initialized
     *
     * @example
     * ```typescript
     * const colorRange = filter.colorRange;
     * if (colorRange !== null) {
     *   console.log(`Filter output color range: ${colorRange}`);
     * }
     * ```
     */
    get colorRange(): AVColorRange | null;
    /**
     * Output sample aspect ratio from filter graph (video only).
     *
     * Returns the sample aspect ratio of the buffersink output.
     * Matches FFmpeg CLI's av_buffersink_get_sample_aspect_ratio() behavior.
     * Only meaningful for video filters.
     *
     * Direct mapping to av_buffersink_get_sample_aspect_ratio().
     *
     * @returns Sample aspect ratio or null if not initialized
     *
     * @example
     * ```typescript
     * const sar = filter.sampleAspectRatio;
     * if (sar) {
     *   console.log(`Filter output SAR: ${sar.num}:${sar.den}`);
     * }
     * ```
     */
    get sampleAspectRatio(): IRational | null;
    /**
     * Check if filter is ready for processing.
     *
     * @returns true if initialized and ready
     *
     * @example
     * ```typescript
     * if (filter.isReady()) {
     *   const output = await filter.process(frame);
     * }
     * ```
     */
    isReady(): boolean;
    /**
     * Get filter graph description.
     *
     * Returns human-readable graph structure.
     * Useful for debugging filter chains.
     *
     * Direct mapping to avfilter_graph_dump().
     *
     * @returns Graph description or null if closed
     *
     * @example
     * ```typescript
     * const description = filter.getGraphDescription();
     * console.log('Filter graph:', description);
     * ```
     */
    getGraphDescription(): string | null;
    /**
     * Send a frame to the filter.
     *
     * Sends a frame to the filter for processing.
     * Does not return filtered frames - use {@link receive} to retrieve frames.
     * On first frame, automatically builds filter graph with frame properties.
     * A single input frame can produce zero, one, or multiple output frames.
     *
     * **Important**: This method only SENDS the frame to the filter.
     * You must call {@link receive} separately (potentially multiple times) to get filtered frames.
     *
     * Direct mapping to av_buffersrc_add_frame().
     *
     * @param frame - Input frame to send to filter
     *
     * @throws {Error} If filter could not be initialized
     *
     * @throws {FFmpegError} If sending frame fails
     *
     * @example
     * ```typescript
     * // Send frame and receive filtered frames
     * await filter.process(inputFrame);
     *
     * // Receive all available filtered frames
     * while (true) {
     *   const output = await filter.receive();
     *   if (!output) break;
     *   console.log(`Got filtered frame: pts=${output.pts}`);
     *   output.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * for await (const frame of decoder.frames(input.packets())) {
     *   // Send frame
     *   await filter.process(frame);
     *
     *   // Receive available filtered frames
     *   let output;
     *   while ((output = await filter.receive())) {
     *     await encoder.encode(output);
     *     output.free();
     *   }
     *   frame.free();
     * }
     * ```
     *
     * @see {@link receive} For receiving filtered frames
     * @see {@link processAll} For combined send+receive operation
     * @see {@link frames} For processing frame streams
     * @see {@link flush} For end-of-stream handling
     * @see {@link processSync} For synchronous version
     */
    process(frame: Frame): Promise<void>;
    /**
     * Send a frame to the filter synchronously.
     * Synchronous version of process.
     *
     * Sends a frame to the filter for processing.
     * Does not return filtered frames - use {@link receiveSync} to retrieve frames.
     * On first frame, automatically builds filter graph with frame properties.
     * A single input frame can produce zero, one, or multiple output frames.
     *
     * **Important**: This method only SENDS the frame to the filter.
     * You must call {@link receiveSync} separately (potentially multiple times) to get filtered frames.
     *
     * Direct mapping to av_buffersrc_add_frame().
     *
     * @param frame - Input frame to send to filter
     *
     * @throws {Error} If filter could not be initialized
     *
     * @throws {FFmpegError} If sending frame fails
     *
     * @example
     * ```typescript
     * // Send frame and receive filtered frames
     * filter.processSync(inputFrame);
     *
     * // Receive all available filtered frames
     * let output;
     * while ((output = filter.receiveSync())) {
     *   console.log(`Got filtered frame: pts=${output.pts}`);
     *   output.free();
     * }
     * ```
     *
     * @see {@link receiveSync} For receiving filtered frames
     * @see {@link processAllSync} For combined send+receive operation
     * @see {@link framesSync} For processing frame streams
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link process} For async version
     */
    processSync(frame: Frame): void;
    /**
     * Process a frame through the filter.
     *
     * Applies filter operations to input frame and receives all available output frames.
     * Returns array of frames - may be empty if filter needs more input.
     * On first frame, automatically builds filter graph with frame properties.
     * One input frame can produce zero, one, or multiple output frames depending on filter.
     * Hardware frames context is automatically detected from frame.
     *
     * Direct mapping to av_buffersrc_add_frame() and av_buffersink_get_frame().
     *
     * @param frame - Input frame to process
     *
     * @returns Array of filtered frames (empty if buffered or filter closed)
     *
     * @throws {Error} If filter could not be initialized
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * const frames = await filter.processAll(inputFrame);
     * for (const output of frames) {
     *   console.log(`Got filtered frame: pts=${output.pts}`);
     *   output.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Process frame - may return multiple frames (e.g. fps filter)
     * const frames = await filter.processAll(frame);
     * for (const output of frames) {
     *   yield output;
     * }
     * ```
     *
     * @see {@link process} For single frame processing
     * @see {@link frames} For processing frame streams
     * @see {@link flush} For end-of-stream handling
     * @see {@link processAllSync} For synchronous version
     */
    processAll(frame: Frame | null): Promise<Frame[]>;
    /**
     * Process a frame through the filter synchronously.
     * Synchronous version of processAll.
     *
     * Applies filter operations to input frame and receives all available output frames.
     * Returns array of frames - may be empty if filter needs more input.
     * On first frame, automatically builds filter graph with frame properties.
     * One input frame can produce zero, one, or multiple output frames depending on filter.
     * Hardware frames context is automatically detected from frame.
     *
     * Direct mapping to av_buffersrc_add_frame() and av_buffersink_get_frame().
     *
     * @param frame - Input frame to process
     *
     * @returns Array of filtered frames (empty if buffered or filter closed)
     *
     * @throws {Error} If filter could not be initialized
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * const outputs = filter.processAllSync(inputFrame);
     * for (const output of outputs) {
     *   console.log(`Got filtered frame: pts=${output.pts}`);
     *   output.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Process frame - may return multiple frames (e.g. fps filter)
     * const outputs = filter.processAllSync(frame);
     * for (const output of outputs) {
     *   yield output;
     * }
     * ```
     *
     * @see {@link processSync} For single frame processing
     * @see {@link framesSync} For processing frame streams
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link process} For async version
     */
    processAllSync(frame: Frame): Frame[];
    /**
     * Process frame stream through filter.
     *
     * High-level async generator for filtering frame streams.
     * Filter is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based filtering.
     *
     * **EOF Handling:**
     * - Send null to flush filter and get remaining buffered frames
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - filter stays open until EOF or close()
     *
     * @param frames - Async iterable of frames, single frame, or null to flush
     *
     * @yields {Frame | null} Filtered frames, followed by null when explicitly flushed
     *
     * @throws {Error} If filter not ready
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Stream of frames with automatic EOF propagation
     * for await (const frame of filter.frames(decoder.frames(packets))) {
     *   if (frame === null) {
     *     console.log('Filter flushed');
     *     break;
     *   }
     *   await encoder.encode(frame);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frame - no automatic flush
     * for await (const frame of filter.frames(singleFrame)) {
     *   await encoder.encode(frame);
     *   frame.free();
     * }
     * // Filter remains open, buffered frames not flushed
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for await (const frame of filter.frames(null)) {
     *   if (frame === null) {
     *     console.log('All buffered frames flushed');
     *     break;
     *   }
     *   console.log('Buffered frame:', frame.pts);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link process} For single frame processing
     * @see {@link Decoder.frames} For frames source
     * @see {@link framesSync} For sync version
     */
    frames(frames: AsyncIterable<Frame | null> | Frame | null): AsyncGenerator<Frame | null>;
    /**
     * Process frame stream through filter synchronously.
     * Synchronous version of frames.
     *
     * High-level sync generator for filtering frame streams.
     * Filter is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based filtering.
     *
     * **EOF Handling:**
     * - Send null to flush filter and get remaining buffered frames
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - filter stays open until EOF or close()
     *
     * @param frames - Iterable of frames, single frame, or null to flush
     *
     * @yields {Frame | null} Filtered frames, followed by null when explicitly flushed
     *
     * @throws {Error} If filter not ready
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Stream of frames with automatic EOF propagation
     * for (const frame of filter.framesSync(decoder.framesSync(packets))) {
     *   if (frame === null) {
     *     console.log('Filter flushed');
     *     break;
     *   }
     *   encoder.encodeSync(frame);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frame - no automatic flush
     * for (const frame of filter.framesSync(singleFrame)) {
     *   encoder.encodeSync(frame);
     *   frame.free();
     * }
     * // Filter remains open, buffered frames not flushed
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for (const frame of filter.framesSync(null)) {
     *   if (frame === null) {
     *     console.log('All buffered frames flushed');
     *     break;
     *   }
     *   console.log('Buffered frame:', frame.pts);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link processSync} For single frame processing
     * @see {@link Decoder.framesSync} For frames source
     * @see {@link frames} For async version
     */
    framesSync(frames: Iterable<Frame | null> | Frame | null): Generator<Frame | null>;
    /**
     * Flush filter and signal end-of-stream.
     *
     * Sends null frame to flush buffered data.
     * Must call receive() to get flushed frames.
     * Does nothing if filter is closed or was never initialized.
     *
     * Direct mapping to av_buffersrc_add_frame(NULL).
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * await filter.flush();
     * // Get remaining frames
     * let frame;
     * while ((frame = await filter.receive()) !== null) {
     *   frame.free();
     * }
     * ```
     *
     * @see {@link flushFrames} For async iteration
     * @see {@link receive} For getting flushed frames
     * @see {@link flushSync} For synchronous version
     */
    flush(): Promise<void>;
    /**
     * Flush filter and signal end-of-stream synchronously.
     * Synchronous version of flush.
     *
     * Sends null frame to flush buffered data.
     * Must call receiveSync() to get flushed frames.
     * Does nothing if filter is closed or was never initialized.
     *
     * Direct mapping to av_buffersrc_add_frame(NULL).
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * filter.flushSync();
     * // Get remaining frames
     * let frame;
     * while ((frame = filter.receiveSync()) !== null) {
     *   frame.free();
     * }
     * ```
     *
     * @see {@link flushFramesSync} For sync iteration
     * @see {@link receiveSync} For getting flushed frames
     * @see {@link flush} For async version
     */
    flushSync(): void;
    /**
     * Flush filter and yield remaining frames.
     *
     * Convenient async generator for flushing.
     * Combines flush and receive operations.
     * Returns immediately if filter is closed or was never initialized.
     *
     * @yields {Frame} Remaining frames from filter
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * for await (const frame of filter.flushFrames()) {
     *   console.log(`Flushed frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link process} For frame processing
     * @see {@link flush} For manual flush
     * @see {@link flushFramesSync} For sync version
     */
    flushFrames(): AsyncGenerator<Frame>;
    /**
     * Flush filter and yield remaining frames synchronously.
     * Synchronous version of flushFrames.
     *
     * Convenient sync generator for flushing.
     * Combines flush and receive operations.
     * Returns immediately if filter is closed or was never initialized.
     *
     * @yields {Frame} Remaining frames from filter
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * for (const frame of filter.flushFramesSync()) {
     *   console.log(`Flushed frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link processSync} For frame processing
     * @see {@link flushSync} For manual flush
     * @see {@link flushFrames} For async version
     */
    flushFramesSync(): Generator<Frame>;
    /**
     * Receive buffered frame from filter.
     *
     * Drains frames buffered by the filter.
     * Call repeatedly until null or EOF to get all buffered frames.
     * Implements FFmpeg's send/receive pattern.
     *
     * **Return Values:**
     * - `Frame` - Successfully received frame (AVERROR >= 0)
     * - `null` - Need more input data (AVERROR_EAGAIN), or filter not initialized
     * - `undefined` - End of stream reached (AVERROR_EOF), or filter is closed
     *
     * Direct mapping to av_buffersink_get_frame().
     *
     * @returns Buffered frame, null if need more data, or undefined if stream ended
     *
     * @throws {FFmpegError} If receiving fails
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * // Process all buffered frames
     * while (true) {
     *   const frame = await filter.receive();
     *   if (!frame) break; // Stop on EAGAIN or EOF
     *   console.log(`Received frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Handle each return value explicitly
     * const frame = await filter.receive();
     * if (frame === EOF) {
     *   console.log('Filter stream ended');
     * } else if (frame === null) {
     *   console.log('Need more input data');
     * } else {
     *   console.log(`Got frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link process} For frame processing
     * @see {@link flush} For flushing filter
     * @see {@link receiveSync} For synchronous version
     * @see {@link EOF} For end-of-stream signal
     */
    receive(): Promise<Frame | EOFSignal | null>;
    /**
     * Receive buffered frame from filter synchronously.
     * Synchronous version of receive.
     *
     * Drains frames buffered by the filter.
     * Call repeatedly until null or EOF to get all buffered frames.
     * Implements FFmpeg's send/receive pattern.
     *
     * **Return Values:**
     * - `Frame` - Successfully received frame (AVERROR >= 0)
     * - `null` - Need more input data (AVERROR_EAGAIN), or filter not initialized
     * - `undefined` - End of stream reached (AVERROR_EOF), or filter is closed
     *
     * Direct mapping to av_buffersink_get_frame().
     *
     * @returns Buffered frame, null if need more data, or undefined if stream ended
     *
     * @throws {FFmpegError} If receiving fails
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * // Process all buffered frames
     * while (true) {
     *   const frame = filter.receiveSync();
     *   if (!frame) break; // Stop on EAGAIN or EOF
     *   console.log(`Received frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Handle each return value explicitly
     * const frame = filter.receiveSync();
     * if (frame === EOF) {
     *   console.log('Filter stream ended');
     * } else if (frame === null) {
     *   console.log('Need more input data');
     * } else {
     *   console.log(`Got frame: pts=${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link processSync} For frame processing
     * @see {@link flushSync} For flushing filter
     * @see {@link receive} For async version
     * @see {@link EOF} For end-of-stream signal
     */
    receiveSync(): Frame | EOFSignal | null;
    /**
     * Send command to filter.
     *
     * Sends runtime command to specific filter in graph.
     * Allows dynamic parameter adjustment.
     *
     * Direct mapping to avfilter_graph_send_command().
     *
     * @param target - Target filter name
     *
     * @param cmd - Command name
     *
     * @param arg - Command argument
     *
     * @param flags - Command flags
     *
     * @returns Response string from filter
     *
     * @throws {Error} If filter not ready
     *
     * @throws {FFmpegError} If command fails
     *
     * @example
     * ```typescript
     * // Change volume at runtime
     * const response = filter.sendCommand('volume', 'volume', '0.5');
     * console.log(`Volume changed: ${response}`);
     * ```
     *
     * @see {@link queueCommand} For delayed commands
     */
    sendCommand(target: string, cmd: string, arg: string, flags?: AVFilterCmdFlag): string;
    /**
     * Queue command for later execution.
     *
     * Schedules command to execute at specific timestamp.
     * Useful for synchronized parameter changes.
     *
     * Direct mapping to avfilter_graph_queue_command().
     *
     * @param target - Target filter name
     *
     * @param cmd - Command name
     *
     * @param arg - Command argument
     *
     * @param ts - Timestamp for execution
     *
     * @param flags - Command flags
     *
     * @throws {Error} If filter not ready
     *
     * @throws {FFmpegError} If queue fails
     *
     * @example
     * ```typescript
     * // Queue volume change at 10 seconds
     * filter.queueCommand('volume', 'volume', '0.8', 10.0);
     * ```
     *
     * @see {@link sendCommand} For immediate commands
     */
    queueCommand(target: string, cmd: string, arg: string, ts: number, flags?: AVFilterCmdFlag): void;
    /**
     * Pipe decoded frames to a filter component or encoder.
     *
     * @param target - Filter to receive frames or encoder to encode frames
     *
     * @returns Scheduler for continued chaining
     *
     * @example
     * ```typescript
     * decoder.pipeTo(filter).pipeTo(encoder)
     * ```
     */
    pipeTo(target: FilterAPI): Scheduler<Frame>;
    pipeTo(target: Encoder): Scheduler<Frame>;
    /**
     * Free filter resources.
     *
     * Releases filter graph and contexts.
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
     * Worker loop for push-based processing.
     *
     * @internal
     */
    private runWorker;
    /**
     * Send frame to input queue or flush the pipeline.
     *
     * When frame is provided, queues it for filtering.
     * When null is provided, triggers flush sequence:
     * - Closes input queue
     * - Waits for worker completion
     * - Flushes filter and sends remaining frames to output queue
     * - Closes output queue
     * - Waits for pipeTo task completion
     * - Propagates flush to next component (if any)
     *
     * Used by scheduler system for pipeline control.
     *
     * @param frame - Frame to send, or null to flush
     *
     * @internal
     */
    private sendToQueue;
    /**
     * Receive frame from output queue.
     *
     * @returns Frame from output queue or null if closed
     *
     * @internal
     */
    private receiveFrame;
    /**
     * Initialize filter graph from first frame.
     *
     * Creates and configures filter graph components.
     * Sets buffer source parameters from frame properties.
     * Automatically configures hardware frames context if present.
     *
     * @param frame - First frame to process, provides format and hw context
     *
     * @throws {Error} If initialization fails
     *
     * @throws {FFmpegError} If configuration fails
     *
     * @internal
     */
    private initialize;
    /**
     * Initialize filter graph from first frame synchronously.
     * Synchronous version of initialize.
     *
     * Creates and configures filter graph components.
     * Sets buffer source parameters from frame properties.
     * Automatically configures hardware frames context if present.
     *
     * @param frame - First frame to process, provides format and hw context
     *
     * @throws {Error} If initialization fails
     *
     * @throws {FFmpegError} If configuration fails
     *
     * @internal
     *
     * @see {@link initialize} For async version
     */
    private initializeSync;
    /**
     * Check if frame properties changed and handle according to dropOnChange/allowReinit options.
     *
     * Implements FFmpeg's IFILTER_FLAG_DROPCHANGED and IFILTER_FLAG_REINIT logic
     *
     * @param frame - Frame to check
     *
     * @returns true if frame should be processed, false if frame should be dropped
     *
     * @throws {Error} If format changed and allowReinit is false
     *
     * @internal
     */
    private checkFramePropertiesChanged;
    /**
     * Calculate timeBase from frame based on media type and CFR option.
     *
     * Implements FFmpeg's ifilter_parameters_from_frame logic:
     * - Audio: Always { 1, sample_rate }
     * - Video CFR: 1/framerate (inverse of framerate)
     * - Video VFR: Use frame.timeBase
     *
     * @param frame - Input frame
     *
     * @returns Calculated timeBase
     *
     * @internal
     */
    private calculateTimeBase;
    /**
     * Post-process output frame from buffersink.
     *
     * Applies FFmpeg's fg_output_step() behavior:
     * 1. Sets frame.timeBase from buffersink (filters can change timeBase, e.g., aresample)
     * 2. Calculates video frame duration from frame rate if not set
     *
     * This must be called AFTER buffersinkGetFrame() for every output frame.
     *
     * @param frame - Output frame from buffersink
     *
     * @throws {Error} If buffersink context not available
     *
     * @internal
     */
    private postProcessOutputFrame;
    /**
     * Create buffer source with frame parameters.
     *
     * Configures buffer source with frame properties including hardware context.
     * Automatically detects video/audio and sets appropriate parameters.
     *
     * @param frame - Frame providing format, dimensions, and hw_frames_ctx
     *
     * @throws {Error} If creation fails
     *
     * @throws {FFmpegError} If configuration fails
     *
     * @internal
     */
    private createBufferSource;
    /**
     * Create buffer sink.
     *
     * @param frame - Frame
     *
     * @throws {Error} If creation fails
     *
     * @internal
     */
    private createBufferSink;
    /**
     * Parse filter description and build graph.
     *
     * Uses the Segment API to parse filters, which allows setting hw_device_ctx
     * before filter initialization when needed. Works for both hardware and software filters.
     *
     * @param frame - First frame to process, provides hw_frames_ctx if any
     *
     * @throws {Error} If parsing fails
     *
     * @throws {FFmpegError} If graph construction fails
     *
     * @internal
     */
    private parseFilterDescription;
    /**
     * Dispose of filter.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling close().
     *
     * @example
     * ```typescript
     * {
     *   using filter = FilterAPI.create('scale=640:480', { ... });
     *   // Use filter...
     * } // Automatically freed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.dispose](): void;
}
