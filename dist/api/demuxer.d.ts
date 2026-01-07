import { FormatContext } from '../lib/format-context.js';
import { InputFormat } from '../lib/input-format.js';
import { Packet } from '../lib/packet.js';
import type { AVMediaType, AVSeekFlag } from '../constants/index.js';
import type { Stream } from '../lib/stream.js';
import type { DemuxerOptions, IOInputCallbacks, RawData, RTPDemuxer } from './types.js';
/**
 * High-level demuxer for reading and demuxing media files.
 *
 * Provides simplified access to media streams, packets, and metadata.
 * Handles file opening, format detection, and stream information extraction.
 * Supports files, URLs, buffers, and raw data input with automatic cleanup.
 * Essential component for media processing pipelines and transcoding.
 *
 * @example
 * ```typescript
 * import { Demuxer } from 'node-av/api';
 *
 * // Open media file
 * await using input = await Demuxer.open('video.mp4');
 * console.log(`Format: ${input.formatName}`);
 * console.log(`Duration: ${input.duration}s`);
 *
 * // Process packets
 * for await (const packet of input.packets()) {
 *   console.log(`Packet from stream ${packet.streamIndex}`);
 *   packet.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // From buffer
 * const buffer = await fs.readFile('video.mp4');
 * await using input = await Demuxer.open(buffer);
 *
 * // Access streams
 * const videoStream = input.video();
 * const audioStream = input.audio();
 * ```
 *
 * @see {@link Muxer} For writing media files
 * @see {@link Decoder} For decoding packets to frames
 * @see {@link FormatContext} For low-level API
 */
