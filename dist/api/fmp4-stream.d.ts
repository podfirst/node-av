import { Demuxer } from './demuxer.js';
import type { AVHWDeviceType, FFHWDeviceType } from '../constants/index.js';
import type { DemuxerOptions, EncoderOptions } from './types.js';
export type MP4BoxType = 'ftyp' | 'styp' | 'moov' | 'moof' | 'mdat' | 'free' | 'skip' | 'sidx' | 'emsg' | 'mvhd' | 'trak' | 'mvex' | 'trex' | 'mehd' | 'mfhd' | 'traf' | 'tfhd' | 'tfdt' | 'trun' | 'sdtp' | 'tkhd' | 'mdia' | 'minf' | 'stbl' | 'meta' | 'udta' | (string & {});
/**
 * MP4 box information.
 */
export interface MP4Box {
    /** Four-character code identifying the box type (e.g., 'ftyp', 'moov', 'moof') */
    type: MP4BoxType;
    /** Total size of the box in bytes (including 8-byte header) */
    size: number;
    /** Box payload data (excluding the 8-byte header) */
    data: Buffer;
    /** Offset of this box in the original buffer */
    offset: number;
}
/**
 * fMP4 data information provided in onData callback.
 */
export interface FMP4Data {
    /**
     * True if data contains complete MP4 boxes, false if raw chunks.
     * When boxMode is enabled, this is always true.
     */
    isComplete: boolean;
    /**
     * Parsed MP4 boxes (only available when isComplete is true).
     * Array is empty when isComplete is false.
     */
    boxes: MP4Box[];
}
/**
 * Options for configuring fMP4 streaming.
 */
export interface FMP4StreamOptions {
    /**
     * Callback invoked for fMP4 data (chunks or complete boxes).
     *
     * @param data - fMP4 data information with buffer and box details
     */
    onData?: (data: Buffer, info: FMP4Data) => void;
    /**
     * Callback invoked when the stream is closed or encounters an error.
     *
     * @param error - Optional error if stream closed due to an error
     */
    onClose?: (error?: Error) => void;
    /**
     * Supported codec strings from client.
     * Comma-separated list (e.g., "avc1.640029,hvc1.1.6.L153.B0,mp4a.40.2,flac,opus").
     *
     * @example "avc1.640029,mp4a.40.2"
     */
    supportedCodecs?: string;
    /**
     * Fragment duration in microseconds.
     * Smaller values reduce latency but increase overhead.
     * Set to 1 to send data as soon as possible.
     *
     * @default 1
     */
    fragDuration?: number;
    /**
     * Hardware acceleration configuration for video transcoding.
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
        fps?: number;
        width?: number;
        height?: number;
        encoderOptions?: EncoderOptions['options'];
    };
    /**
     * Audio stream configuration.
     */
    audio?: {
        encoderOptions?: EncoderOptions['options'];
    };
    /**
     * Buffer size for I/O operations in bytes (output).
     *
     * @default 2 MB
     */
    bufferSize?: number;
    /**
     * Enable box mode - buffers data until complete MP4 boxes are available.
     * When true, onData receives complete boxes with parsed box information.
     * When false, onData receives raw chunks as they arrive from FFmpeg.
     *
     * @default false
     */
    boxMode?: boolean;
    /**
     * MOV flags for fragmented MP4 output.
     *
     * @default '+frag_keyframe+separate_moof+default_base_moof+empty_moov'
     */
    movFlags?: string;
}
/**
 * Target codec strings for fMP4 streaming.
 */
export declare const FMP4_CODECS: {
    readonly H264: "avc1.640029";
    readonly H265: "hvc1.1.6.L153.B0";
    readonly AV1: "av01.0.00M.08";
    readonly AAC: "mp4a.40.2";
    readonly FLAC: "flac";
    readonly OPUS: "opus";
};
/**
 * High-level fMP4 streaming with automatic codec detection and transcoding.
 *
 * Provides fragmented MP4 streaming for clients.
 * Automatically transcodes video to H.264 and audio to AAC if not supported by client.
 * Client sends supported codecs, server transcodes accordingly.
 * Essential component for building adaptive streaming servers.
 *
 * @example
 * ```typescript
 * import { FMP4Stream } from 'node-av/api';
 *
 * // Client sends supported codecs
 * const supportedCodecs = 'avc1.640029,hvc1.1.6.L153.B0,mp4a.40.2,flac';
 *
 * // Create stream with codec negotiation
 * const stream = FMP4Stream.create('rtsp://camera.local/stream', {
 *   supportedCodecs,
 *   onData: (data) => ws.send(data.data)
 * });
 *
 * // Start streaming (auto-transcodes if needed)
 * await stream.start();
 *
 * // Stop when done
 * await stream.stop();
 * ```
 *
 * @example
 * ```typescript
 * // Stream with hardware acceleration
 * const stream = FMP4Stream.create('input.mp4', {
 *   supportedCodecs: 'avc1.640029,mp4a.40.2',
 *   hardware: 'auto',
 *   fragDuration: 1,
 *   onData: (data) => sendToClient(data.data)
 * });
 *
 * await stream.start();
 * await stream.stop();
 * ```
 */
