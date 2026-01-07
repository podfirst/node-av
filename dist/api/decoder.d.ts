import { CodecContext } from '../lib/codec-context.js';
import { Codec } from '../lib/codec.js';
import { Frame } from '../lib/frame.js';
import { Packet } from '../lib/packet.js';
import { Scheduler } from './utilities/scheduler.js';
import type { AVCodecID, EOFSignal, FFDecoderCodec } from '../constants/index.js';
import type { Stream } from '../lib/stream.js';
import type { Encoder } from './encoder.js';
import type { FilterAPI } from './filter.js';
import type { DecoderOptions } from './types.js';
/**
 * High-level decoder for audio and video streams.
 *
 * Provides a simplified interface for decoding media streams from packets to frames.
 * Handles codec initialization, hardware acceleration setup, and frame management.
 * Supports both synchronous packet-by-packet decoding and async iteration over frames.
 * Essential component in media processing pipelines for converting compressed data to raw frames.
 *
 * @example
 * ```typescript
 * import { Demuxer, Decoder } from 'node-av/api';
 *
 * // Open media and create decoder
 * await using input = await Demuxer.open('video.mp4');
 * using decoder = await Decoder.create(input.video());
 *
 * // Decode frames
 * for await (const frame of decoder.frames(input.packets())) {
 *   console.log(`Decoded frame: ${frame.width}x${frame.height}`);
 *   frame.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { HardwareContext } from 'node-av/api';
 * import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';
 *
 * // Setup hardware acceleration
 * const hw = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
 * using decoder = await Decoder.create(stream, { hardware: hw });
 *
 * // Frames will be decoded on GPU
 * for await (const frame of decoder.frames(packets)) {
 *   // frame.hwFramesCtx contains GPU memory reference
 * }
 * ```
 *
 * @see {@link Encoder} For encoding frames to packets
 * @see {@link Demuxer} For reading media files
 * @see {@link HardwareContext} For GPU acceleration
 */
