import { CodecContext } from '../lib/codec-context.js';
import { Codec } from '../lib/codec.js';
import { Frame } from '../lib/frame.js';
import { Packet } from '../lib/packet.js';
import { SchedulerControl } from './utilities/scheduler.js';
import type { AVCodecFlag, AVCodecID, EOFSignal, FFEncoderCodec } from '../constants/index.js';
import type { Muxer } from './muxer.js';
import type { EncoderOptions } from './types.js';
/**
 * High-level encoder for audio and video streams.
 *
 * Provides a simplified interface for encoding media frames to packets.
 * Handles codec initialization, hardware acceleration setup, and packet management.
 * Supports both synchronous frame-by-frame encoding and async iteration over packets.
 * Essential component in media processing pipelines for converting raw frames to compressed data.
 *
 * @example
 * ```typescript
 * import { Encoder } from 'node-av/api';
 * import { AV_CODEC_ID_H264, FF_ENCODER_LIBX264 } from 'node-av/constants';
 *
 * // Create H.264 encoder
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, {
 *   type: 'video',
 *   width: 1920,
 *   height: 1080,
 *   pixelFormat: AV_PIX_FMT_YUV420P,
 *   timeBase: { num: 1, den: 30 },
 *   frameRate: { num: 30, den: 1 }
 * }, {
 *   bitrate: '5M',
 *   gopSize: 60
 * });
 *
 * // Encode frames
 * const packet = await encoder.encode(frame);
 * if (packet) {
 *   await output.writePacket(packet);
 *   packet.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Hardware-accelerated encoding with lazy initialization
 * import { HardwareContext } from 'node-av/api';
 * import { FF_ENCODER_H264_VIDEOTOOLBOX } from 'node-av/constants';
 *
 * const hw = HardwareContext.auto();
 * const encoderCodec = hw?.getEncoderCodec('h264') ?? FF_ENCODER_H264_VIDEOTOOLBOX;
 * const encoder = await Encoder.create(encoderCodec, {
 *   timeBase: video.timeBase,
 *   bitrate: '10M'
 * });
 *
 * // Hardware context will be detected from first frame's hw_frames_ctx
 * for await (const packet of encoder.packets(frames)) {
 *   await output.writePacket(packet);
 *   packet.free();
 * }
 * ```
 *
 * @see {@link Decoder} For decoding packets to frames
 * @see {@link Muxer} For writing encoded packets
 * @see {@link HardwareContext} For GPU acceleration
 */
