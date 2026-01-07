import { HardwareDeviceContext } from './hardware-device-context.js';
import { HardwareFramesContext } from './hardware-frames-context.js';
import { OptionMember } from './option.js';
import { Rational } from './rational.js';
import type { AVChromaLocation, AVCodecFlag, AVCodecFlag2, AVCodecID, AVColorPrimaries, AVColorRange, AVColorSpace, AVColorTransferCharacteristic, AVMediaType, AVPixelFormat, AVProfile, AVSampleFormat } from '../constants/constants.js';
import type { CodecParameters } from './codec-parameters.js';
import type { Codec } from './codec.js';
import type { Dictionary } from './dictionary.js';
import type { Frame } from './frame.js';
import type { NativeCodecContext, NativeWrapper } from './native-types.js';
import type { Packet } from './packet.js';
import type { ChannelLayout } from './types.js';
/**
 * Codec context for encoding and decoding.
 *
 * Main structure for codec operations, containing all codec parameters and state.
 * Handles encoding raw frames to packets and decoding packets to frames.
 * Supports both software and hardware-accelerated codecs.
 * Must be configured and opened before use.
 *
 * Direct mapping to FFmpeg's AVCodecContext.
 *
 * @example
 * ```typescript
 * import { CodecContext, Codec, FFmpegError } from 'node-av';
 * import { AV_CODEC_ID_H264, AV_PIX_FMT_YUV420P } from 'node-av/constants';
 *
 * // Create decoder
 * const decoder = new CodecContext();
 * const codec = Codec.findDecoder(AV_CODEC_ID_H264);
 * decoder.allocContext3(codec);
 *
 * // Configure from stream parameters
 * decoder.parametersToContext(stream.codecpar);
 *
 * // Open decoder
 * let ret = await decoder.open2(codec);
 * FFmpegError.throwIfError(ret, 'open2');
 *
 * // Decode packets
 * ret = await decoder.sendPacket(packet);
 * if (ret >= 0) {
 *   ret = await decoder.receiveFrame(frame);
 *   if (ret >= 0) {
 *     // Process decoded frame
 *   }
 * }
 *
 * // Cleanup
 * decoder.freeContext();
 * ```
 *
 * @see [AVCodecContext](https://ffmpeg.org/doxygen/trunk/structAVCodecContext.html) - FFmpeg Doxygen
 * @see {@link Codec} For finding codecs
 * @see {@link CodecParameters} For stream parameters
 */
