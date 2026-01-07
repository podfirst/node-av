import { Frame } from '../lib/frame.js';
import type { EOFSignal } from '../constants/index.js';
import type { IRational } from '../lib/types.js';
import type { FilterComplexOptions } from './types.js';
/**
 * High-level filter_complex API for multi-input/output filtering.
 *
 * Provides simplified interface for complex FFmpeg filter graphs with multiple inputs and outputs.
 * Supports both high-level generator API and low-level manual control.
 *
 * @example
 * ```typescript
 * // High-level API: Simple overlay with frames() generator
 * using complex = FilterComplexAPI.create('[0:v][1:v]overlay=x=100:y=50[out]', {
 *   inputs: [{ label: '0:v' }, { label: '1:v' }],
 *   outputs: [{ label: 'out' }]
 * });
 *
 * // Process multiple input streams automatically
 * for await (using frame of complex.frames('out', {
 *   '0:v': decoder1.frames(packets1),
 *   '1:v': decoder2.frames(packets2)
 * })) {
 *   await encoder.encode(frame);
 * }
 * ```
 *
 * @see {@link FilterAPI} For simple single-input/output filtering
 * @see {@link FilterGraph} For low-level filter graph API
 * @see {@link frames} For high-level stream processing
 * @see {@link process} For low-level manual frame sending
 * @see {@link receive} For low-level manual frame receiving
 */