export declare class Demuxer implements AsyncDisposable, Disposable {
    private formatContext;
    private _streams;
    private ioContext?;
    private isClosed;
    private options;
    private streamStates;
    private tsOffsetDiscont;
    private lastTs;
    private activeGenerators;
    private demuxThread;
    private packetQueues;
    private queueResolvers;
    private demuxThreadActive;
    private demuxEof;
    /**
     * @param formatContext - Opened format context
     *
     * @param options - Media input options
     *
     * @param ioContext - Optional IO context for custom I/O (e.g., from Buffer)
     *
     * @internal
     */
    private constructor();
    /**
     * Probe media format without fully opening the file.
     *
     * Detects format by analyzing file headers and content.
     * Useful for format validation before processing.
     *
     * Direct mapping to av_probe_input_format().
     *
     * @param input - File path or buffer to probe
     *
     * @returns Format information or null if unrecognized
     *
     * @example
     * ```typescript
     * const info = await Demuxer.probeFormat('video.mp4');
     * if (info) {
     *   console.log(`Format: ${info.format}`);
     *   console.log(`Confidence: ${info.confidence}%`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Probe from buffer
     * const buffer = await fs.readFile('video.webm');
     * const info = await Demuxer.probeFormat(buffer);
     * console.log(`MIME type: ${info?.mimeType}`);
     * ```
     *
     * @see {@link InputFormat.probe} For low-level probing
     */
    static probeFormat(input: string | Buffer): Promise<{
        format: string;
        longName?: string;
        extensions?: string;
        mimeType?: string;
        confidence: number;
    } | null>;
    /**
     * Probe media format without fully opening the file synchronously.
     * Synchronous version of probeFormat.
     *
     * Detects format by analyzing file headers and content.
     * Useful for format validation before processing.
     *
     * Direct mapping to av_probe_input_format().
     *
     * @param input - File path or buffer to probe
     *
     * @returns Format information or null if unrecognized
     *
     * @example
     * ```typescript
     * const info = Demuxer.probeFormatSync('video.mp4');
     * if (info) {
     *   console.log(`Format: ${info.format}`);
     *   console.log(`Confidence: ${info.confidence}%`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Probe from buffer
     * const buffer = fs.readFileSync('video.webm');
     * const info = Demuxer.probeFormatSync(buffer);
     * console.log(`MIME type: ${info?.mimeType}`);
     * ```
     *
     * @see {@link probeFormat} For async version
     */
    static probeFormatSync(input: string | Buffer): {
        format: string;
        longName?: string;
        extensions?: string;
        mimeType?: string;
        confidence: number;
    } | null;
    /**
     * Open media from file, URL, buffer, raw data, or custom I/O callbacks.
     *
     * Automatically detects format and extracts stream information.
     * Supports various input sources with flexible configuration.
     * Creates demuxer ready for packet extraction.
     *
     * Direct mapping to avformat_open_input() and avformat_find_stream_info().
     *
     * @param input - File path, URL, buffer, raw data descriptor, or custom I/O callbacks
     *
     * @param options - Input configuration options
     *
     * @returns Opened demuxer instance
     *
     * @throws {Error} If format not found or open fails, or format required for custom I/O
     *
     * @throws {FFmpegError} If FFmpeg operations fail
     *
     * @example
     * ```typescript
     * // Open file
     * await using input = await Demuxer.open('video.mp4');
     * ```
     *
     * @example
     * ```typescript
     * // Open URL
     * await using input = await Demuxer.open('http://example.com/stream.m3u8');
     * ```
     *
     * @example
     * ```typescript
     * // Open with options
     * await using input = await Demuxer.open('rtsp://camera.local', {
     *   format: 'rtsp',
     *   options: {
     *     rtsp_transport: 'tcp',
     *     analyzeduration: '5000000'
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Open raw video data
     * await using input = await Demuxer.open({
     *   type: 'video',
     *   input: rawBuffer,
     *   width: 1920,
     *   height: 1080,
     *   pixelFormat: AV_PIX_FMT_YUV420P,
     *   frameRate: { num: 30, den: 1 }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Custom I/O callbacks
     * const callbacks = {
     *   read: (size: number) => {
     *     // Read data from custom source
     *     return buffer; // or null for EOF, or negative error code
     *   },
     *   seek: (offset: bigint, whence: AVSeekWhence) => {
     *     // Seek in custom source
     *     return offset; // or negative error code
     *   }
     * };
     *
     * await using input = await Demuxer.open(callbacks, {
     *   format: 'mp4',
     *   bufferSize: 8192
     * });
     * ```
     *
     * @see {@link DemuxerOptions} For configuration options
     * @see {@link RawData} For raw data input
     * @see {@link IOInputCallbacks} For custom I/O interface
     */
    static open(input: string | Buffer, options?: DemuxerOptions): Promise<Demuxer>;
    static open(input: IOInputCallbacks, options: (DemuxerOptions | undefined) & {
        format: string;
    }): Promise<Demuxer>;
    static open(rawData: RawData, options?: DemuxerOptions): Promise<Demuxer>;
    /**
     * Open media from file, URL, Buffer, raw data, or custom I/O callbacks synchronously.
     * Synchronous version of open.
     *
     * Automatically detects format and extracts stream information.
     * Supports various input sources with flexible configuration.
     * Creates demuxer ready for packet extraction.
     *
     * Direct mapping to avformat_open_input() and avformat_find_stream_info().
     *
     * @param input - File path, URL, Buffer, raw data descriptor, or custom I/O callbacks
     *
     * @param options - Input configuration options
     *
     * @returns Opened muxer instance
     *
     * @throws {Error} If format not found or open fails, or format required for custom I/O
     *
     * @throws {FFmpegError} If FFmpeg operations fail
     *
     * @example
     * ```typescript
     * // Open file
     * using input = Demuxer.openSync('video.mp4');
     * ```
     *
     * @example
     * ```typescript
     * // Open from buffer
     * const buffer = await fs.readFile('video.mp4');
     * using input = Demuxer.openSync(buffer);
     * ```
     *
     * @example
     * ```typescript
     * // Open with options
     * using input = Demuxer.openSync('rtsp://camera.local', {
     *   format: 'rtsp',
     *   options: {
     *     rtsp_transport: 'tcp',
     *     analyzeduration: '5000000'
     *   }
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Custom I/O callbacks
     * const callbacks = {
     *   read: (size: number) => {
     *     // Read data from custom source
     *     return buffer; // or null for EOF, or negative error code
     *   },
     *   seek: (offset: bigint, whence: AVSeekWhence) => {
     *     // Seek in custom source
     *     return offset; // or negative error code
     *   }
     * };
     *
     * using input = Demuxer.openSync(callbacks, {
     *   format: 'mp4',
     *   bufferSize: 8192
     * });
     * ```
     *
     * @see {@link open} For async version
     * @see {@link IOInputCallbacks} For custom I/O interface
     */
    static openSync(input: string | Buffer, options?: DemuxerOptions): Demuxer;
    static openSync(input: IOInputCallbacks, options: (DemuxerOptions | undefined) & {
        format: string;
    }): Demuxer;
    static openSync(rawData: RawData, options?: DemuxerOptions): Demuxer;
    /**
     * Open RTP/SRTP input stream via localhost UDP.
     *
     * Creates a Demuxer from SDP string received via UDP socket.
     * Opens UDP socket and configures FFmpeg to receive and parse RTP packets.
     *
     * @param sdpContent - SDP content string describing the RTP stream
     *
     * @throws {Error} If SDP parsing or socket setup fails
     *
     * @throws {FFmpegError} If FFmpeg operations fail
     *
     * @returns Promise with Demuxer, sendPacket function and cleanup
     *
     * @example
     * ```typescript
     * import { Demuxer, StreamingUtils } from 'node-av/api';
     * import { AV_CODEC_ID_OPUS } from 'node-av/constants';
     *
     * // Generate SDP for SRTP encrypted Opus
     * const sdp = StreamingUtils.createRTPInputSDP([{
     *   port: 5004,
     *   codecId: AV_CODEC_ID_OPUS,
     *   payloadType: 111,
     *   clockRate: 16000,
     *   channels: 1,
     *   srtp: { key: srtpKey, salt: srtpSalt }
     * }]);
     *
     * // Open RTP input
     * const { input, sendPacket, close } = await Demuxer.openSDP(sdp);
     *
     * // Route encrypted RTP packets from network
     * socket.on('message', (msg) => sendPacket(msg));
     *
     * // Decode audio
     * const decoder = await Decoder.create(input.audio()!);
     * for await (const packet of input.packets()) {
     *   const frame = await decoder.decode(packet);
     *   // Process frame...
     * }
     *
     * // Cleanup
     * await close();
     * ```
     *
     * @see {@link StreamingUtils.createInputSDP} to generate SDP content.
     */
    static openSDP(sdpContent: string): Promise<RTPDemuxer>;
    /**
     * Open RTP/SRTP input stream via localhost UDP synchronously.
     * Synchronous version of openSDP.
     *
     * Creates a Demuxer from SDP string received via UDP socket.
     * Opens UDP socket and configures FFmpeg to receive and parse RTP packets.
     *
     * @param sdpContent - SDP content string describing the RTP stream
     *
     * @throws {Error} If SDP parsing or socket setup fails
     *
     * @throws {FFmpegError} If FFmpeg operations fail
     *
     * @returns Object with Demuxer, sendPacket function and cleanup
     *
     * @example
     * ```typescript
     * import { Demuxer, StreamingUtils } from 'node-av/api';
     * import { AV_CODEC_ID_OPUS } from 'node-av/constants';
     *
     * // Generate SDP for SRTP encrypted Opus
     * const sdp = StreamingUtils.createRTPInputSDP([{
     *   port: 5004,
     *   codecId: AV_CODEC_ID_OPUS,
     *   payloadType: 111,
     *   clockRate: 16000,
     *   channels: 1,
     *   srtp: { key: srtpKey, salt: srtpSalt }
     * }]);
     *
     * // Open RTP input
     * const { input, sendPacket, closeSync } = Demuxer.openSDPSync(sdp);
     *
     * // Route encrypted RTP packets from network
     * socket.on('message', (msg) => sendPacket(msg));
     *
     * // Decode audio
     * const decoder = await Decoder.create(input.audio()!);
     * for await (const packet of input.packets()) {
     *   const frame = await decoder.decode(packet);
     *   // Process frame...
     * }
     *
     * // Cleanup synchronously
     * closeSync();
     * ```
     *
     * @see {@link StreamingUtils.createInputSDP} to generate SDP content.
     * @see {@link openSDP} For async version
     */
    static openSDPSync(sdpContent: string): RTPDemuxer;
    /**
     * Check if input is open.
     *
     * @example
     * ```typescript
     * if (!input.isInputOpen) {
     *   console.log('Input is not open');
     * }
     * ```
     */
    get isInputOpen(): boolean;
    /**
     * Get all streams in the media.
     *
     * @example
     * ```typescript
     * for (const stream of input.streams) {
     *   console.log(`Stream ${stream.index}: ${stream.codecpar.codecType}`);
     * }
     * ```
     */
    get streams(): Stream[];
    /**
     * Get media duration in seconds.
     *
     * Returns 0 if duration is unknown or not available or input is closed.
     *
     * @example
     * ```typescript
     * console.log(`Duration: ${input.duration} seconds`);
     * ```
     */
    get duration(): number;
    /**
     * Get media bitrate in kilobits per second.
     *
     * Returns 0 if bitrate is unknown or not available or input is closed.
     *
     * @example
     * ```typescript
     * console.log(`Bitrate: ${input.bitRate} kbps`);
     * ```
     */
    get bitRate(): number;
    /**
     * Get media metadata.
     *
     * Returns all metadata tags as key-value pairs.
     *
     * @example
     * ```typescript
     * const metadata = input.metadata;
     * console.log(`Title: ${metadata.title}`);
     * console.log(`Artist: ${metadata.artist}`);
     * ```
     */
    get metadata(): Record<string, string>;
    /**
     * Get format name.
     *
     * Returns 'unknown' if input is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(`Format: ${input.formatName}`); // "mov,mp4,m4a,3gp,3g2,mj2"
     * ```
     */
    get formatName(): string;
    /**
     * Get format long name.
     *
     * Returns 'Unknown Format' if input is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(`Format: ${input.formatLongName}`); // "QuickTime / MOV"
     * ```
     */
    get formatLongName(): string;
    /**
     * Get MIME type of the input format.
     *
     * Returns null if input is closed or format is not available.
     *
     * @example
     * ```typescript
     * console.log(`MIME Type: ${input.mimeType}`); // "video/mp4"
     * ```
     */
    get mimeType(): string | null;
    /**
     * Get input stream by index.
     *
     * Returns the stream at the specified index.
     *
     * @param index - Stream index
     *
     * @returns Stream or undefined if index is invalid
     *
     * @example
     * ```typescript
     * const input = await Demuxer.open('input.mp4');
     *
     * // Get the input stream to inspect codec parameters
     * const stream = input.getStream(1); // Get stream at index 1
     * if (stream) {
     *   console.log(`Input codec: ${stream.codecpar.codecId}`);
     * }
     * ```
     *
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
     * const videoStream = input.video();
     * if (videoStream) {
     *   console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Get second video stream
     * const secondVideo = input.video(1);
     * ```
     *
     * @see {@link audio} For audio streams
     * @see {@link findBestStream} For automatic selection
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
     * const audioStream = input.audio();
     * if (audioStream) {
     *   console.log(`Audio: ${audioStream.codecpar.sampleRate}Hz`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Get second audio stream
     * const secondAudio = input.audio(1);
     * ```
     *
     * @see {@link video} For video streams
     * @see {@link findBestStream} For automatic selection
     */
    audio(index?: number): Stream | undefined;
    /**
     * Get input format details.
     *
     * Returns null if input is closed or format is not available.
     *
     * @returns Input format or null
     *
     * @example
     * ```typescript
     * const inputFormat = input.inputFormat;
     * if (inputFormat) {
     *   console.log(`Input Format: ${inputFormat.name}`);
     * }
     * ```
     */
    inputFormat(): InputFormat | null;
    /**
     * Find the best stream of a given type.
     *
     * Uses FFmpeg's stream selection algorithm.
     * Considers codec support, default flags, and quality.
     *
     * Direct mapping to av_find_best_stream().
     *
     * @param type - Media type to find
     *
     * @returns Best stream or undefined if not found or input is closed
     *
     * @example
     * ```typescript
     * import { AVMEDIA_TYPE_VIDEO } from 'node-av/constants';
     *
     * const bestVideo = input.findBestStream(AVMEDIA_TYPE_VIDEO);
     * if (bestVideo) {
     *   const decoder = await Decoder.create(bestVideo);
     * }
     * ```
     *
     * @see {@link video} For direct video stream access
     * @see {@link audio} For direct audio stream access
     */
    findBestStream(type: AVMediaType): Stream | undefined;
    /**
     * Read packets from media as async generator.
     *
     * Yields demuxed packets for processing.
     * Automatically handles packet memory management.
     * Optionally filters packets by stream index.
     *
     * **Supports parallel generators**: Multiple `packets()` iterators can run concurrently.
     * When multiple generators are active, an internal demux thread automatically handles
     * packet distribution to avoid race conditions.
     *
     * Direct mapping to av_read_frame().
     *
     * @param index - Optional stream index to filter
     *
     * @yields {Packet} Demuxed packets (must be freed by caller)
     *
     * @throws {Error} If packet cloning fails
     *
     * @example
     * ```typescript
     * // Read all packets
     * for await (const packet of input.packets()) {
     *   console.log(`Packet: stream=${packet.streamIndex}, pts=${packet.pts}`);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Read only video packets
     * const videoStream = input.video();
     * for await (const packet of input.packets(videoStream.index)) {
     *   // Process video packet
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Parallel processing of video and audio streams
     * const videoGen = input.packets(videoStream.index);
     * const audioGen = input.packets(audioStream.index);
     *
     * await Promise.all([
     *   (async () => {
     *     for await (const packet of videoGen) {
     *       // Process video
     *       packet.free();
     *     }
     *   })(),
     *   (async () => {
     *     for await (const packet of audioGen) {
     *       // Process audio
     *       packet.free();
     *     }
     *   })()
     * ]);
     * ```
     *
     * @see {@link Decoder.frames} For decoding packets
     */
    packets(index?: number): AsyncGenerator<Packet | null>;
    /**
     * Read packets from media as generator synchronously.
     * Synchronous version of packets.
     *
     * Yields demuxed packets for processing.
     * Automatically handles packet memory management.
     * Optionally filters packets by stream index.
     *
     * Direct mapping to av_read_frame().
     *
     * @param index - Optional stream index to filter
     *
     * @yields {Packet} Demuxed packets (must be freed by caller)
     *
     * @throws {Error} If packet cloning fails
     *
     * @example
     * ```typescript
     * // Read all packets
     * for (const packet of input.packetsSync()) {
     *   console.log(`Packet: stream=${packet.streamIndex}, pts=${packet.pts}`);
     *   packet.free();
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Read only video packets
     * const videoStream = input.video();
     * for (const packet of input.packetsSync(videoStream.index)) {
     *   // Process video packet
     *   packet.free();
     * }
     * ```
     *
     * @see {@link packets} For async version
     */
    packetsSync(index?: number): Generator<Packet | null>;
    /**
     * Seek to timestamp in media.
     *
     * Seeks to the specified position in seconds.
     * Can seek in specific stream or globally.
     *
     * Direct mapping to av_seek_frame().
     *
     * @param timestamp - Target position in seconds
     *
     * @param streamIndex - Stream index or -1 for global (default: -1)
     *
     * @param flags - Seek flags (default: AVFLAG_NONE)
     *
     * @returns 0 on success, negative on error
     *
     * @throws {Error} If input is closed
     *
     * @example
     * ```typescript
     * // Seek to 30 seconds
     * const ret = await input.seek(30);
     * FFmpegError.throwIfError(ret, 'seek failed');
     * ```
     *
     * @example
     * ```typescript
     * import { AVSEEK_FLAG_BACKWARD } from 'node-av/constants';
     *
     * // Seek to keyframe before 60 seconds
     * await input.seek(60, -1, AVSEEK_FLAG_BACKWARD);
     * ```
     *
     * @see {@link AVSeekFlag} For seek flags
     */
    seek(timestamp: number, streamIndex?: number, flags?: AVSeekFlag): Promise<number>;
    /**
     * Seek to timestamp in media synchronously.
     * Synchronous version of seek.
     *
     * Seeks to the specified position in seconds.
     * Can seek in specific stream or globally.
     *
     * Direct mapping to av_seek_frame().
     *
     * @param timestamp - Target position in seconds
     *
     * @param streamIndex - Stream index or -1 for global (default: -1)
     *
     * @param flags - Seek flags (default: AVFLAG_NONE)
     *
     * @returns 0 on success, negative on error
     *
     * @throws {Error} If input is closed
     *
     * @example
     * ```typescript
     * // Seek to 30 seconds
     * const ret = input.seekSync(30);
     * FFmpegError.throwIfError(ret, 'seek failed');
     * ```
     *
     * @example
     * ```typescript
     * import { AVSEEK_FLAG_BACKWARD } from 'node-av/constants';
     *
     * // Seek to keyframe before 60 seconds
     * input.seekSync(60, -1, AVSEEK_FLAG_BACKWARD);
     * ```
     *
     * @see {@link seek} For async version
     */
    seekSync(timestamp: number, streamIndex?: number, flags?: AVSeekFlag): number;
    /**
     * Start the internal demux thread for handling multiple parallel packet generators.
     * This thread reads packets from the format context and distributes them to queues.
     *
     * @internal
     */
    private startDemuxThread;
    /**
     * Stop the internal demux thread.
     *
     * @internal
     */
    private stopDemuxThread;
    /**
     * Get or create stream state for timestamp processing.
     *
     * @param streamIndex - Stream index
     *
     * @returns Stream state
     *
     * @internal
     */
    private getStreamState;
    /**
     * PTS Wrap-Around Correction.
     *
     * Based on FFmpeg's ts_fixup().
     *
     * Corrects timestamp wrap-around for streams with limited timestamp bits.
     * DVB streams typically use 31-bit timestamps that wrap around.
     * Without correction, timestamps become negative causing playback errors.
     *
     * Handles:
     * - Detects wrap-around based on pts_wrap_bits from stream
     * - Applies correction once per stream
     * - Corrects both PTS and DTS
     *
     * @param packet - Packet to correct
     *
     * @param stream - Stream metadata
     *
     * @internal
     */
    private ptsWrapAroundCorrection;
    /**
     * DTS Prediction and Update.
     *
     * Based on FFmpeg's ist_dts_update().
     *
     * Predicts next expected DTS for frame ordering validation and discontinuity detection.
     * Uses codec-specific logic:
     * - Audio: Based on sample_rate and frame_size
     * - Video: Based on framerate or duration
     *
     * Handles:
     * - First timestamp initialization
     * - Codec-specific duration calculation
     * - DTS sequence tracking
     *
     * @param packet - Packet to process
     *
     * @param stream - Stream metadata
     *
     * @internal
     */
    private dtsPredict;
    /**
     * Timestamp Discontinuity Detection.
     *
     * Based on FFmpeg's ts_discontinuity_detect().
     *
     * Detects and corrects timestamp discontinuities in streams.
     * Handles two cases:
     * - Discontinuous formats (MPEG-TS): Apply offset correction
     * - Continuous formats (MP4): Mark timestamps as invalid
     *
     * Handles:
     * - Format-specific discontinuity handling (AVFMT_TS_DISCONT flag)
     * - PTS wrap-around detection for streams with limited timestamp bits
     * - Intra-stream discontinuity detection
     * - Inter-stream discontinuity detection
     * - Offset accumulation and application
     * - copyTs mode with selective correction
     *
     * @param packet - Packet to check for discontinuities
     *
     * @param stream - Stream metadata
     *
     * @internal
     */
    private timestampDiscontinuityDetect;
    /**
     * Timestamp Discontinuity Processing - main entry point.
     *
     * Based on FFmpeg's ts_discontinuity_process().
     *
     * Applies accumulated discontinuity offset and detects new discontinuities.
     * Must be called for every packet before other timestamp processing.
     *
     * Handles:
     * - Applying previously-detected offset to all streams
     * - Detecting new discontinuities for audio/video streams
     *
     * @param packet - Packet to process
     *
     * @param stream - Stream metadata
     *
     * @internal
     */
    private timestampDiscontinuityProcess;
    /**
     * Close demuxer and free resources.
     *
     * Releases format context and I/O context.
     * Safe to call multiple times.
     * Automatically called by Symbol.asyncDispose.
     *
     * Direct mapping to avformat_close_input().
     *
     * @example
     * ```typescript
     * const input = await Demuxer.open('video.mp4');
     * try {
     *   // Use input
     * } finally {
     *   await input.close();
     * }
     * ```
     *
     * @see {@link Symbol.asyncDispose} For automatic cleanup
     */
    close(): Promise<void>;
    /**
     * Close demuxer and free resources synchronously.
     * Synchronous version of close.
     *
     * Releases format context and I/O context.
     * Safe to call multiple times.
     * Automatically called by Symbol.dispose.
     *
     * Direct mapping to avformat_close_input().
     *
     * @example
     * ```typescript
     * const input = Demuxer.openSync('video.mp4');
     * try {
     *   // Use input
     * } finally {
     *   input.closeSync();
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
     * Dispose of demuxer.
     *
     * Implements AsyncDisposable interface for automatic cleanup.
     * Equivalent to calling close().
     *
     * @example
     * ```typescript
     * {
     *   await using input = await Demuxer.open('video.mp4');
     *   // Process media...
     * } // Automatically closed
     * ```
     *
     * @see {@link close} For manual cleanup
     */
    [Symbol.asyncDispose](): Promise<void>;
    /**
     * Dispose of demuxer synchronously.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling closeSync().
     *
     * @example
     * ```typescript
     * {
     *   using input = Demuxer.openSync('video.mp4');
     *   // Process media...
     * } // Automatically closed
     * ```
     *
     * @see {@link closeSync} For manual cleanup
     */
    [Symbol.dispose](): void;
}