export declare class CodecContext extends OptionMember<NativeCodecContext> implements Disposable, NativeWrapper<NativeCodecContext> {
    private _hwDeviceCtx?;
    private _hwFramesCtx?;
    constructor();
    /**
     * Type of codec (video/audio/subtitle).
     *
     * Direct mapping to AVCodecContext->codec_type.
     */
    get codecType(): AVMediaType;
    set codecType(value: AVMediaType);
    /**
     * Codec identifier.
     *
     * Direct mapping to AVCodecContext->codec_id.
     */
    get codecId(): AVCodecID;
    set codecId(value: AVCodecID);
    /**
     * Codec tag.
     *
     * Additional codec tag used by some formats.
     *
     * Direct mapping to AVCodecContext->codec_tag.
     */
    get codecTag(): number;
    set codecTag(value: number | string);
    /**
     * Codec tag as string (FourCC).
     *
     * Human-readable string representation of the codec tag.
     * Returns the FourCC (Four Character Code) format.
     */
    get codecTagString(): string | null;
    /**
     * Average bitrate.
     *
     * Target bitrate for encoding, detected bitrate for decoding.
     * In bits per second.
     *
     * Direct mapping to AVCodecContext->bit_rate.
     */
    get bitRate(): bigint;
    set bitRate(value: bigint);
    /**
     * Time base for timestamps.
     *
     * Fundamental unit of time in seconds for this context.
     *
     * Direct mapping to AVCodecContext->time_base.
     */
    get timeBase(): Rational;
    set timeBase(value: Rational);
    /**
     * Packet time base.
     *
     * Time base of the packets from/to the demuxer/muxer.
     *
     * Direct mapping to AVCodecContext->pkt_timebase.
     */
    get pktTimebase(): Rational;
    set pktTimebase(value: Rational);
    /**
     * Codec delay.
     *
     * Number of frames the decoder needs to output before first frame.
     *
     * Direct mapping to AVCodecContext->delay.
     */
    get delay(): number;
    /**
     * Codec flags.
     *
     * Combination of AV_CODEC_FLAG_* values.
     *
     * Direct mapping to AVCodecContext->flags.
     */
    get flags(): AVCodecFlag;
    set flags(value: AVCodecFlag);
    /**
     * Additional codec flags.
     *
     * Combination of AV_CODEC_FLAG2_* values.
     *
     * Direct mapping to AVCodecContext->flags2.
     */
    get flags2(): AVCodecFlag2;
    set flags2(value: AVCodecFlag2);
    /**
     * Extra binary data for codec.
     *
     * Contains codec-specific initialization data.
     *
     * Direct mapping to AVCodecContext->extradata.
     */
    get extraData(): Buffer | null;
    set extraData(value: Buffer | null);
    /**
     * Codec profile.
     *
     * FF_PROFILE_* value indicating codec profile.
     *
     * Direct mapping to AVCodecContext->profile.
     */
    get profile(): AVProfile;
    set profile(value: AVProfile);
    /**
     * Codec level.
     *
     * Level within the specified profile.
     *
     * Direct mapping to AVCodecContext->level.
     */
    get level(): number;
    set level(value: number);
    /**
     * Thread count for codec.
     *
     * Number of threads to use for decoding/encoding.
     * 0 for automatic selection.
     *
     * Direct mapping to AVCodecContext->thread_count.
     */
    get threadCount(): number;
    set threadCount(value: number);
    /**
     * Picture width in pixels.
     *
     * Direct mapping to AVCodecContext->width.
     */
    get width(): number;
    set width(value: number);
    /**
     * Picture height in pixels.
     *
     * Direct mapping to AVCodecContext->height.
     */
    get height(): number;
    set height(value: number);
    /**
     * Group of pictures size.
     *
     * Maximum number of frames between keyframes.
     *
     * Direct mapping to AVCodecContext->gop_size.
     */
    get gopSize(): number;
    set gopSize(value: number);
    /**
     * Pixel format.
     *
     * Format of the video frames.
     *
     * Direct mapping to AVCodecContext->pix_fmt.
     */
    get pixelFormat(): AVPixelFormat;
    set pixelFormat(value: AVPixelFormat);
    /**
     * Maximum number of B-frames.
     *
     * B-frames between non-B-frames.
     *
     * Direct mapping to AVCodecContext->max_b_frames.
     */
    get maxBFrames(): number;
    set maxBFrames(value: number);
    /**
     * Macroblock decision mode.
     *
     * Algorithm for macroblock decision.
     *
     * Direct mapping to AVCodecContext->mb_decision.
     */
    get mbDecision(): number;
    set mbDecision(value: number);
    /**
     * Number of frames delay in decoder.
     *
     * For codecs with B-frames.
     *
     * Direct mapping to AVCodecContext->has_b_frames.
     */
    get hasBFrames(): number;
    /**
     * Sample aspect ratio.
     *
     * Pixel width/height ratio.
     *
     * Direct mapping to AVCodecContext->sample_aspect_ratio.
     */
    get sampleAspectRatio(): Rational;
    set sampleAspectRatio(value: Rational);
    /**
     * Frame rate.
     *
     * Frames per second for encoding.
     *
     * Direct mapping to AVCodecContext->framerate.
     */
    get framerate(): Rational;
    set framerate(value: Rational);
    /**
     * Color range.
     *
     * MPEG (limited) or JPEG (full) range.
     *
     * Direct mapping to AVCodecContext->color_range.
     */
    get colorRange(): AVColorRange;
    set colorRange(value: AVColorRange);
    /**
     * Color primaries.
     *
     * Chromaticity coordinates of source primaries.
     *
     * Direct mapping to AVCodecContext->color_primaries.
     */
    get colorPrimaries(): AVColorPrimaries;
    set colorPrimaries(value: AVColorPrimaries);
    /**
     * Color transfer characteristic.
     *
     * Transfer function (gamma).
     *
     * Direct mapping to AVCodecContext->color_trc.
     */
    get colorTrc(): AVColorTransferCharacteristic;
    set colorTrc(value: AVColorTransferCharacteristic);
    /**
     * YUV color space.
     *
     * Color space for YUV content.
     *
     * Direct mapping to AVCodecContext->colorspace.
     */
    get colorSpace(): AVColorSpace;
    set colorSpace(value: AVColorSpace);
    /**
     * Chroma sample location.
     *
     * Position of chroma samples.
     *
     * Direct mapping to AVCodecContext->chroma_sample_location.
     */
    get chromaLocation(): AVChromaLocation;
    set chromaLocation(value: AVChromaLocation);
    /**
     * Audio sample rate.
     *
     * Samples per second.
     *
     * Direct mapping to AVCodecContext->sample_rate.
     */
    get sampleRate(): number;
    set sampleRate(value: number);
    /**
     * Number of audio channels.
     *
     * Direct mapping to AVCodecContext->channels.
     */
    get channels(): number;
    set channels(value: number);
    /**
     * Audio sample format.
     *
     * Format of audio samples.
     *
     * Direct mapping to AVCodecContext->sample_fmt.
     */
    get sampleFormat(): AVSampleFormat;
    set sampleFormat(value: AVSampleFormat);
    /**
     * Number of samples per audio frame.
     *
     * Direct mapping to AVCodecContext->frame_size.
     */
    get frameSize(): number;
    set frameSize(value: number);
    /**
     * Number of bits per coded sample.
     *
     * Bits per sample/pixel from the demuxer (needed by some codecs).
     * For uncompressed formats, this is the bits per sample.
     *
     * Direct mapping to AVCodecContext->bits_per_coded_sample.
     */
    get bitsPerCodedSample(): number;
    set bitsPerCodedSample(value: number);
    /**
     * Number of bits per raw sample.
     *
     * Bits per sample before compression/encoding.
     * Only set when different from bitsPerCodedSample.
     *
     * Direct mapping to AVCodecContext->bits_per_raw_sample.
     */
    get bitsPerRawSample(): number;
    set bitsPerRawSample(value: number);
    /**
     * Current frame number.
     *
     * Frame counter for debugging.
     *
     * Direct mapping to AVCodecContext->frame_number.
     */
    get frameNumber(): number;
    /**
     * Audio channel layout.
     *
     * Describes channel configuration.
     *
     * Direct mapping to AVCodecContext->ch_layout.
     */
    get channelLayout(): ChannelLayout;
    set channelLayout(value: ChannelLayout);
    /**
     * Minimum quantizer.
     *
     * Minimum quantization parameter.
     *
     * Direct mapping to AVCodecContext->qmin.
     */
    get qMin(): number;
    set qMin(value: number);
    /**
     * Maximum quantizer.
     *
     * Maximum quantization parameter.
     *
     * Direct mapping to AVCodecContext->qmax.
     */
    get qMax(): number;
    set qMax(value: number);
    /**
     * Global quality for constant quality mode.
     *
     * Used by encoders that support constant quality mode (e.g., -qscale in FFmpeg CLI).
     * Set this value to enable constant quality encoding instead of constant bitrate.
     * Valid range depends on the codec (e.g., 0-69 for MPEG-4, FF_LAMBDA_SCALE for others).
     *
     * Direct mapping to AVCodecContext->global_quality.
     *
     * @example
     * ```typescript
     * // MPEG-4 constant quality (lower = better quality)
     * codecContext.globalQuality = 5 * FF_QP2LAMBDA;
     * ```
     */
    get globalQuality(): number;
    set globalQuality(value: number);
    /**
     * Rate control buffer size.
     *
     * Decoder bitstream buffer size.
     *
     * Direct mapping to AVCodecContext->rc_buffer_size.
     */
    get rcBufferSize(): number;
    set rcBufferSize(value: number);
    /**
     * Maximum bitrate.
     *
     * Maximum bitrate in bits per second.
     *
     * Direct mapping to AVCodecContext->rc_max_rate.
     */
    get rcMaxRate(): bigint;
    set rcMaxRate(value: bigint);
    /**
     * Minimum bitrate.
     *
     * Minimum bitrate in bits per second.
     *
     * Direct mapping to AVCodecContext->rc_min_rate.
     */
    get rcMinRate(): bigint;
    set rcMinRate(value: bigint);
    /**
     * Hardware device context.
     *
     * Reference to hardware device for acceleration.
     *
     * Direct mapping to AVCodecContext->hw_device_ctx.
     */
    get hwDeviceCtx(): HardwareDeviceContext | null;
    set hwDeviceCtx(value: HardwareDeviceContext | null);
    /**
     * Number of extra hardware frames to allocate.
     *
     * Specifies additional hardware frame buffers for decoders that need them.
     * Useful for hardware decoders requiring frame buffering or reordering.
     *
     * Direct mapping to AVCodecContext->extra_hw_frames.
     */
    get extraHWFrames(): number;
    set extraHWFrames(value: number);
    /**
     * Hardware frames context.
     *
     * Reference to hardware frames for GPU memory.
     *
     * Direct mapping to AVCodecContext->hw_frames_ctx.
     */
    get hwFramesCtx(): HardwareFramesContext | null;
    set hwFramesCtx(value: HardwareFramesContext | null);
    /**
     * Check if codec is open.
     *
     * True if the codec has been opened.
     */
    get isOpen(): boolean;
    /**
     * Allocate codec context.
     *
     * Allocates and initializes the context for the given codec.
     *
     * Direct mapping to avcodec_alloc_context3().
     *
     * @param codec - Codec to use (null for default)
     *
     * @example
     * ```typescript
     * import { Codec } from 'node-av';
     * import { AV_CODEC_ID_H264 } from 'node-av/constants';
     *
     * const codec = Codec.findDecoder(AV_CODEC_ID_H264);
     * ctx.allocContext3(codec);
     * ```
     *
     * @see {@link open2} To open the codec
     * @see {@link freeContext} To free the context
     */
    allocContext3(codec?: Codec | null): void;
    /**
     * Free the codec context.
     *
     * Releases all resources. The context becomes invalid.
     *
     * Direct mapping to avcodec_free_context().
     *
     * @example
     * ```typescript
     * ctx.freeContext();
     * // Context is now invalid
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     * @see {@link allocContext3} To allocate a new context
     */
    freeContext(): void;
    /**
     * Open the codec.
     *
     * Initializes the codec for encoding/decoding.
     * Must be called before processing frames/packets.
     *
     * Direct mapping to avcodec_open2().
     *
     * @param codec - Codec to open with (null to use already set)
     *
     * @param options - Codec-specific options
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const ret = await ctx.open2(codec);
     * FFmpegError.throwIfError(ret, 'open2');
     * // Codec is now open and ready
     * ```
     *
     * @see {@link allocContext3} Must be called first
     * @see {@link isOpen} To check if open
     */
    open2(codec?: Codec | null, options?: Dictionary | null): Promise<number>;
    /**
     * Open the codec synchronously.
     * Synchronous version of open2.
     *
     * Initializes the codec for encoding/decoding.
     * Must be called before processing frames/packets.
     *
     * Direct mapping to avcodec_open2().
     *
     * @param codec - Codec to open with (null to use already set)
     *
     * @param options - Codec-specific options
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid parameters
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const ret = ctx.open2Sync(codec);
     * FFmpegError.throwIfError(ret, 'open2Sync');
     * // Codec is now open and ready
     * ```
     *
     * @see {@link open2} For async version
     */
    open2Sync(codec?: Codec | null, options?: Dictionary | null): number;
    /**
     * Fill codec context from parameters.
     *
     * Copies codec parameters from stream to context.
     * Used when setting up decoders.
     *
     * Direct mapping to avcodec_parameters_to_context().
     *
     * @param params - Source codec parameters
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid parameters
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const ret = ctx.parametersToContext(stream.codecpar);
     * FFmpegError.throwIfError(ret, 'parametersToContext');
     * ```
     *
     * @see {@link parametersFromContext} For the reverse
     */
    parametersToContext(params: CodecParameters): number;
    /**
     * Fill parameters from codec context.
     *
     * Copies codec parameters from context to stream.
     * Used when setting up encoders.
     *
     * Direct mapping to avcodec_parameters_from_context().
     *
     * @param params - Destination codec parameters
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EINVAL: Invalid parameters
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     *
     * const ret = ctx.parametersFromContext(stream.codecpar);
     * FFmpegError.throwIfError(ret, 'parametersFromContext');
     * ```
     *
     * @see {@link parametersToContext} For the reverse
     */
    parametersFromContext(params: CodecParameters): number;
    /**
     * Flush codec buffers.
     *
     * Resets the internal codec state.
     * Used when seeking or switching streams.
     *
     * Direct mapping to avcodec_flush_buffers().
     *
     * @example
     * ```typescript
     * // Flush when seeking
     * ctx.flushBuffers();
     * // Codec is now ready for new data
     * ```
     */
    flushBuffers(): void;
    /**
     * Send packet to decoder.
     *
     * Submits encoded data for decoding.
     * Call receiveFrame() to get decoded frames.
     *
     * Direct mapping to avcodec_send_packet().
     *
     * @param packet - Packet to decode (null to flush)
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Must receive frames first
     *   - AVERROR_EOF: Decoder has been flushed
     *   - AVERROR_EINVAL: Invalid decoder state
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av';
     *
     * const ret = await ctx.sendPacket(packet);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive frames first
     * } else {
     *   FFmpegError.throwIfError(ret, 'sendPacket');
     * }
     * ```
     *
     * @see {@link receiveFrame} To get decoded frames
     */
    sendPacket(packet: Packet | null): Promise<number>;
    /**
     * Send packet to decoder synchronously.
     * Synchronous version of sendPacket.
     *
     * Submits compressed data for decoding.
     * Call receiveFrameSync() to get decoded frames.
     *
     * Direct mapping to avcodec_send_packet().
     *
     * @param packet - Packet to decode (null to flush)
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Must receive frames first
     *   - AVERROR_EOF: Decoder has been flushed
     *   - AVERROR_EINVAL: Invalid decoder state
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av';
     *
     * const ret = ctx.sendPacketSync(packet);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive frames first
     *   ctx.receiveFrameSync(frame);
     * }
     * ```
     *
     * @see {@link sendPacket} For async version
     */
    sendPacketSync(packet: Packet | null): number;
    /**
     * Receive decoded frame.
     *
     * Gets a decoded frame from the decoder.
     * Call after sendPacket().
     *
     * Direct mapping to avcodec_receive_frame().
     *
     * @param frame - Frame to receive into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: All frames have been output
     *   - AVERROR_EINVAL: Invalid decoder state
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av';
     *
     * const ret = await ctx.receiveFrame(frame);
     * if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
     *   // No frame available
     * } else {
     *   FFmpegError.throwIfError(ret, 'receiveFrame');
     *   // Process decoded frame
     * }
     * ```
     *
     * @see {@link sendPacket} To send packets for decoding
     */
    receiveFrame(frame: Frame): Promise<number>;
    /**
     * Receive decoded frame synchronously.
     * Synchronous version of receiveFrame.
     *
     * Gets a decoded frame from the decoder.
     * Call after sendPacketSync().
     *
     * Direct mapping to avcodec_receive_frame().
     *
     * @param frame - Frame to receive into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: All frames have been output
     *   - AVERROR_EINVAL: Invalid decoder state
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av';
     *
     * const ret = ctx.receiveFrameSync(frame);
     * if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
     *   // No frame available
     * } else {
     *   FFmpegError.throwIfError(ret, 'receiveFrameSync');
     *   // Process frame
     * }
     * ```
     *
     * @see {@link receiveFrame} For async version
     */
    receiveFrameSync(frame: Frame): number;
    /**
     * Send frame to encoder.
     *
     * Submits raw frame for encoding.
     * Call receivePacket() to get encoded packets.
     *
     * Direct mapping to avcodec_send_frame().
     *
     * @param frame - Frame to encode (null to flush)
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Must receive packets first
     *   - AVERROR_EOF: Encoder has been flushed
     *   - AVERROR_EINVAL: Invalid encoder state
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av';
     *
     * const ret = await ctx.sendFrame(frame);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive packets first
     * } else {
     *   FFmpegError.throwIfError(ret, 'sendFrame');
     * }
     * ```
     *
     * @see {@link receivePacket} To get encoded packets
     */
    sendFrame(frame: Frame | null): Promise<number>;
    /**
     * Send frame to encoder synchronously.
     * Synchronous version of sendFrame.
     *
     * Submits raw frame for encoding.
     * Call receivePacketSync() to get encoded packets.
     *
     * Direct mapping to avcodec_send_frame().
     *
     * @param frame - Frame to encode (null to flush)
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Must receive packets first
     *   - AVERROR_EOF: Encoder has been flushed
     *   - AVERROR_EINVAL: Invalid encoder state
     *   - AVERROR_ENOMEM: Memory allocation failure
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN } from 'node-av';
     *
     * const ret = ctx.sendFrameSync(frame);
     * if (ret === AVERROR_EAGAIN) {
     *   // Need to receive packets first
     *   ctx.receivePacketSync(packet);
     * }
     * ```
     *
     * @see {@link sendFrame} For async version
     */
    sendFrameSync(frame: Frame | null): number;
    /**
     * Receive encoded packet.
     *
     * Gets an encoded packet from the encoder.
     * Call after sendFrame().
     *
     * Direct mapping to avcodec_receive_packet().
     *
     * @param packet - Packet to receive into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: All packets have been output
     *   - AVERROR_EINVAL: Invalid encoder state
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av';
     *
     * const ret = await ctx.receivePacket(packet);
     * if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
     *   // No packet available
     * } else {
     *   FFmpegError.throwIfError(ret, 'receivePacket');
     *   // Process encoded packet
     * }
     * ```
     *
     * @see {@link sendFrame} To send frames for encoding
     */
    receivePacket(packet: Packet): Promise<number>;
    /**
     * Receive encoded packet synchronously.
     * Synchronous version of receivePacket.
     *
     * Gets an encoded packet from the encoder.
     * Call after sendFrameSync().
     *
     * Direct mapping to avcodec_receive_packet().
     *
     * @param packet - Packet to receive into
     *
     * @returns 0 on success, negative AVERROR on error:
     *   - AVERROR_EAGAIN: Need more input
     *   - AVERROR_EOF: All packets have been output
     *   - AVERROR_EINVAL: Invalid encoder state
     *
     * @example
     * ```typescript
     * import { FFmpegError } from 'node-av';
     * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av';
     *
     * const ret = ctx.receivePacketSync(packet);
     * if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
     *   // No packet available
     * } else {
     *   FFmpegError.throwIfError(ret, 'receivePacketSync');
     *   // Process packet
     * }
     * ```
     *
     * @see {@link receivePacket} For async version
     */
    receivePacketSync(packet: Packet): number;
    /**
     * Set hardware pixel format.
     *
     * Configures hardware acceleration pixel formats.
     * Used in get_format callback for hardware decoding.
     *
     * @param hwFormat - Hardware pixel format
     *
     * @param swFormat - Software pixel format (optional)
     *
     * @example
     * ```typescript
     * import { AV_PIX_FMT_CUDA, AV_PIX_FMT_NV12 } from 'node-av/constants';
     *
     * ctx.setHardwarePixelFormat(AV_PIX_FMT_CUDA, AV_PIX_FMT_NV12);
     * ```
     */
    setHardwarePixelFormat(hwFormat: AVPixelFormat, swFormat?: AVPixelFormat): void;
    /**
     * Set codec flags.
     *
     * Sets one or more flags using bitwise OR. Allows setting multiple flags
     * without manually performing bitwise operations.
     *
     * @param flags - One or more flag values to set
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_QSCALE, AV_CODEC_FLAG_PSNR } from 'node-av/constants';
     *
     * // Set multiple flags at once
     * codecContext.setFlags(AV_CODEC_FLAG_QSCALE, AV_CODEC_FLAG_PSNR);
     * ```
     *
     * @see {@link clearFlags} To unset flags
     * @see {@link hasFlags} To check flags
     * @see {@link flags} For direct flag access
     */
    setFlags(...flags: AVCodecFlag[]): void;
    /**
     * Clear codec flags.
     *
     * Clears one or more flags using bitwise AND NOT. Allows clearing multiple
     * flags without manually performing bitwise operations.
     *
     * @param flags - One or more flag values to clear
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_PSNR } from 'node-av/constants';
     *
     * // Clear specific flag
     * codecContext.clearFlags(AV_CODEC_FLAG_PSNR);
     * ```
     *
     * @see {@link setFlags} To set flags
     * @see {@link hasFlags} To check flags
     * @see {@link flags} For direct flag access
     */
    clearFlags(...flags: AVCodecFlag[]): void;
    /**
     * Check if codec has specific flags.
     *
     * Tests whether all specified flags are set using bitwise AND.
     *
     * @param flags - One or more flag values to check
     *
     * @returns true if all specified flags are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG_QSCALE } from 'node-av/constants';
     *
     * if (codecContext.hasFlags(AV_CODEC_FLAG_QSCALE)) {
     *   console.log('QSCALE flag is set');
     * }
     * ```
     *
     * @see {@link setFlags} To set flags
     * @see {@link clearFlags} To unset flags
     * @see {@link flags} For direct flag access
     */
    hasFlags(...flags: AVCodecFlag[]): boolean;
    /**
     * Set codec flags2.
     *
     * Sets one or more flags2 values using bitwise OR. Allows setting multiple flags
     * without manually performing bitwise operations.
     *
     * @param flags - One or more flag2 values to set
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG2_FAST } from 'node-av/constants';
     *
     * // Set multiple flags2 at once
     * codecContext.setFlags2(AV_CODEC_FLAG2_FAST);
     * ```
     *
     * @see {@link clearFlags2} To unset flags2
     * @see {@link hasFlags2} To check flags2
     * @see {@link flags2} For direct flag2 access
     */
    setFlags2(...flags: AVCodecFlag2[]): void;
    /**
     * Clear codec flags2.
     *
     * Clears one or more flags2 values using bitwise AND NOT. Allows clearing multiple
     * flags without manually performing bitwise operations.
     *
     * @param flags - One or more flag2 values to clear
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG2_FAST } from 'node-av/constants';
     *
     * // Clear specific flag2
     * codecContext.clearFlags2(AV_CODEC_FLAG2_FAST);
     * ```
     *
     * @see {@link setFlags2} To set flags2
     * @see {@link hasFlags2} To check flags2
     * @see {@link flags2} For direct flag2 access
     */
    clearFlags2(...flags: AVCodecFlag2[]): void;
    /**
     * Check if codec has specific flags2.
     *
     * Tests whether all specified flags2 are set using bitwise AND.
     *
     * @param flags - One or more flag2 values to check
     *
     * @returns true if all specified flags2 are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AV_CODEC_FLAG2_FAST } from 'node-av/constants';
     *
     * if (codecContext.hasFlags2(AV_CODEC_FLAG2_FAST)) {
     *   console.log('FAST flag2 is set');
     * }
     * ```
     *
     * @see {@link setFlags2} To set flags2
     * @see {@link clearFlags2} To unset flags2
     * @see {@link flags2} For direct flag2 access
     */
    hasFlags2(...flags: AVCodecFlag2[]): boolean;
    /**
     * Get the underlying native CodecContext object.
     *
     * @returns The native CodecContext binding object
     *
     * @internal
     */
    getNative(): NativeCodecContext;
    /**
     * Dispose of the codec context.
     *
     * Implements the Disposable interface for automatic cleanup.
     * Equivalent to calling freeContext().
     *
     * @example
     * ```typescript
     * {
     *   using ctx = new CodecContext();
     *   ctx.allocContext3(codec);
     *   await ctx.open2();
     *   // Use context...
     * } // Automatically freed when leaving scope
     * ```
     */
    [Symbol.dispose](): void;
}