export declare class FMP4Stream {
    private options;
    private inputUrl;
    private inputOptions;
    private input?;
    private output?;
    private hardwareContext?;
    private videoDecoder?;
    private videoFilter?;
    private videoEncoder?;
    private audioDecoder?;
    private audioFilter?;
    private audioEncoder?;
    private pipeline?;
    private supportedCodecs;
    private incompleteBoxBuffer;
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
     * Create a fMP4 stream from a media source.
     *
     * Configures the stream with input URL and options. The input is not opened
     * until start() is called, allowing the stream to be reused after stop().
     *
     * @param inputUrl - Media source URL (RTSP, file path, HTTP, etc.)
     *
     * @param options - Stream configuration options with supported codecs
     *
     * @returns Configured fMP4 stream instance
     *
     * @example
     * ```typescript
     * // Stream from file with codec negotiation
     * const stream = FMP4Stream.create('video.mp4', {
     *   supportedCodecs: 'avc1.640029,mp4a.40.2',
     *   onData: (data) => ws.send(data.data)
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Stream from RTSP with auto hardware acceleration
     * const stream = FMP4Stream.create('rtsp://camera.local/stream', {
     *   supportedCodecs: 'avc1.640029,hvc1.1.6.L153.B0,mp4a.40.2',
     *   hardware: 'auto',
     *   fragDuration: 0.5
     * });
     * ```
     */
    static create(inputUrl: string, options?: FMP4StreamOptions): FMP4Stream;
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
     * const stream = FMP4Stream.create('input.mp4', {
     * const input = stream.getInput();
     * console.log('Bitrate:', input?.bitRate);
     * ```
     */
    getInput(): Demuxer | undefined;
    /**
     * Get the codec string that will be used by client.
     *
     * Returns the MIME type codec string based on input codecs and transcoding decisions.
     * Call this after start() is called to know what codec string to use for addSourceBuffer().
     *
     * @returns MIME type codec string (e.g., "avc1.640029,mp4a.40.2")
     *
     * @throws {Error} If called before start() is called
     *
     * @example
     * ```typescript
     * const stream = await FMP4Stream.create('input.mp4', {
     *   supportedCodecs: 'avc1.640029,mp4a.40.2'
     * });
     *
     * await stream.start(); // Must start first
     * const codecString = stream.getCodecString();
     * console.log(codecString); // "avc1.640029,mp4a.40.2"
     * // Use this for: sourceBuffer = mediaSource.addSourceBuffer(`video/mp4; codecs="${codecString}"`);
     * ```
     */
    getCodecString(): string;
    /**
     * Start streaming media to fMP4 chunks.
     *
     * Begins the media processing pipeline, reading packets from input,
     * transcoding based on supported codecs, and generating fMP4 chunks.
     * Video transcodes to H.264 if H.264/H.265 not supported.
     * Audio transcodes to AAC if AAC/FLAC/Opus not supported.
     * This method returns immediately after starting the pipeline.
     *
     * @returns Promise that resolves when pipeline is started
     *
     * @throws {FFmpegError} If setup fails
     *
     * @example
     * ```typescript
     * const stream = await FMP4Stream.create('input.mp4', {
     *   supportedCodecs: 'avc1.640029,mp4a.40.2',
     *   onData: (data) => sendToClient(data.data)
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
     * Stop streaming gracefully and clean up all resources.
     *
     * Stops the pipeline, closes output, and releases all FFmpeg resources.
     * Safe to call multiple times. After stopping, you can call start() again
     * to restart the stream.
     *
     * @example
     * ```typescript
     * const stream = await FMP4Stream.create('input.mp4', {
     *   supportedCodecs: 'avc1.640029,mp4a.40.2'
     * });
     * await stream.start();
     *
     * // Stop after 10 seconds
     * setTimeout(async () => await stream.stop(), 10000);
     * ```
     */
    stop(): Promise<void>;
    /**
     * Run the streaming pipeline until completion or stopped.
     *
     * @internal
     */
    private runPipeline;
    /**
     * Check if video codec is supported.
     *
     * @param codecId - Codec ID
     *
     * @returns True if H.264, H.265, or AV1 is in supported codecs
     *
     * @internal
     */
    private isVideoCodecSupported;
    /**
     * Check if audio codec is supported.
     *
     * @param codecId - Codec ID
     *
     * @returns True if AAC, FLAC, or Opus is in supported codecs
     *
     * @internal
     */
    private isAudioCodecSupported;
    /**
     * Process buffer in box mode - buffers until complete boxes are available.
     *
     * @param chunk - Incoming data chunk from FFmpeg
     *
     * @internal
     */
    private processBoxMode;
}