export declare class FilterComplexAPI implements Disposable {
    private graph;
    private description;
    private options;
    private inputs;
    private outputs;
    private initialized;
    private isClosed;
    private initializePromise;
    private frame;
    /**
     * @param graph - Filter graph instance
     *
     * @param description - Filter description string
     *
     * @param options - Filter complex options
     *
     * @internal
     */
    private constructor();
    /**
     * Create a complex filter with specified configuration.
     *
     * Direct mapping to avfilter_graph_segment_parse() and avfilter_graph_config().
     *
     * @param description - Filter description string (e.g., '[0:v][1:v]overlay[out]')
     *
     * @param options - Filter complex configuration including inputs and outputs
     *
     * @returns Filter complex instance ready to process frames
     *
     * @throws {Error} If configuration is invalid (duplicate labels, no inputs/outputs)
     *
     * @example
     * ```typescript
     * // Simple overlay example
     * using complex = FilterComplexAPI.create(
     *   '[0:v][1:v]overlay=x=100:y=50[out]',
     *   {
     *     inputs: [
     *       { label: '0:v' },  // Base video
     *       { label: '1:v' }   // Overlay video
     *     ],
     *     outputs: [{ label: 'out' }]
     *   }
     * );
     *
     * // Send frames manually
     * await complex.process('0:v', baseFrame);
     * await complex.process('1:v', overlayFrame);
     * using outFrame = await complex.receive('out');
     * ```
     *
     * @see {@link process} For sending frames to inputs
     * @see {@link receive} For getting frames from outputs
     */
    static create(description: string, options: FilterComplexOptions): FilterComplexAPI;
    /**
     * Check if filter complex is open.
     *
     * @returns true if not closed
     *
     * @example
     * ```typescript
     * if (complex.isOpen) {
     *   // Can still consume frames
     * }
     * ```
     */
    get isOpen(): boolean;
    /**
     * Check if filter complex has been initialized.
     *
     * Returns true after first frame set has been processed from all inputs.
     *
     * @returns true if filter graph has been configured
     *
     * @example
     * ```typescript
     * if (!complex.isInitialized) {
     *   console.log('Filter will initialize on first frame set');
     * }
     * ```
     */
    get isInitialized(): boolean;
    /**
     * Get output frame rate.
     *
     * Returns frame rate from the first output's buffersink.
     * Returns null if not initialized or frame rate is not set.
     *
     * @returns Frame rate as rational number or null
     *
     * @example
     * ```typescript
     * const frameRate = complex.frameRate;
     * if (frameRate) {
     *   console.log(`Output: ${frameRate.num}/${frameRate.den} fps`);
     * }
     * ```
     *
     * @see {@link FilterAPI.frameRate} For single-output filter frame rate
     */
    get frameRate(): IRational | null;
    /**
     * Get output time base.
     *
     * Returns time base from the first output's buffersink.
     * Returns null if not initialized.
     *
     * @returns Time base as rational number or null
     *
     * @example
     * ```typescript
     * const timeBase = complex.timeBase;
     * if (timeBase) {
     *   console.log(`Output timeBase: ${timeBase.num}/${timeBase.den}`);
     * }
     * ```
     *
     * @see {@link FilterAPI.timeBase} For single-output filter time base
     */
    get timeBase(): IRational | null;
    /**
     * Process frame by sending to specified input.
     *
     * Sends a frame to the buffersrc of the specified input label.
     * Automatically rescales timestamps to the input's calculated timeBase (CFR/VFR).
     * Pass null to signal end-of-stream for that input.
     *
     * Direct mapping to av_buffersrc_add_frame().
     *
     * @param inLabel - Input label to send frame to
     *
     * @param frame - Frame to process
     *
     * @throws {Error} If input label not found or filter closed
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Process frames one at a time
     * await complex.process('0:v', frame1);
     * await complex.process('1:v', frame2);
     * const outFrame = await complex.receive('out');
     * ```
     *
     * @see {@link receive} For receiving output frames
     * @see {@link flush} For flushing inputs
     * @see {@link processSync} For synchronous version
     */
    process(inLabel: string, frame: Frame): Promise<void>;
    /**
     * Process frame by sending to specified input synchronously.
     * Synchronous version of process.
     *
     * Sends a frame to the buffersrc of the specified input label.
     * Automatically rescales timestamps to the input's calculated timeBase (CFR/VFR).
     * Pass null to signal end-of-stream for that input.
     *
     * Direct mapping to av_buffersrc_add_frame().
     *
     * @param inLabel - Input label to send frame to
     *
     * @param frame - Frame to process
     *
     * @throws {Error} If input label not found or filter closed
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Process frames one at a time
     * complex.processSync('0:v', frame1);
     * complex.processSync('1:v', frame2);
     * const outFrame = complex.receiveSync('out');
     * ```
     *
     * @see {@link receiveSync} For receiving output frames
     * @see {@link flushSync} For flushing inputs
     * @see {@link process} For async version
     */
    processSync(inLabel: string, frame: Frame): void;
    /**
     * Process frame streams from multiple inputs and yield frames from specified output.
     *
     * High-level async generator for multi-input filtering.
     * Filter is only flushed when EOF (null) is explicitly sent to any input.
     *
     * **EOF Handling:**
     * - Filter is only flushed when EOF (null) is explicitly sent to ANY input
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - filter stays open until EOF or close()
     * - Iterator completion without null does not trigger flush
     *
     * @param outLabel - Output label to receive frames from
     *
     * @param inputs - Record mapping input labels to frame sources (AsyncIterable, single Frame, or null)
     *
     * @yields {Frame | null} Filtered frames from output, followed by null when flushed
     *
     * @throws {Error} If input label not found
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Stream processing: 2 inputs, 1 output
     * using complex = FilterComplexAPI.create('[0:v][1:v]overlay[out]', {
     *   inputs: [{ label: '0:v' }, { label: '1:v' }],
     *   outputs: [{ label: 'out' }]
     * });
     *
     * for await (using frame of complex.frames('out', {
     *   '0:v': decoder1.frames(packets1),
     *   '1:v': decoder2.frames(packets2)
     * })) {
     *   await encoder.encode(frame);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frames - no automatic flush
     * for await (using frame of complex.frames('out', {
     *   '0:v': frame1,
     *   '1:v': frame2
     * })) {
     *   await encoder.encode(frame);
     * }
     * // Filter remains open, buffered frames not flushed
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with null
     * for await (using frame of complex.frames('out', {
     *   '0:v': null,
     *   '1:v': null
     * })) {
     *   await encoder.encode(frame);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Mixed: stream + single frame
     * for await (using frame of complex.frames('out', {
     *   '0:v': decoder.frames(packets),  // Stream
     *   '1:v': watermarkFrame            // Single frame (used for all)
     * })) {
     *   await encoder.encode(frame);
     * }
     * ```
     *
     * @see {@link process} For manual frame sending
     * @see {@link receive} For manual frame receiving
     * @see {@link framesSync} For sync version
     */
    frames(outLabel: string, inputs: Record<string, AsyncIterable<Frame | null> | Frame | null>): AsyncGenerator<Frame | null>;
    /**
     * Process frame streams from multiple inputs and yield frames from specified output synchronously.
     * Synchronous version of frames.
     *
     * High-level sync generator for multi-input filtering.
     * Filter is only flushed when EOF (null) is explicitly sent to any input.
     *
     * **EOF Handling:**
     * - Filter is only flushed when EOF (null) is explicitly sent to ANY input
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - filter stays open until EOF or close()
     * - Iterator completion without null does not trigger flush
     *
     * @param outLabel - Output label to receive frames from
     *
     * @param inputs - Record mapping input labels to frame sources (Iterable, single Frame, or null)
     *
     * @yields {Frame | null} Filtered frames from output, followed by null when flushed
     *
     * @throws {Error} If input label not found or filter not initialized
     *
     * @throws {FFmpegError} If processing fails
     *
     * @example
     * ```typescript
     * // Stream processing: 2 inputs, 1 output
     * using complex = FilterComplexAPI.create('[0:v][1:v]overlay[out]', {
     *   inputs: [{ label: '0:v' }, { label: '1:v' }],
     *   outputs: [{ label: 'out' }]
     * });
     *
     * // Note: Sync version requires async initialization first
     * await complex.process('0:v', firstFrame1);
     * await complex.process('1:v', firstFrame2);
     *
     * for (using frame of complex.framesSync('out', {
     *   '0:v': decoder1.framesSync(packets1),
     *   '1:v': decoder2.framesSync(packets2)
     * })) {
     *   encoder.encodeSync(frame);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frames
     * for (using frame of complex.framesSync('out', {
     *   '0:v': frame1,
     *   '1:v': frame2
     * })) {
     *   encoder.encodeSync(frame);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush
     * for (using frame of complex.framesSync('out', {
     *   '0:v': null,
     *   '1:v': null
     * })) {
     *   encoder.encodeSync(frame);
     * }
     * ```
     *
     * @see {@link processSync} For manual frame sending
     * @see {@link receiveSync} For manual frame receiving
     * @see {@link frames} For async version with lazy initialization
     */
    framesSync(outLabel: string, inputs: Record<string, Iterable<Frame | null> | Frame | null>): Generator<Frame | null>;
    /**
     * Flush input(s) and signal end-of-stream.
     *
     * Sends null frame to buffersrc filter(s) to flush buffered data.
     * Must call receive() on outputs to get flushed frames.
     * Does nothing if filter is closed or was never initialized.
     *
     * Direct mapping to av_buffersrc_add_frame(NULL).
     *
     * @param inLabel - Input label to flush. If not specified, flushes all inputs.
     *
     * @throws {Error} If input label not found
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * // Flush specific input
     * await complex.flush('0:v');
     *
     * // Flush all inputs
     * await complex.flush();
     *
     * // Get remaining frames from output
     * let frame;
     * while ((frame = await complex.receive('out')) !== null) {
     *   frame.free();
     * }
     * ```
     *
     * @see {@link flushFrames} For async iteration
     * @see {@link receive} For getting flushed frames
     * @see {@link flushSync} For synchronous version
     */
    flush(inLabel?: string): Promise<void>;
    /**
     * Flush input(s) and signal end-of-stream synchronously.
     * Synchronous version of flush.
     *
     * Sends null frame to buffersrc filter(s) to flush buffered data.
     * Must call receiveSync() on outputs to get flushed frames.
     * Does nothing if filter is closed or was never initialized.
     *
     * Direct mapping to av_buffersrc_add_frame(NULL).
     *
     * @param inLabel - Input label to flush. If not specified, flushes all inputs.
     *
     * @throws {Error} If input label not found
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * // Flush specific input
     * complex.flushSync('0:v');
     *
     * // Flush all inputs
     * complex.flushSync();
     *
     * // Get remaining frames from output
     * let frame;
     * while ((frame = complex.receiveSync('out')) !== null) {
     *   frame.free();
     * }
     * ```
     *
     * @see {@link flushFramesSync} For sync iteration
     * @see {@link receiveSync} For getting flushed frames
     * @see {@link flush} For async version
     */
    flushSync(inLabel?: string): void;
    /**
     * Flush all inputs and yield remaining frames from specified output.
     *
     * Convenience method that:
     * 1. Calls flush() to send EOF to all inputs
     * 2. Yields all remaining frames from the specified output
     * 3. Continues until EOF is reached
     *
     * Automatically frees yielded frames after use (using declaration).
     *
     * @param outLabel - Output label to receive flushed frames from
     *
     * @yields {Frame} Remaining frames from filter after flush
     *
     * @throws {Error} If output label not found or filter not initialized
     *
     * @throws {FFmpegError} If flushing or receiving fails
     *
     * @example
     * ```typescript
     * // Process all frames, then flush
     * for await (using frame of inputFrames) {
     *   await complex.process('0:v', frame);
     * }
     *
     * // Get all remaining frames
     * for await (using frame of complex.flushFrames('out')) {
     *   await encoder.encode(frame);
     * }
     * ```
     *
     * @see {@link flush} For flushing without iteration
     * @see {@link receive} For manual frame retrieval
     * @see {@link flushFramesSync} For synchronous version
     */
    flushFrames(outLabel: string): AsyncGenerator<Frame>;
    /**
     * Flush all inputs and yield remaining frames from specified output synchronously.
     * Synchronous version of flushFrames.
     *
     * Convenience method that:
     * 1. Calls flushSync() to send EOF to all inputs
     * 2. Yields all remaining frames from the specified output
     * 3. Continues until EOF is reached
     *
     * Automatically frees yielded frames after use (using declaration).
     *
     * @param outLabel - Output label to receive flushed frames from
     *
     * @yields {Frame} Remaining frames from filter after flush
     *
     * @throws {Error} If output label not found or filter not initialized
     *
     * @throws {FFmpegError} If flushing or receiving fails
     *
     * @example
     * ```typescript
     * // Process all frames, then flush
     * for (using frame of inputFrames) {
     *   complex.processSync('0:v', frame);
     * }
     *
     * // Get all remaining frames
     * for (using frame of complex.flushFramesSync('out')) {
     *   encoder.encodeSync(frame);
     * }
     * ```
     *
     * @see {@link flushSync} For flushing without iteration
     * @see {@link receiveSync} For manual frame retrieval
     * @see {@link flushFrames} For async version
     */
    flushFramesSync(outLabel: string): Generator<Frame>;
    /**
     * Receive filtered frame from specified output.
     *
     * Pulls a single frame from the buffersink of the specified output.
     * Automatically post-processes frame (sets timeBase, calculates duration).
     * Returns cloned frame - caller must free it.
     *
     * Return values:
     * - Frame: Successfully received frame (caller must free)
     * - null: Need more input (AVERROR_EAGAIN) - call process() to send more frames
     * - EOF: End of stream reached
     *
     * Direct mapping to av_buffersink_get_frame().
     *
     * @param outLabel - Output label to receive from
     *
     * @returns Frame on success, null if need more input, EOF if finished
     *
     * @throws {Error} If output label not found or filter not initialized
     *
     * @throws {FFmpegError} If receive fails with unexpected error
     *
     * @example
     * ```typescript
     * // Process frames one at a time
     * await complex.process('0:v', frame1);
     * const outFrame = await complex.receive('out');
     * if (outFrame && outFrame !== EOF) {
     *   // Use frame
     *   outFrame.free();
     * }
     * ```
     *
     * @see {@link process} For sending input frames
     * @see {@link flush} For flushing after all input
     * @see {@link receiveSync} For synchronous version
     */
    receive(outLabel: string): Promise<Frame | EOFSignal | null>;
    /**
     * Receive filtered frame from specified output synchronously.
     * Synchronous version of receive.
     *
     * Pulls a single frame from the buffersink of the specified output.
     * Automatically post-processes frame (sets timeBase, calculates duration).
     * Returns cloned frame - caller must free it.
     *
     * Return values:
     * - Frame: Successfully received frame (caller must free)
     * - null: Need more input (AVERROR_EAGAIN) - call processSync() to send more frames
     * - EOF: End of stream reached
     *
     * Direct mapping to av_buffersink_get_frame().
     *
     * @param outLabel - Output label to receive from
     *
     * @returns Frame on success, null if need more input, EOF if finished
     *
     * @throws {Error} If output label not found or filter not initialized
     *
     * @throws {FFmpegError} If receive fails with unexpected error
     *
     * @example
     * ```typescript
     * // Process frames one at a time
     * complex.processSync('0:v', frame1);
     * const outFrame = complex.receiveSync('out');
     * if (outFrame && outFrame !== EOF) {
     *   // Use frame
     *   outFrame.free();
     * }
     * ```
     *
     * @see {@link processSync} For sending input frames
     * @see {@link flushSync} For flushing after all input
     * @see {@link receive} For async version
     */
    receiveSync(outLabel: string): Frame | EOFSignal | null;
    /**
     * Check if all inputs have received at least one frame (have format information).
     *
     * @returns true if all inputs have format info (first frame received)
     *
     * @internal
     */
    private hasAllInputFormats;
    /**
     * Initialize filter graph from queued frames.
     *
     * Implements FFmpeg's configure_filtergraph() logic:
     * 1. Create buffersrc filters from first queued frame of each input
     * 2. Parse filter description
     * 3. Create buffersink filters
     * 4. Configure graph with avfilter_graph_config()
     * 5. Send all queued frames to buffersrc
     *
     * @throws {Error} If initialization fails
     *
     * @throws {FFmpegError} If configuration fails
     *
     * @internal
     */
    private initializeFromQueuedFrames;
    /**
     * Initialize filter graph from queued frames synchronously.
     * Synchronous version of initializeFromQueuedFrames.
     *
     * @throws {Error} If closed or inputs have no queued frames
     *
     * @throws {FFmpegError} If graph configuration or frame processing fails
     *
     * @internal
     */
    private initializeFromQueuedFramesSync;
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
     * Rescale frame timestamps to calculated timeBase.
     *
     * Helper to avoid code duplication when rescaling timestamps.
     * Modifies the frame in-place.
     *
     * @param frame - Frame to rescale
     *
     * @param calculatedTimeBase - Target timeBase
     *
     * @internal
     */
    private rescaleFrameTimestamps;
    /**
     * Create buffer source for an input.
     *
     * @param label - Input label
     *
     * @param frame - First frame from this input
     *
     * @param timeBase - Calculated timeBase for this input (from calculateTimeBase)
     *
     * @returns BufferSrc filter context
     *
     * @throws {Error} If creation fails
     *
     * @internal
     */
    private createBufferSource;
    /**
     * Create buffer sink for an output.
     *
     * @param label - Output label
     *
     * @param isVideo - Whether this is a video output
     *
     * @returns BufferSink filter context
     *
     * @throws {Error} If creation fails
     *
     * @internal
     */
    private createBufferSink;
    /**
     * Parse filter description and build graph using segment API.
     *
     * @throws {Error} If parsing fails
     *
     * @throws {FFmpegError} If graph construction fails
     *
     * @internal
     */
    private parseFilterDescription;
    /**
     * Link buffersrc filters to segment inputs.
     *
     * Iterates through FilterInOut chain and links by label.
     *
     * @param inputs - FilterInOut chain of segment inputs
     *
     * @throws {Error} If linking fails
     *
     * @internal
     */
    private linkBufferSources;
    /**
     * Link segment outputs to buffersink filters.
     *
     * Iterates through FilterInOut chain and links by label.
     *
     * @param outputs - FilterInOut chain of segment outputs
     *
     * @throws {Error} If linking fails
     *
     * @internal
     */
    private linkBufferSinks;
    /**
     * Post-process output frame from buffersink.
     *
     * Applies FFmpeg's fg_output_step() behavior:
     * 1. Sets frame.timeBase from buffersink (filters can change timeBase)
     * 2. Calculates video frame duration from frame rate if not set
     *
     * This must be called AFTER buffersinkGetFrame() for every output frame.
     *
     * @param frame - Output frame from buffersink
     *
     * @param buffersink - The buffersink context
     *
     * @internal
     */
    private postProcessOutputFrame;
    /**
     * Close filter complex and release resources.
     *
     * Frees queued frames, filter graph and all filter contexts.
     * Safe to call multiple times.
     *
     * @example
     * ```typescript
     * complex.close();
     * ```
     *
     * @example
     * ```typescript
     * // Automatic cleanup with using
     * {
     *   using complex = FilterComplexAPI.create('[0:v]scale=640:480[out]', { ... });
     *   // Use complex...
     * } // Automatically freed
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     */
    close(): void;
    /**
     * Dispose of filter complex.
     *
     * Implements Disposable interface for automatic cleanup.
     *
     * @example
     * ```typescript
     * {
     *   using complex = FilterComplexAPI.create('[0:v]scale=640:480[out]', { ... });
     *   // Use complex...
     * } // Automatically freed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.dispose](): void;
}