export declare class Encoder implements Disposable {
    private codecContext;
    private packet;
    private codec;
    private initializePromise;
    private initialized;
    private isClosed;
    private opts?;
    private options;
    private audioFrameBuffer?;
    private inputQueue;
    private outputQueue;
    private workerPromise;
    private pipeToPromise;
    /**
     * @param codecContext - Configured codec context
     *
     * @param codec - Encoder codec
     *
     * @param options - Encoder options
     *
     * @param opts - Encoder options as Dictionary
     *
     * @internal
     */
    private constructor();
    /**
     * Create an encoder with specified codec and options.
     *
     * Initializes an encoder with the appropriate codec and configuration.
     * Uses lazy initialization - encoder is opened when first frame is received.
     * Hardware context will be automatically detected from first frame if not provided.
     *
     * Direct mapping to avcodec_find_encoder_by_name() or avcodec_find_encoder().
     *
     * @param encoderCodec - Codec name, ID, or instance to use for encoding
     *
     * @param options - Optional encoder configuration options including required timeBase
     *
     * @returns Configured encoder instance
     *
     * @throws {Error} If encoder not found
     *
     * @example
     * ```typescript
     * // From decoder stream info
     * const encoder = await Encoder.create(FF_ENCODER_LIBX264, {
     *   timeBase: video.timeBase,
     *   bitrate: '5M',
     *   gopSize: 60,
     *   options: {
     *     preset: 'fast',
     *     crf: '23'
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // With custom stream info
     * const encoder = await Encoder.create(FF_ENCODER_AAC, {
     *   timeBase: audio.timeBase,
     *   bitrate: '192k'
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Hardware encoder
     * const hw = HardwareContext.auto();
     * const encoderCodec = hw?.getEncoderCodec('h264') ?? FF_ENCODER_H264_VIDEOTOOLBOX;
     * const encoder = await Encoder.create(encoderCodec, {
     *   timeBase: video.timeBase,
     *   bitrate: '8M'
     * });
     * ```
     *
     * @see {@link EncoderOptions} For configuration options
     * @see {@link createSync} For synchronous version
     */
    static create(encoderCodec: FFEncoderCodec | AVCodecID | Codec, options?: EncoderOptions): Promise<Encoder>;
    /**
     * Create an encoder with specified codec and options synchronously.
     * Synchronous version of create.
     *
     * Initializes an encoder with the appropriate codec and configuration.
     * Uses lazy initialization - encoder is opened when first frame is received.
     * Hardware context will be automatically detected from first frame if not provided.
     *
     * Direct mapping to avcodec_find_encoder_by_name() or avcodec_find_encoder().
     *
     * @param encoderCodec - Codec name, ID, or instance to use for encoding
     *
     * @param options - Optional encoder configuration options including required timeBase
     *
     * @returns Configured encoder instance
     *
     * @throws {Error} If encoder not found or timeBase not provided
     *
     * @throws {FFmpegError} If codec allocation fails
     *
     * @example
     * ```typescript
     * // From decoder stream info
     * const encoder = await Encoder.create(FF_ENCODER_LIBX264, {
     *   timeBase: video.timeBase,
     *   bitrate: '5M',
     *   gopSize: 60,
     *   options: {
     *     preset: 'fast',
     *     crf: '23'
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // With custom stream info
     * const encoder = await Encoder.create(FF_ENCODER_AAC, {
     *   timeBase: audio.timeBase,
     *   bitrate: '192k'
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Hardware encoder
     * const hw = HardwareContext.auto();
     * const encoderCodec = hw?.getEncoderCodec('h264') ?? FF_ENCODER_H264_VIDEOTOOLBOX;
     * const encoder = await Encoder.create(encoderCodec, {
     *   timeBase: video.timeBase,
     *   bitrate: '8M'
     * });
     * ```
     *
     * @see {@link EncoderOptions} For configuration options
     * @see {@link create} For async version
     */
    static createSync(encoderCodec: FFEncoderCodec | AVCodecID | Codec, options?: EncoderOptions): Encoder;
    /**
     * Check if encoder is open.
     *
     * @example
     * ```typescript
     * if (encoder.isEncoderOpen) {
     *   const packet = await encoder.encode(frame);
     * }
     * ```
     */
    get isEncoderOpen(): boolean;
    /**
     * Check if encoder has been initialized.
     *
     * Returns true after first frame has been processed and encoder opened.
     * Useful for checking if encoder has received frame properties.
     *
     * @returns true if encoder has been initialized with frame data
     *
     * @example
     * ```typescript
     * if (!encoder.isEncoderInitialized) {
     *   console.log('Encoder will initialize on first frame');
     * }
     * ```
     */
    get isEncoderInitialized(): boolean;
    /**
     * Codec flags.
     *
     * @returns Current codec flags
     *
     * @throws {Error} If encoder is closed
     *
     * @example
     * ```typescript
     * const flags = encoder.codecFlags;
     * console.log('Current flags:', flags);
     * ```
     *
     * @see {@link setCodecFlags} To set flags
     * @see {@link clearCodecFlags} To clear flags
     * @see {@link hasCodecFlags} To check flags
     */
    get codecFlags(): AVCodecFlag;
    /**
     * Set codec flags.
     *
     * @param flags - One or more flag values to set
     *
     * @throws {Error} If encoder is already initialized or closed
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_GLOBAL_HEADER, AV_CODEC_FLAG_QSCALE } from 'node-av/constants';
     *
     * // Set multiple flags before initialization
     * encoder.setCodecFlags(AV_CODEC_FLAG_GLOBAL_HEADER, AV_CODEC_FLAG_QSCALE);
     * ```
     *
     * @see {@link clearCodecFlags} To clear flags
     * @see {@link hasCodecFlags} To check flags
     * @see {@link codecFlags} For direct flag access
     */
    setCodecFlags(...flags: AVCodecFlag[]): void;
    /**
     * Clear codec flags.
     *
     * @param flags - One or more flag values to clear
     *
     * @throws {Error} If encoder is already initialized or closed
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_QSCALE } from 'node-av/constants';
     *
     * // Clear specific flag before initialization
     * encoder.clearCodecFlags(AV_CODEC_FLAG_QSCALE);
     * ```
     *
     * @see {@link setCodecFlags} To set flags
     * @see {@link hasCodecFlags} To check flags
     * @see {@link codecFlags} For direct flag access
     */
    clearCodecFlags(...flags: AVCodecFlag[]): void;
    /**
     * Check if codec has specific flags.
     *
     * Tests whether all specified codec flags are set using bitwise AND.
     *
     * @param flags - One or more flag values to check
     *
     * @returns true if all specified flags are set, false otherwise
     *
     * @throws {Error} If encoder is closed
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_GLOBAL_HEADER } from 'node-av/constants';
     *
     * if (encoder.hasCodecFlags(AV_CODEC_FLAG_GLOBAL_HEADER)) {
     *   console.log('Global header flag is set');
     * }
     * ```
     *
     * @see {@link setCodecFlags} To set flags
     * @see {@link clearCodecFlags} To clear flags
     * @see {@link codecFlags} For direct flag access
     */
    hasCodecFlags(...flags: AVCodecFlag[]): boolean;
    /**
     * Check if encoder uses hardware acceleration.
     *
     * @returns true if hardware-accelerated
     *
     * @example
     * ```typescript
     * if (encoder.isHardware()) {
     *   console.log('Using GPU acceleration');
     * }
     * ```
     *
     * @see {@link HardwareContext} For hardware setup
     */
    isHardware(): boolean;
    /**
     * Check if encoder is ready for processing.
     *
     * @returns true if initialized and ready
     *
     * @example
     * ```typescript
     * if (encoder.isReady()) {
     *   const packet = await encoder.encode(frame);
     * }
     * ```
     */
    isReady(): boolean;
    /**
     * Send a frame to the encoder.
     *
     * Sends a raw frame to the encoder for encoding.
     * Does not return encoded packets - use {@link receive} to retrieve packets.
     * On first frame, automatically initializes encoder with frame properties.
     * A single frame can produce zero, one, or multiple packets depending on codec buffering.
     *
     * **Important**: This method only SENDS the frame to the encoder.
     * You must call {@link receive} separately (potentially multiple times) to get encoded packets.
     *
     * Direct mapping to avcodec_send_frame().
     *
     * @param frame - Raw frame to send to encoder
     *
     * @throws {FFmpegError} If sending frame fails
     *
     * @example
     * ```typescript
     * // Send frame and receive packets
     * await encoder.encode(frame);
     *
     * // Receive all available packets
     * while (true) {
     *   const packet = await encoder.receive();
     *   if (!packet) break;
     *   console.log(`Encoded packet with PTS: ${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * for await (const frame of decoder.frames(input.packets())) {
     *   // Send frame
     *   await encoder.encode(frame);
     *
     *   // Receive available packets
     *   let packet;
     *   while ((packet = await encoder.receive())) {
     *     await output.writePacket(packet);
     *     packet.free();
     *   }
     *   frame.free();
     * }
     * ```
     *
     * @see {@link receive} For receiving encoded packets
     * @see {@link encodeAll} For combined send+receive operation
     * @see {@link packets} For automatic frame iteration
     * @see {@link flush} For end-of-stream handling
     * @see {@link encodeSync} For synchronous version
     */
    encode(frame: Frame): Promise<void>;
    /**
     * Send a frame to the encoder synchronously.
     * Synchronous version of encode.
     *
     * Sends a raw frame to the encoder for encoding.
     * Does not return encoded packets - use {@link receiveSync} to retrieve packets.
     * On first frame, automatically initializes encoder with frame properties.
     * A single frame can produce zero, one, or multiple packets depending on codec buffering.
     *
     * **Important**: This method only SENDS the frame to the encoder.
     * You must call {@link receiveSync} separately (potentially multiple times) to get encoded packets.
     *
     * Direct mapping to avcodec_send_frame().
     *
     * @param frame - Raw frame to send to encoder
     *
     * @throws {FFmpegError} If sending frame fails
     *
     * @example
     * ```typescript
     * // Send frame and receive packets
     * encoder.encodeSync(frame);
     *
     * // Receive all available packets
     * let packet;
     * while ((packet = encoder.receiveSync())) {
     *   console.log(`Encoded packet with PTS: ${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link receiveSync} For receiving encoded packets
     * @see {@link encodeAllSync} For combined send+receive operation
     * @see {@link packetsSync} For automatic frame iteration
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link encode} For async version
     */
    encodeSync(frame: Frame): void;
    /**
     * Encode a frame to packets.
     *
     * Sends a frame to the encoder and receives all available encoded packets.
     * Returns array of packets - may be empty if encoder needs more data.
     * On first frame, automatically initializes encoder with frame properties.
     * One frame can produce zero, one, or multiple packets depending on codec.
     *
     * Direct mapping to avcodec_send_frame() and avcodec_receive_packet().
     *
     * @param frame - Raw frame to encode (or null to flush)
     *
     * @returns Array of encoded packets (empty if more data needed or encoder is closed)
     *
     * @throws {FFmpegError} If encoding fails
     *
     * @example
     * ```typescript
     * const packets = await encoder.encodeAll(frame);
     * for (const packet of packets) {
     *   console.log(`Encoded packet with PTS: ${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Encode loop
     * for await (const frame of decoder.frames(input.packets())) {
     *   const packets = await encoder.encodeAll(frame);
     *   for (const packet of packets) {
     *     await output.writePacket(packet);
     *     packet.free();
     *   }
     *   frame.free();
     * }
     * ```
     *
     * @see {@link encode} For single packet encoding
     * @see {@link packets} For automatic frame iteration
     * @see {@link flush} For end-of-stream handling
     * @see {@link encodeAllSync} For synchronous version
     */
    encodeAll(frame: Frame | null): Promise<Packet[]>;
    /**
     * Encode a frame to packets synchronously.
     * Synchronous version of encodeAll.
     *
     * Sends a frame to the encoder and receives all available encoded packets.
     * Returns array of packets - may be empty if encoder needs more data.
     * On first frame, automatically initializes encoder with frame properties.
     * One frame can produce zero, one, or multiple packets depending on codec.
     *
     * Direct mapping to avcodec_send_frame() and avcodec_receive_packet().
     *
     * @param frame - Raw frame to encode (or null to flush)
     *
     * @returns Array of encoded packets (empty if more data needed or encoder is closed)
     *
     * @throws {FFmpegError} If encoding fails
     *
     * @example
     * ```typescript
     * const packets = encoder.encodeAllSync(frame);
     * for (const packet of packets) {
     *   console.log(`Encoded packet with PTS: ${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Encode loop
     * for (const frame of decoder.framesSync(packets)) {
     *   const packets = encoder.encodeAllSync(frame);
     *   for (const packet of packets) {
     *     output.writePacketSync(packet);
     *     packet.free();
     *   }
     *   frame.free();
     * }
     * ```
     *
     * @see {@link encodeSync} For single packet encoding
     * @see {@link packetsSync} For automatic frame iteration
     * @see {@link flushSync} For end-of-stream handling
     * @see {@link encodeAll} For async version
     */
    encodeAllSync(frame: Frame | null): Packet[];
    /**
     * Encode frame stream to packet stream.
     *
     * High-level async generator for complete encoding pipeline.
     * Encoder is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based encoding.
     *
     * **EOF Handling:**
     * - Send null to flush encoder and get remaining buffered packets
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - encoder stays open until EOF or close()
     *
     * @param frames - Async iterable of frames, single frame, or null to flush
     *
     * @yields {Packet | null} Encoded packets, followed by null when explicitly flushed
     *
     * @throws {FFmpegError} If encoding fails
     *
     * @example
     * ```typescript
     * // Stream of frames with automatic EOF propagation
     * for await (const packet of encoder.packets(decoder.frames(input.packets()))) {
     *   if (packet === null) {
     *     console.log('Encoder flushed');
     *     break;
     *   }
     *   await output.writePacket(packet);
     *   packet.free(); // Must free output packets
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frame - no automatic flush
     * for await (const packet of encoder.packets(singleFrame)) {
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * // Encoder remains open, buffered packets not flushed
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for await (const packet of encoder.packets(null)) {
     *   if (packet === null) {
     *     console.log('All buffered packets flushed');
     *     break;
     *   }
     *   console.log('Buffered packet:', packet.pts);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encode} For single frame encoding
     * @see {@link Decoder.frames} For frame source
     * @see {@link packetsSync} For sync version
     */
    packets(frames: AsyncIterable<Frame | null> | Frame | null): AsyncGenerator<Packet | null>;
    /**
     * Encode frame stream to packet stream synchronously.
     * Synchronous version of packets.
     *
     * High-level sync generator for complete encoding pipeline.
     * Encoder is only flushed when EOF (null) signal is explicitly received.
     * Primary interface for stream-based encoding.
     *
     * **EOF Handling:**
     * - Send null to flush encoder and get remaining buffered packets
     * - Generator yields null after flushing when null is received
     * - No automatic flushing - encoder stays open until EOF or close()
     *
     * @param frames - Iterable of frames, single frame, or null to flush
     *
     * @yields {Packet | null} Encoded packets, followed by null when explicitly flushed
     *
     * @throws {FFmpegError} If encoding fails
     *
     * @example
     * ```typescript
     * // Stream of frames with automatic EOF propagation
     * for (const packet of encoder.packetsSync(decoder.framesSync(packets))) {
     *   if (packet === null) {
     *     console.log('Encoder flushed');
     *     break;
     *   }
     *   output.writePacketSync(packet);
     *   packet.free(); // Must free output packets
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Single frame - no automatic flush
     * for (const packet of encoder.packetsSync(singleFrame)) {
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * // Encoder remains open, buffered packets not flushed
     * ```
     *
     * @example
     * ```typescript
     * // Explicit flush with EOF
     * for (const packet of encoder.packetsSync(null)) {
     *   if (packet === null) {
     *     console.log('All buffered packets flushed');
     *     break;
     *   }
     *   console.log('Buffered packet:', packet.pts);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encodeSync} For single frame encoding
     * @see {@link Decoder.framesSync} For frame source
     * @see {@link packets} For async version
     */
    packetsSync(frames: Iterable<Frame | null> | Frame | null): Generator<Packet | null>;
    /**
     * Flush encoder and signal end-of-stream.
     *
     * Sends null frame to encoder to signal end-of-stream.
     * Does nothing if encoder was never initialized or is closed.
     * Must call receive() to get remaining buffered packets.
     *
     * Direct mapping to avcodec_send_frame(NULL).
     *
     * @example
     * ```typescript
     * // Signal end of stream
     * await encoder.flush();
     *
     * // Then get remaining packets
     * let packet;
     * while ((packet = await encoder.receive()) !== null) {
     *   console.log('Got buffered packet');
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link flushPackets} For async iteration
     * @see {@link receive} For getting buffered packets
     * @see {@link flushSync} For synchronous version
     */
    flush(): Promise<void>;
    /**
     * Flush encoder and signal end-of-stream synchronously.
     * Synchronous version of flush.
     *
     * Sends null frame to encoder to signal end-of-stream.
     * Does nothing if encoder was never initialized or is closed.
     * Must call receiveSync() to get remaining buffered packets.
     *
     * Direct mapping to avcodec_send_frame(NULL).
     *
     * @example
     * ```typescript
     * // Signal end of stream
     * encoder.flushSync();
     *
     * // Then get remaining packets
     * let packet;
     * while ((packet = encoder.receiveSync()) !== null) {
     *   console.log('Got buffered packet');
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link flushPacketsSync} For sync iteration
     * @see {@link receiveSync} For getting buffered packets
     * @see {@link flush} For async version
     */
    flushSync(): void;
    /**
     * Flush all buffered packets as async generator.
     *
     * Convenient async iteration over remaining packets.
     * Automatically handles flush and repeated receive calls.
     * Returns immediately if encoder was never initialized or is closed.
     *
     * @yields {Packet} Buffered packets
     *
     * @example
     * ```typescript
     * // Flush at end of encoding
     * for await (const packet of encoder.flushPackets()) {
     *   console.log('Processing buffered packet');
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encode} For sending frames and receiving packets
     * @see {@link flush} For signaling end-of-stream
     * @see {@link flushPacketsSync} For synchronous version
     */
    flushPackets(): AsyncGenerator<Packet>;
    /**
     * Flush all buffered packets as generator synchronously.
     * Synchronous version of flushPackets.
     *
     * Convenient sync iteration over remaining packets.
     * Automatically handles flush and repeated receive calls.
     * Returns immediately if encoder was never initialized or is closed.
     *
     * @yields {Packet} Buffered packets
     *
     * @example
     * ```typescript
     * // Flush at end of encoding
     * for (const packet of encoder.flushPacketsSync()) {
     *   console.log('Processing buffered packet');
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encodeSync} For sending frames and receiving packets
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link flushPackets} For async version
     */
    flushPacketsSync(): Generator<Packet>;
    /**
     * Receive packet from encoder.
     *
     * Gets encoded packets from the codec's internal buffer.
     * Handles packet cloning and error checking.
     * Implements FFmpeg's send/receive pattern.
     *
     * **Return Values:**
     * - `Packet` - Successfully encoded packet (AVERROR >= 0)
     * - `null` - Need more input frames (AVERROR_EAGAIN), or encoder not initialized
     * - `undefined` - End of stream reached (AVERROR_EOF), or encoder is closed
     *
     * Direct mapping to avcodec_receive_packet().
     *
     * @returns Cloned packet, null if need more data, or undefined if stream ended
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If packet cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * // Process all buffered packets
     * while (true) {
     *   const packet = await encoder.receive();
     *   if (!packet) break; // Stop on EAGAIN or EOF
     *   console.log(`Got packet with PTS: ${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Handle each return value explicitly
     * const packet = await encoder.receive();
     * if (packet === EOF) {
     *   console.log('Encoder stream ended');
     * } else if (packet === null) {
     *   console.log('Need more input frames');
     * } else {
     *   console.log(`Got packet: pts=${packet.pts}`);
     *   await output.writePacket(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encode} For sending frames and receiving packets
     * @see {@link flush} For signaling end-of-stream
     * @see {@link receiveSync} For synchronous version
     * @see {@link EOF} For end-of-stream signal
     */
    receive(): Promise<Packet | EOFSignal | null>;
    /**
     * Receive packet from encoder synchronously.
     * Synchronous version of receive.
     *
     * Gets encoded packets from the codec's internal buffer.
     * Handles packet cloning and error checking.
     * Implements FFmpeg's send/receive pattern.
     *
     * **Return Values:**
     * - `Packet` - Successfully encoded packet (AVERROR >= 0)
     * - `null` - Need more input frames (AVERROR_EAGAIN), or encoder not initialized
     * - `undefined` - End of stream reached (AVERROR_EOF), or encoder is closed
     *
     * Direct mapping to avcodec_receive_packet().
     *
     * @returns Cloned packet, null if need more data, or undefined if stream ended
     *
     * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
     *
     * @throws {Error} If packet cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * // Process all buffered packets
     * while (true) {
     *   const packet = encoder.receiveSync();
     *   if (!packet) break; // Stop on EAGAIN or EOF
     *   console.log(`Got packet with PTS: ${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Handle each return value explicitly
     * const packet = encoder.receiveSync();
     * if (packet === EOF) {
     *   console.log('Encoder stream ended');
     * } else if (packet === null) {
     *   console.log('Need more input frames');
     * } else {
     *   console.log(`Got packet: pts=${packet.pts}`);
     *   output.writePacketSync(packet);
     *   packet.free();
     * }
     * ```
     *
     * @see {@link encodeSync} For sending frames and receiving packets
     * @see {@link flushSync} For signaling end-of-stream
     * @see {@link receive} For async version
     * @see {@link EOF} For end-of-stream signal
     */
    receiveSync(): Packet | EOFSignal | null;
    /**
     * Pipe encoded packets to muxer.
     *
     * @param target - Media output component to write packets to
     *
     * @param streamIndex - Stream index to write packets to
     *
     * @returns Scheduler for continued chaining
     *
     * @example
     * ```typescript
     * decoder.pipeTo(filter).pipeTo(encoder)
     * ```
     */
    pipeTo(target: Muxer, streamIndex: number): SchedulerControl<Frame>;
    /**
     * Close encoder and free resources.
     *
     * Releases codec context and internal packet buffer.
     * Safe to call multiple times.
     * Automatically called by Symbol.dispose.
     *
     * @example
     * ```typescript
     * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
     * try {
     *   // Use encoder
     * } finally {
     *   encoder.close();
     * }
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     */
    close(): void;
    /**
     * Get encoder codec.
     *
     * Returns the codec used by this encoder.
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
     * Returns null if encoder is closed or not initialized.
     *
     * @returns Codec context or null if closed/not initialized
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
     * Send frame to input queue or flush the pipeline.
     *
     * When frame is provided, queues it for encoding.
     * When null is provided, triggers flush sequence:
     * - Closes input queue
     * - Waits for worker completion
     * - Flushes encoder and sends remaining packets to output queue
     * - Closes output queue
     * - Waits for pipeTo task completion (writes to muxer)
     *
     * Used by scheduler system for pipeline control.
     *
     * @param frame - Frame to send, or null to flush
     *
     * @internal
     */
    private sendToQueue;
    /**
     * Receive packet from output queue.
     *
     * @returns Packet from output queue
     *
     * @internal
     */
    private receiveFromQueue;
    /**
     * Initialize encoder from first frame.
     *
     * Sets codec context parameters from frame properties.
     * Configures hardware context if present in frame.
     * Opens encoder with accumulated options.
     *
     * @param frame - First frame to encode
     *
     * @throws {FFmpegError} If encoder open fails
     *
     * @internal
     */
    private initialize;
    /**
     * Initialize encoder from first frame synchronously.
     * Synchronous version of initialize.
     *
     * Sets codec context parameters from frame properties.
     * Configures hardware context if present in frame.
     * Opens encoder with accumulated options.
     *
     * @param frame - First frame to encode
     *
     * @throws {FFmpegError} If encoder open fails
     *
     * @internal
     *
     * @see {@link initialize} For async version
     */
    private initializeSync;
    /**
     * Setup hardware acceleration for encoder.
     *
     * Implements FFmpeg's hw_device_setup_for_encode logic.
     * Validates hardware frames context format and codec support.
     * Falls back to device context if frames context is incompatible.
     *
     * @param frame - Frame to get hardware context from
     *
     * @internal
     */
    private setupHardwareAcceleration;
    /**
     * Prepare frame for encoding.
     *
     * Implements FFmpeg's frame_encode() pre-encoding logic:
     * 1. Video: Sets frame.quality from encoder's globalQuality (like -qscale)
     * 2. Audio: Validates channel count consistency for encoders without PARAM_CHANGE capability
     *
     * This matches FFmpeg CLI behavior where these properties are automatically managed.
     *
     * @param frame - Frame to prepare for encoding
     *
     * @throws {Error} If audio channel count changed and encoder doesn't support parameter changes
     *
     * @internal
     */
    private prepareFrameForEncoding;
    /**
     * Dispose of encoder.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling close().
     *
     * @example
     * ```typescript
     * {
     *   using encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
     *   // Encode frames...
     * } // Automatically closed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.dispose](): void;
}
