import { RtpPacket } from 'werift';
import { Demuxer } from './demuxer.js';
import type { AVCodecID, AVHWDeviceType, AVSampleFormat, FFAudioEncoder, FFHWDeviceType, FFVideoEncoder } from '../constants/index.js';
import type { DemuxerOptions, EncoderOptions } from './types.js';
/**
 * Options for configuring RTP streaming.
 */
export interface RTPStreamOptions {
    /**
     * Callback invoked for each video RTP packet.
     * Use this to send packets to your RTP implementation.
     *
     * @param packet - Serialized RTP packet ready for transmission
     */
    onVideoPacket?: (packet: RtpPacket) => void;
    /**
     * Callback invoked for each audio RTP packet.
     * Use this to send packets to your RTP implementation.
     *
     * @param packet - Serialized RTP packet ready for transmission
     */
    onAudioPacket?: (packet: RtpPacket) => void;
    /**
     * Callback invoked when the stream is closed or encounters an error.
     *
     * @param error - Optional error if stream closed due to an error
     */
    onClose?: (error?: Error) => void;
    /**
     * Supported video codec IDs for transcoding decisions.
     * If not provided or empty, all video codecs are supported (passthrough only, no transcoding).
     * If provided, only the specified codecs are supported and transcoding will be performed if needed.
     */
    supportedVideoCodecs?: (AVCodecID | FFVideoEncoder)[];
    /**
     * Supported audio codec IDs for transcoding decisions.
     * If not provided or empty, all audio codecs are supported (passthrough only, no transcoding).
     * If provided, only the specified codecs are supported and transcoding will be performed if needed.
     */
    supportedAudioCodecs?: (AVCodecID | FFAudioEncoder)[];
    /**
     * Hardware acceleration configuration.
     *
     * - `'auto'` - Automatically detect and use available hardware acceleration
     * - Object with deviceType - Manually specify hardware acceleration type
     *
     * @default { deviceType: AV_HWDEVICE_TYPE_NONE }
     */
    hardware?: 'auto' | {
        deviceType: AVHWDeviceType | FFHWDeviceType;
        device?: string;
        options?: Record<string, string>;
    };
    /**
     * Input media options passed to Demuxer.
     */
    inputOptions?: DemuxerOptions;
    /**
     * Video stream configuration.
     */
    video?: {
        ssrc?: number;
        payloadType?: number;
        mtu?: number;
        fps?: number;
        width?: number;
        height?: number;
        encoderOptions?: EncoderOptions['options'];
    };
    /**
     * Audio stream configuration.
     */
    audio?: {
        ssrc?: number;
        payloadType?: number;
        mtu?: number;
        sampleFormat?: AVSampleFormat;
        sampleRate?: number;
        channels?: number;
        encoderOptions?: EncoderOptions['options'];
    };
}
/**
 * Generic RTP streaming with automatic codec detection and transcoding.
 *
 * Provides library-agnostic RTP streaming for various applications.
 * Automatically detects input codecs and transcodes non-compatible formats.
 * Supports hardware acceleration for video transcoding.
 * Essential component for building RTP streaming servers.
 *
 * @example
 * ```typescript
 * import { RTPStream } from 'node-av/api';
 *
 * // Create stream with RTP packet callbacks
 * const stream = RTPStream.create('rtsp://camera.local/stream', {
 *   mtu: 1200,
 *   hardware: 'auto',
 *   onVideoPacket: (rtp) => {
 *     // Send RTP packet
 *     sendRtpPacket(rtp);
 *   },
 *   onAudioPacket: (rtp) => {
 *     sendRtpPacket(rtp);
 *   }
 * });
 *
 * // Start streaming
 * await stream.start();
 * ```
 *
 * @see {@link Demuxer} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export declare class RTPStream {
    private options;
    private inputUrl;
    private inputOptions;
    private input?;
    private videoOutput?;
    private audioOutput?;
    private hardwareContext?;
    private videoDecoder?;
    private videoFilter?;
    private videoEncoder?;
    private audioDecoder?;
    private audioFilter?;
    private audioEncoder?;
    private pipeline?;
    private supportedVideoCodecs;
    private supportedAudioCodecs;
    /**
     * @param inputUrl - Media input URL
     *
     * @param options - Stream configuration options
     *
     * Use {@link create} factory method
     *
     * @internal
     */
    private constructor();
    /**
     * Create an RTP stream from a media source.
     *
     * Configures the stream with input URL and options. The input is not opened
     * until start() is called, allowing the stream to be reused after stop().
     *
     * @param inputUrl - Media source URL (RTSP, file path, HTTP, etc.)
     *
     * @param options - Stream configuration options
     *
     * @returns Configured RTP stream instance
     *
     * @example
     * ```typescript
     * // Stream from RTSP camera
     * const stream = RTPStream.create('rtsp://camera.local/stream', {
     *   mtu: 1200,
     *   onVideoPacket: (rtp) => sendPacket(rtp),
     *   onAudioPacket: (rtp) => sendPacket(rtp)
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Stream file with auto hardware acceleration
     * const stream = RTPStream.create('video.mp4', {
     *   hardware: 'auto'
     * });
     * ```
     */
    static create(inputUrl: string, options?: RTPStreamOptions): RTPStream;
    /**
     * Check if the stream is active.
     *
     * @returns True if the stream is active, false otherwise
     */
    get isStreamActive(): boolean;
    /**
     * Get the demuxer instance.
     *
     * Used for accessing the underlying demuxer.
     * Only available after start() is called.
     *
     * @returns Demuxer instance or undefined if not started
     *
     * @example
     * ```typescript
     * const stream = RTPStream.create('input.mp4', {
     *   onVideoPacket: (rtp) => sendRtp(rtp)
     * });
     * await stream.start();
     * const input = stream.getInput();
     * console.log('Bitrate:', input?.bitRate);
     * ```
     */
    getInput(): Demuxer | undefined;
    /**
     * Start streaming media to RTP packets.
     *
     * Begins the media processing pipeline, reading packets from input,
     * transcoding if necessary, and invoking RTP packet callbacks.
     * Automatically handles video and audio streams in parallel.
     * This method returns immediately after starting the pipeline.
     *
     * @returns Promise that resolves when pipeline is started
     *
     * @throws {Error} If no video stream found in input
     *
     * @throws {FFmpegError} If setup fails
     *
     * @example
     * ```typescript
     * const stream = RTPStream.create('rtsp://camera.local/stream', {
     *   onVideoPacket: (rtp) => sendRtp(rtp)
     * });
     *
     * // Start streaming (returns immediately)
     * await stream.start();
     *
     * // Later: stop streaming
     * await stream.stop();
     * ```
     */
    start(): Promise<void>;
    /**
     * Run the streaming pipeline until completion or stopped.
     *
     * @internal
     */
    private runPipeline;
    /**
     * Stop streaming gracefully and clean up all resources.
     *
     * Stops the pipeline, closes output, and releases all FFmpeg resources.
     * Safe to call multiple times. After stopping, you can call start() again
     * to restart the stream.
     *
     * @example
     * ```typescript
     * const stream = RTPStream.create('input.mp4', {
     *   onVideoPacket: (rtp) => sendRtp(rtp)
     * });
     * await stream.start();
     *
     * // Stop after 10 seconds
     * setTimeout(async () => await stream.stop(), 10000);
     * ```
     */
    stop(): Promise<void>;
    /**
     * Check if the given audio codec is supported.
     *
     * @param codecId - The AVCodecID to check
     *
     * @returns True if the codec is supported, false otherwise
     *
     * @internal
     */
    private isAudioCodecSupported;
    /**
     * Check if the given video codec is supported.
     *
     * @param codecId - The AVCodecID to check
     *
     * @returns True if the codec is supported, false otherwise
     *
     * @internal
     */
    private isVideoCodecSupported;
    /**
     * Select the best supported sample format from codec.
     *
     * Returns the first supported format, or null if none available.
     * This follows FFmpeg's approach of using the first supported format.
     *
     * @param codec - Audio encoder codec
     *
     * @param desiredFormat - Desired sample format
     *
     * @returns First supported sample format or null
     *
     * @internal
     */
    private selectSampleFormat;
    /**
     * Select the best supported sample rate from codec.
     *
     * Returns the closest supported rate to the desired rate.
     * If no rates are specified by the codec, returns the desired rate.
     *
     * @param codec - Audio encoder codec
     *
     * @param desiredRate - Desired sample rate
     *
     * @returns Best matching sample rate
     *
     * @internal
     */
    private selectSampleRate;
    /**
     * Select the best supported channel layout from codec.
     *
     * Returns a layout matching the desired channel count, or the first supported layout.
     *
     * @param codec - Audio encoder codec
     *
     * @param desiredChannels - Desired number of channels
     *
     * @returns Best matching channel layout string
     *
     * @internal
     */
    private selectChannelLayout;
}