export declare class Decoder implements Disposable {
    private codecContext;
    private codec;
    private frame;
    private stream;
    private initialized;
    private isClosed;
    private options;
    private lastFramePts;
    private lastFrameDurationEst;
    private lastFrameTb;
    private lastFrameSampleRate;
    private lastFilterInRescaleDelta;
    private inputQueue;
    private outputQueue;
    private workerPromise;
    private nextComponent;
    private pipeToPromise;
    /**
     * @param codecContext - Configured codec context
     *
     * @param codec - Codec being used
     *
     * @param stream - Media stream being decoded
     *
     * @param options - Decoder options
     *
     * Use {@link create} factory method
     *
     * @internal
     */
    private constructor();
    /**
     * Create a decoder for a media stream.
     *
     * Initializes a decoder with the appropriate codec and configuration.
     * Automatically detects and configures hardware acceleration if provided.
     * Applies custom codec options and threading configuration.
     *
     * @param stream - Media stream to decode
     *
     * @param options - Decoder configuration options
     *
     * @returns Configured decoder instance
     *
     * @throws {FFmpegError} If codec initialization fails
     *
     * @example
     * ```typescript
     * import { Demuxer, Decoder } from 'node-av/api';
     *
     * await using input = await Demuxer.open('video.mp4');
     * using decoder = await Decoder.create(input.video());
     * ```
     *
     * @example
     * ```typescript
     * using decoder = await Decoder.create(stream, {
     *   threads: 4,
     *   options: {
     *     'refcounted_frames': '1',
     *     'skip_frame': 'nonkey'  // Only decode keyframes
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * using decoder = await Decoder.create(stream, {
     *   hardware: hw,
     *   threads: 0  // Auto-detect thread count
     *   exitOnError: false     // Continue on decode errors (default: true)
     * });
     * ```
     *
     * @example
     * ```typescript
     * using decoder = await Decoder.create(stream, FF_DECODER_H264_AMF, {
     *   hardware: hw,
     *   threads: 2,
     * });
     * ```
     *
     * @see {@link HardwareContext} For GPU acceleration setup
     * @see {@link DecoderOptions} For configuration options
     * @see {@link createSync} For synchronous version
     */
    static create(stream: Stream, options?: DecoderOptions): Promise<Decoder>;
    static create(stream: Stream, decoderCodec?: FFDecoderCodec | AVCodecID | Codec, options?: DecoderOptions): Promise<Decoder>;
    /**
     * Create a decoder for a media stream synchronously.
     * Synchronous version of create.
     *
     * Initializes a decoder with the appropriate codec and configuration.
     * Automatically detects and configures hardware acceleration if provided.
     * Applies custom codec options and threading configuration.
     *
     * @param stream - Media stream to decode
     *
     * @param options - Decoder configuration options
     *
     * @returns Configured decoder instance
     *
     * @throws {FFmpegError} If codec initialization fails
     *
     * @example
     * ```typescript
     * import { Demuxer, Decoder } from 'node-av/api';
     *
     * await using input = await Demuxer.open('video.mp4');
     * using decoder = Decoder.createSync(input.video());
     * ```
     *
     * @example
     * ```typescript
     * using decoder = Decoder.createSync(stream, {
     *   threads: 4,
     *   options: {
     *     'refcounted_frames': '1',
     *     'skip_frame': 'nonkey'  // Only decode keyframes
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * using decoder = Decoder.createSync(stream, {
     *   hardware: hw,
     *   threads: 0  // Auto-detect thread count
     * });
     * ```
     *
     * @example
     * ```typescript
     * using decoder = Decoder.createSync(stream, FF_DECODER_H264_NVDEC, {
     *   hardware: hw
     * });
     * ```
     *
     * @see {@link HardwareContext} For GPU acceleration setup
     * @see {@link DecoderOptions} For configuration options
     * @see {@link create} For async version
     */
    static createSync(stream: Stream, options?: DecoderOptions): Decoder;
    static createSync(stream: Stream, decoderCodec?: FFDecoderCodec | AVCodecID | Codec, options?: DecoderOptions): Decoder;
    /**
     * Check if decoder is open.
     *
     * @returns true if decoder is open and ready
     *
     * @example
     * ```typescript
     * if (decoder.isDecoderOpen) {
     *   const frame = await decoder.decode(packet);
     * }
     * ```
     */
    get isDecoderOpen(): boolean;
    /**
     * Check if decoder has been initialized.
     *
     * Returns true if decoder is initialized (true by default for decoders).
     * Decoders are pre-initialized from stream parameters.
     *
     * @returns true if decoder has been initialized
     *
     * @example
     * ```typescript
     * if (decoder.isDecoderInitialized) {
     *   console.log('Decoder is ready to process frames');
     * }
     * ```
     */
    get isDecoderInitialized(): boolean;
    /**
     * Check if decoder uses hardware acceleration.
     *
     * @returns true if hardware-accelerated
     *
     * @example
     * ```typescript
     * if (decoder.isHardware()) {
     *   console.log('Using GPU acceleration');
     * }
     * ```
     *
     * @see {@link HardwareContext} For hardware setup
     */
    isHardware(): boolean;
    /**
     * Check if decoder is ready for processing.
     *
     * @returns true if initialized and ready
     *
     * @example
     * ```typescript
     * if (decoder.isReady()) {
     *   const frame = await decoder.decode(packet);
     * }
     * ```
     */
    isReady(): boolean;
    /**
     * Send a packet to the decoder.
     *
     * Sends a compressed packet to the decoder for decoding.
     * Does not return decoded frames - use {@link receive} to retrieve frames.
     * A single packet can produce zero, one, or multiple frames depending on codec buffering.
     * Automatically manages decoder state and error recovery.
     *
     * **Important**: This method only SENDS the packet to the decoder.
     * You must call {@link receive} separately (potentially multiple times) to get decoded frames.
     *
     * Direct mapping to avcodec_send_packet().
     *
     * @param packet - Compressed packet to send to decoder
     *
     * @throws {FFmpegError} If sending packet fails
     *
     * @example
     * ```typescript
     * // Send packet and receive frames
     * await decoder.decode(packet);
     *
     * // Receive all available frames
     * while (true) {
     *   const frame = await decoder.receive();
     *   if (!frame) break;
     *   console.log(`Decoded frame with PTS: ${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * for await (const packet of input.packets()) {
     *   if (packet.streamIndex === decoder.getStream().index) {
     *     // Send packet
     *     await decoder.decode(packet);
     *
     *     // Receive available frames
     *     let frame;
     *     while ((frame = await decoder.receive())) {
     *       await processFrame(frame);
     *       frame.free();
     *     }
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link receive} For receiving decoded frames
     * @see {@link decodeAll} For combined send+receive operation
     * @see {@link frames} For automatic packet iteration
     * @see {@link flush} For end-of-stream handling
     * @see {@link decodeSync} For synchronous version
     */
    decode(packet: Packet): Promise<void>;
    /**
     * Send a packet to the decoder synchronously.
     * Synchronous version of decode.
     *
     * Sends a compressed packet to the decoder for decoding.
     * Does not return decoded frames - use {@link receiveSync} to retrieve frames.
     * A single packet can produce zero, one, or multiple frames depending on codec buffering.
     * Automatically manages decoder state and error recovery.
     *
     * **Important**: This method only SENDS the packet to the decoder.
     * You must call {@link receiveSync} separately (potentially multiple times) to get decoded frames.
     *
     * Direct mapping to avcodec_send_packet().
     *
     * @param packet - Compressed packet to send to decoder
     *
     * @throws {FFmpegError} If sending packet fails
     *
     * @example
     * ```typescript
     * // Send packet and receive frames
     * await decoder.decode(packet);
     *
     * // Receive all available frames
     * while (true) {
     *   const frame = await decoder.receive();
     *   if (!frame) break;
     *   console.log(`Decoded frame with PTS: ${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * for await (const packet of input.packets()) {
     *   if (packet.streamIndex === decoder.getStream().index) {
     *     // Send packet
     *     await decoder.decode(packet);
     *
     *     // Receive available frames
     *     let frame;
     *     while ((frame = await decoder.receive())) {
     *       await processFrame(frame);
     *       frame.free();
     *     }
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link receiveSync} For receiving decoded frames
     * @see {@link decodeAllSync} For combined send+receive operation
     * @see {@link framesSync} For automatic packet iteration
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link decode} For async version
     */
    decodeSync(packet: Packet): void;
    /**
     * Decode a packet to frames.
     *
     * Sends a packet to the decoder and receives all available decoded frames.
     * Returns array of frames - may be empty if decoder needs more data.
     * One packet can produce zero, one, or multiple frames depending on codec.
     * Automatically manages decoder state and error recovery.
     *
     * Direct mapping to avcodec_send_packet() and avcodec_receive_frame().
     *
     * @param packet - Compressed packet to decode
     *
     * @returns Array of decoded frames (empty if more data needed or decoder is closed)
     *
     * @throws {FFmpegError} If decoding fails
     *
     * @example
     * ```typescript
     * const frames = await decoder.decodeAll(packet);
     * for (const frame of frames) {
     *   console.log(`Decoded frame with PTS: ${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * for await (const packet of input.packets()) {
     *   const frames = await decoder.decodeAll(packet);
     *   for (const frame of frames) {
     *     await processFrame(frame);
     *     frame.free();
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link decode} For single packet decoding
     * @see {@link frames} For automatic packet iteration
     * @see {@link flush} For end-of-stream handling
     * @see {@link decodeAllSync} For synchronous version
     */
    decodeAll(packet: Packet | null): Promise<Frame[]>;
    /**
     * Decode a packet to frames synchronously.
     * Synchronous version of decodeAll.
     *
     * Sends packet to decoder and receives all available decoded frames.
     * Returns array of frames - may be empty if decoder needs more data.
     * One packet can produce zero, one, or multiple frames depending on codec.
     *
     * @param packet - Compressed packet to decode
     *
     * @returns Array of decoded frames (empty if more data needed or decoder is closed)
     *
     * @throws {FFmpegError} If decoding fails
     *
     * @example
     * ```typescript
     * const frames = decoder.decodeAllSync(packet);
     * for (const frame of frames) {
     *   console.log(`Decoded: ${frame.width}x${frame.height}`);
     *   frame.free();
     * }
     *
     * @example
     * ```typescript
     * for (const packet of input.packetsSync()) {
     *   const frames = await decoder.decodeAllSync(packet);
     *   for (const frame of frames) {
     *     processFrame(frame);
     *     frame.free();
     *   }
     *   packet.free();
     * }
     * ```
     *
     * @see {@link decodeSync} For single packet decoding
     * @see {@link framesSync} For automatic packet iteration
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link decodeAll} For async version
     */
    decodeAllSync(packet: Packet | null): Frame[];
    /**
     * Decode packet stream to frame stream.
     *
     * High-level async generator for complete decoding pipeline.
     * Decoder is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based decoding.
     *
     * **EOF Handling:**
     * - Send null to flush decoder and get remaining buffered frames
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - decoder stays open until EOF or close()
     *
     * @param packets - Async iterable of packets, single packet, or null to flush
     *
     * @yields {Frame | null} Decoded frames, followed by null when explicitly flushed
     *
     * @throws {Error} If decoder is closed
     *
     * @throws {FFmpegError} If decoding fails
     *
     * @example
     * ```typescript
     * // Stream of packets with automatic EOF propagation
     * await using input = await Demuxer.open('video.mp4');
     * using decoder = await Decoder.create(input.video());
     *
     * for await (const frame of decoder.frames(input.packets())) {
     *   if (frame === null) {
     *     console.log('Decoding complete');
     *     break;
     *   }
     *   console.log(`Frame: ${frame.width}x${frame.height}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single packet (no automatic flush)
     * for await (const frame of decoder.frames(singlePacket)) {
     *   await encoder.encode(frame);
     *   frame.free();
     * }
     * // Decoder still has buffered frames - send null to flush
     * for await (const frame of decoder.frames(null)) {
     *   if (frame === null) break;
     *   await encoder.encode(frame);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for await (const frame of decoder.frames(null)) {
     *   if (frame === null) {
     *     console.log('All buffered frames flushed');
     *     break;
     *   }
     *   console.log('Buffered frame:', frame.pts);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link decode} For single packet decoding
     * @see {@link Demuxer.packets} For packet source
     * @see {@link framesSync} For sync version
     */
    frames(packets: AsyncIterable<Packet | null> | Packet | null): AsyncGenerator<Frame | null>;
    /**
     * Decode packet stream to frame stream synchronously.
     * Synchronous version of frames.
     *
     * High-level async generator for complete decoding pipeline.
     * Decoder is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based decoding.
     *
     * **EOF Handling:**
     * - Send null to flush decoder and get remaining buffered frames
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - decoder stays open until EOF or close()
     *
     * @param packets - Iterable of packets, single packet, or null to flush
     *
     * @yields {Frame | null} Decoded frames, followed by null when explicitly flushed
     *
     * @throws {Error} If decoder is closed
     *
     * @throws {FFmpegError} If decoding fails
     *
     * @example
     * ```typescript
     * // Stream of packets with automatic EOF propagation
     * await using input = await Demuxer.open('video.mp4');
     * using decoder = await Decoder.create(input.video());
     *
     * for (const frame of decoder.framesSync(input.packetsSync())) {
     *   if (frame === null) {
     *     console.log('Decoding complete');
     *     break;
     *   }
     *   console.log(`Frame: ${frame.width}x${frame.height}`);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single packet (no automatic flush)
     * for (const frame of decoder.framesSync(singlePacket)) {
     *   encoder.encodeSync(frame);
     *   frame.free();
     * }
     * // Decoder still has buffered frames - send null to flush
     * for (const frame of decoder.framesSync(null)) {
     *   if (frame === null) break;
     *   encoder.encodeSync(frame);
     *   frame.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for (const frame of decoder.framesSync(null)) {
     *   if (frame === null) {
     *     console.log('All buffered frames flushed');
     *     break;
     *   }
     *   console.log('Buffered frame:', frame.pts);
     *   frame.free();
     * }
     * ```
     */
    framesSync(packets: Iterable<Packet | null> | Packet | null): Generator<Frame | null>;
    /**
     * Flush decoder and signal end-of-stream.
     *
     * Sends null packet to decoder to signal end-of-stream.
     * Does nothing if decoder is closed.
     * Must use receive() or flushFrames() to get remaining buffered frames.
     *
     * Direct mapping to avcodec_send_packet(NULL).
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * // Signal end of stream
     * await decoder.flush();
     *
     * // Then get remaining frames
     * let frame;
     * while ((frame = await decoder.receive()) !== null) {
     *   console.log('Got buffered frame');
     *   frame.free();
     * }
     * ```
     *
     * @see {@link flushFrames} For convenient async iteration
     * @see {@link receive} For getting buffered frames
     * @see {@link flushSync} For synchronous version
     */
    flush(): Promise<void>;
    /**
     * Flush decoder and signal end-of-stream synchronously.
     * Synchronous version of flush.
     *
     * Send null packet to signal end of input stream.
     * Decoder may still have buffered frames.
     * Call receiveSync() repeatedly to get remaining frames.
     *
     * @throws {FFmpegError} If flush fails
     *
     * @example
     * ```typescript
     * decoder.flushSync();
     * // Get remaining frames
     * let frame;
     * while ((frame = decoder.receiveSync()) !== null) {
     *   console.log('Buffered frame');
     * }
     * ```
     *
     * @see {@link flushFramesSync} For convenient sync iteration
     * @see {@link receiveSync} For getting buffered frames
     * @see {@link flush} For async version
     */
    flushSync(): void;
    /**
     * Flush all buffered frames as async generator.
     *
     * Convenient async iteration over remaining frames.
     * Automatically sends flush signal and retrieves buffered frames.
     * Useful for end-of-stream processing.
     *
     * @yields {Frame} Buffered frames
     *
     * @example
     * ```typescript
     * // Flush at end of decoding
     * for await (const frame of decoder.flushFrames()) {
     *   console.log('Processing buffered frame');
     *   await encoder.encode(frame);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link decode} For sending packets and receiving frames
     * @see {@link flush} For signaling end-of-stream
     * @see {@link flushFramesSync} For synchronous version
     */
    flushFrames(): AsyncGenerator<Frame>;
    /**
     * Flush all buffered frames as generator synchronously.
     * Synchronous version of flushFrames.
     *
     * Convenient sync iteration over remaining frames.
     * Automatically sends flush signal and retrieves buffered frames.
     * Useful for end-of-stream processing.
     *
     * @yields {Frame} Buffered frames
     *
     * @example
     * ```typescript
     * // Flush at end of decoding
     * for (const frame of decoder.flushFramesSync()) {
     *   console.log('Processing buffered frame');
     *   encoder.encodeSync(frame);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link decodeSync} For sending packets and receiving frames
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link flushFrames} For async version
     */
    flushFramesSync(): Generator<Frame>;
    /**
     * Receive frame from decoder.
     *
     * Gets decoded frames from the codec's internal buffer.
     * Handles frame cloning and error checking.
     * Hardware frames include hw_frames_ctx reference.
     * Call repeatedly to drain all buffered frames.
     *
     * **Return Values:**
     * - `Frame` - Successfully decoded frame
     * - `null` - No frame available (AVERROR_EAGAIN), send more packets
     * - `undefined` - End of stream reached (AVERROR_EOF), decoder flushed
     *
     * Direct mapping to avcodec_receive_frame().
     *
     * @returns Decoded frame, null (need more data), or undefined (end of stream)
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * const frame = await decoder.receive();
     * if (frame === EOF) {
     *   console.log('Decoder flushed, no more frames');
     * } else if (frame) {
     *   console.log('Got decoded frame');
     *   frame.free();
     * } else {
     *   console.log('Need more packets');
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Drain all buffered frames (stop on null or EOF)
     * let frame;
     * while ((frame = await decoder.receive()) && frame !== EOF) {
     *   console.log(`Frame PTS: ${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link decode} For sending packets
     * @see {@link flush} For signaling end-of-stream
     * @see {@link receiveSync} For synchronous version
     * @see {@link EOF} For end-of-stream signal
     */
    receive(): Promise<Frame | EOFSignal | null>;
    /**
     * Receive frame from decoder synchronously.
     * Synchronous version of receive.
     *
     * Gets decoded frames from the codec's internal buffer.
     * Handles frame cloning and error checking.
     * Hardware frames include hw_frames_ctx reference.
     * Call repeatedly to drain all buffered frames.
     *
     * **Return Values:**
     * - `Frame` - Successfully decoded frame
     * - `null` - No frame available (AVERROR_EAGAIN), send more packets
     * - `undefined` - End of stream reached (AVERROR_EOF), decoder flushed
     *
     * Direct mapping to avcodec_receive_frame().
     *
     * @returns Decoded frame, null (need more data), or undefined (end of stream)
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * const frame = decoder.receiveSync();
     * if (frame === EOF) {
     *   console.log('Decoder flushed, no more frames');
     * } else if (frame) {
     *   console.log('Got decoded frame');
     *   frame.free();
     * } else {
     *   console.log('Need more packets');
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Drain all buffered frames (stop on null or EOF)
     * let frame;
     * while ((frame = decoder.receiveSync()) && frame !== EOF) {
     *   console.log(`Frame PTS: ${frame.pts}`);
     *   frame.free();
     * }
     * ```
     *
     * @see {@link decodeSync} For sending packets
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link receive} For async version
     * @see {@link EOF} For end-of-stream signal
     */
    receiveSync(): Frame | EOFSignal | null;
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
    pipeTo(target: FilterAPI): Scheduler<Packet>;
    pipeTo(target: Encoder): Scheduler<Packet>;
    /**
     * Close decoder and free resources.
     *
     * Releases codec context and internal frame buffer.
     * Safe to call multiple times.
     * Automatically called by Symbol.dispose.
     *
     * @example
     * ```typescript
     * const decoder = await Decoder.create(stream);
     * try {
     *   // Use decoder
     * } finally {
     *   decoder.close();
     * }
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     */
    close(): void;
    /**
     * Get stream object.
     *
     * Returns the underlying stream being decoded.
     * Provides access to stream metadata and parameters.
     *
     * @returns Stream object
     *
     * @internal
     *
     * @see {@link Stream} For stream details
     */
    getStream(): Stream;
    /**
     * Get decoder codec.
     *
     * Returns the codec used by this decoder.
     * Useful for checking codec capabilities and properties.
     *
     * @returns Codec instance
     *
     * @internal
     *
     * @see {@link Codec} For codec details
     */
    getCodec(): Codec;
    /**
     * Get underlying codec context.
     *
     * Returns the codec context for advanced operations.
     * Useful for accessing low-level codec properties and settings.
     * Returns null if decoder is closed.
     *
     * @returns Codec context or null if closed
     *
     * @internal
     *
     * @see {@link CodecContext} For context details
     */
    getCodecContext(): CodecContext | null;
    /**
     * Worker loop for push-based processing.
     *
     * @internal
     */
    private runWorker;
    /**
     * Send packet to input queue or flush the pipeline.
     *
     * When packet is provided, queues it for processing.
     * When null is provided, triggers flush sequence:
     * - Closes input queue
     * - Waits for worker completion
     * - Flushes decoder and sends remaining frames to output queue
     * - Closes output queue
     * - Waits for pipeTo task completion
     * - Propagates flush to next component (if any)
     *
     * Used by scheduler system for pipeline control.
     *
     * @param packet - Packet to send, or null to flush
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
    private receiveFromQueue;
    /**
     * Estimate video frame duration.
     *
     * Implements FFmpeg CLI's video_duration_estimate() logic.
     * Uses multiple heuristics to determine frame duration when not explicitly available:
     * 1. Frame duration from container (if reliable)
     * 2. Duration from codec framerate
     * 3. PTS difference between frames
     * 4. Stream framerate
     * 5. Last frame's estimated duration
     *
     * @param frame - Frame to estimate duration for
     *
     * @returns Estimated duration in frame's timebase units
     *
     * @internal
     */
    private estimateVideoDuration;
    /**
     * Process video frame after decoding.
     *
     * Implements FFmpeg CLI's video_frame_process() logic.
     * Handles:
     * - Hardware frame transfer to software format
     * - PTS assignment from best_effort_timestamp
     * - PTS extrapolation when missing
     * - Duration estimation
     * - Frame tracking for next frame
     *
     * @param frame - Decoded frame to process
     *
     * @internal
     */
    private processVideoFrame;
    /**
     * Audio samplerate update - handles sample rate changes.
     *
     * Based on FFmpeg's audio_samplerate_update().
     *
     * On sample rate change, chooses a new internal timebase that can represent
     * timestamps from all sample rates seen so far. Uses GCD to find minimal
     * common timebase, with fallback to LCM of common sample rates (28224000).
     *
     * Handles:
     * - Sample rate change detection
     * - Timebase calculation via GCD
     * - Overflow detection and fallback
     * - Frame timebase optimization
     * - Rescaling existing timestamps
     *
     * @param frame - Audio frame to process
     *
     * @returns Timebase to use for this frame
     *
     * @internal
     */
    private audioSamplerateUpdate;
    /**
     * Audio timestamp processing - handles audio frame timestamps.
     *
     * Based on FFmpeg's audio_ts_process().
     *
     * Processes audio frame timestamps with:
     * - Sample rate change handling via audioSamplerateUpdate()
     * - PTS extrapolation when missing (pts_pred)
     * - Gap detection (resets av_rescale_delta state)
     * - Smooth timestamp conversion via av_rescale_delta
     * - Duration calculation from nb_samples
     * - Conversion to filtering timebase {1, sample_rate}
     *
     * Handles:
     * - Dynamic sample rate changes
     * - Missing timestamps (AV_NOPTS_VALUE)
     * - Timestamp gaps/discontinuities
     * - Sample-accurate timestamp generation
     * - Frame duration calculation
     *
     * @param frame - Decoded audio frame to process
     *
     * @internal
     */
    private processAudioFrame;
    /**
     * Dispose of decoder.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling close().
     *
     * @example
     * ```typescript
     * {
     *   using decoder = await Decoder.create(stream);
     *   // Decode frames...
     * } // Automatically closed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.dispose](): void;
}
