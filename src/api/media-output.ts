import { mkdirSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';

import {
  AV_CODEC_FLAG_GLOBAL_HEADER,
  AV_DISPOSITION_ATTACHED_PIC,
  AV_DISPOSITION_DEFAULT,
  AV_NOPTS_VALUE,
  AV_TIME_BASE_Q,
  AVERROR_EAGAIN,
  AVERROR_EOF,
  AVFMT_FLAG_CUSTOM_IO,
  AVFMT_GLOBALHEADER,
  AVFMT_NOFILE,
  AVIO_FLAG_WRITE,
  AVMEDIA_TYPE_AUDIO,
  AVMEDIA_TYPE_VIDEO,
} from '../constants/constants.js';
import { Dictionary } from '../lib/dictionary.js';
import { FFmpegError } from '../lib/error.js';
import { FormatContext } from '../lib/format-context.js';
import { IOContext } from '../lib/io-context.js';
import { Packet } from '../lib/packet.js';
import { Rational } from '../lib/rational.js';
import { SyncQueue, SyncQueueType } from '../lib/sync-queue.js';
import { avGetAudioFrameDuration2, avRescaleDelta, avRescaleQ } from '../lib/utilities.js';
import { IO_BUFFER_SIZE, MAX_MUXING_QUEUE_SIZE, MAX_PACKET_SIZE, MUXING_QUEUE_DATA_THRESHOLD, SYNC_BUFFER_DURATION } from './constants.js';
import { Encoder } from './encoder.js';
import { AsyncQueue } from './utilities/async-queue.js';

import type { IRational, OutputFormat, Stream } from '../lib/index.js';
import type { IOOutputCallbacks, MediaOutputOptions } from './types.js';

export interface AddStreamOptionsWithEncoder {
  encoder?: Encoder;
  timeBase?: IRational;
}

export interface AddStreamOptionsWithInputStream {
  inputStream?: Stream;
  timeBase?: IRational;
}

interface StreamDescription {
  initialized: boolean;
  stream: Stream;
  inputStream?: Stream; // Source stream for metadata/properties (optional in encoder-only mode)
  encoder?: Encoder;
  timeBase?: IRational;
  sourceTimeBase?: IRational;
  isStreamCopy: boolean;
  sqIdxMux: number; // Index in sync queue, -1 if not using sync queue
  bufferedPackets: Packet[]; // Used only during initialization phase before header is written
  bufferedDataSize: number;
  lastMuxDts: bigint;
  tsRescaleDeltaLast: { value: bigint }; // For av_rescale_delta (audio streamcopy)
  streamcopyStarted: boolean; // Track if streamcopy has started for this stream
}

interface WriteJob {
  pkt: Packet;
  streamInfo: StreamDescription;
  streamIndex: number;
}

/**
 * High-level media output for writing and muxing media files.
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
 * import { MediaOutput } from 'node-av/api';
 *
 * // Create output file
 * await using output = await MediaOutput.open('output.mp4');
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
 * await using input = await MediaInput.open('input.mp4');
 * await using output = await MediaOutput.open('output.mp4');
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
 * @see {@link MediaInput} For reading media files
 * @see {@link Encoder} For encoding frames to packets
 * @see {@link FormatContext} For low-level API
 */
export class MediaOutput implements AsyncDisposable, Disposable {
  private formatContext: FormatContext;
  private options: MediaOutputOptions;
  private _streams = new Map<number, StreamDescription>();
  private ioContext?: IOContext;
  private headerWritten = false;
  private headerWritePromise?: Promise<void>;
  private trailerWritten = false;
  private isClosed = false;
  private syncQueue?: SyncQueue; // FFmpeg's native sync queue for packet interleaving
  private sqPacket?: Packet; // Reusable packet for sync queue receive
  private containerMetadataCopied = false; // Track if container metadata has been copied
  private writeQueue?: AsyncQueue<WriteJob>; // Optional async queue for serialized writes
  private writeWorkerPromise?: Promise<void>; // Background worker promise

  /**
   * @param options - Media output options
   *
   * @internal
   */
  private constructor(options?: MediaOutputOptions) {
    this.options = {
      copyInitialNonkeyframes: false,
      exitOnError: true,
      useSyncQueue: true,
      useAsyncWrite: false,
      ...options,
    };

    this.formatContext = new FormatContext();

    if (this.options.useAsyncWrite) {
      this.writeQueue = new AsyncQueue<WriteJob>(1); // size=1 for strict serialization
      this.startWriteWorker();
    }
  }

  /**
   * Open media output for writing.
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
   * @returns Opened media output instance
   *
   * @throws {Error} If format required for custom I/O
   *
   * @throws {FFmpegError} If allocation or opening fails
   *
   * @example
   * ```typescript
   * // Create file output
   * await using output = await MediaOutput.open('output.mp4');
   * ```
   *
   * @example
   * ```typescript
   * // Create output with specific format
   * await using output = await MediaOutput.open('output.ts', {
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
   * await using output = await MediaOutput.open(callbacks, {
   *   format: 'mp4',
   *   bufferSize: 8192
   * });
   * ```
   *
   * @see {@link MediaOutputOptions} For configuration options
   * @see {@link IOOutputCallbacks} For custom I/O interface
   */
  static async open(target: string, options?: MediaOutputOptions): Promise<MediaOutput>;
  static async open(target: IOOutputCallbacks, options: MediaOutputOptions & { format: string }): Promise<MediaOutput>;
  static async open(target: string | IOOutputCallbacks, options?: MediaOutputOptions): Promise<MediaOutput> {
    const output = new MediaOutput(options);

    try {
      if (typeof target === 'string') {
        // File or stream URL - resolve relative paths and create directories
        // Check if it's a URL (starts with protocol://) or a file path
        const isUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target);
        const resolvedTarget = isUrl ? target : resolve(target);

        // Create directory structure for local files (not URLs)
        if (!isUrl && target !== '') {
          const dir = dirname(resolvedTarget);
          await mkdir(dir, { recursive: true });
        }
        // Allocate output context
        const ret = output.formatContext.allocOutputContext2(null, options?.format ?? null, resolvedTarget === '' ? null : resolvedTarget);
        FFmpegError.throwIfError(ret, 'Failed to allocate output context');

        // Set format options if provided
        if (options?.options) {
          for (const [key, value] of Object.entries(options.options)) {
            output.formatContext.setOption(key, value);
          }
        }

        // Check if we need to open IO
        const oformat = output.formatContext.oformat;
        if (resolvedTarget && oformat && !oformat.hasFlags(AVFMT_NOFILE)) {
          // For file-based formats, we need to open the file using avio_open2
          // FFmpeg will manage the AVIOContext internally
          output.ioContext = new IOContext();
          const openRet = await output.ioContext.open2(resolvedTarget, AVIO_FLAG_WRITE);
          FFmpegError.throwIfError(openRet, `Failed to open output file: ${resolvedTarget}`);
          output.formatContext.pb = output.ioContext;
        }
      } else {
        // Custom IO with callbacks - format is required
        if (!options?.format) {
          throw new Error('Format must be specified for custom IO');
        }

        const ret = output.formatContext.allocOutputContext2(null, options.format, null);
        FFmpegError.throwIfError(ret, 'Failed to allocate output context');

        // Set format options if provided
        if (options?.options) {
          for (const [key, value] of Object.entries(options.options)) {
            output.formatContext.setOption(key, value);
          }
        }

        // Setup custom IO with callbacks
        output.ioContext = new IOContext();
        output.ioContext.allocContextWithCallbacks(options.bufferSize ?? IO_BUFFER_SIZE, 1, target.read, target.write, target.seek);
        output.ioContext.maxPacketSize = options.maxPacketSize ?? MAX_PACKET_SIZE;
        output.formatContext.pb = output.ioContext;
        output.formatContext.setFlags(AVFMT_FLAG_CUSTOM_IO);
      }

      return output;
    } catch (error) {
      // Cleanup on error
      if (output.ioContext) {
        try {
          const isCustomIO = output.formatContext.hasFlags(AVFMT_FLAG_CUSTOM_IO);
          if (isCustomIO) {
            // Clear the pb reference first
            output.formatContext.pb = null;
            // For custom IO with callbacks, free the context
            output.ioContext.freeContext();
          } else {
            // For file-based IO, close the file handle
            await output.ioContext.closep();
          }
        } catch {
          // Ignore errors
        }
      }
      if (output.formatContext) {
        try {
          output.formatContext.freeContext();
        } catch {
          // Ignore errors
        }
      }
      throw error;
    }
  }

  /**
   * Open media output for writing synchronously.
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
   * @returns Opened media output instance
   *
   * @throws {Error} If format required for custom I/O
   *
   * @throws {FFmpegError} If allocation or opening fails
   *
   * @example
   * ```typescript
   * // Create file output
   * using output = MediaOutput.openSync('output.mp4');
   * ```
   *
   * @example
   * ```typescript
   * // Create output with specific format
   * using output = MediaOutput.openSync('output.ts', {
   *   format: 'mpegts'
   * });
   * ```
   *
   * @see {@link open} For async version
   */
  static openSync(target: string, options?: MediaOutputOptions): MediaOutput;
  static openSync(target: IOOutputCallbacks, options: MediaOutputOptions & { format: string }): MediaOutput;
  static openSync(target: string | IOOutputCallbacks, options?: MediaOutputOptions): MediaOutput {
    const output = new MediaOutput(options);

    try {
      if (typeof target === 'string') {
        // File or stream URL - resolve relative paths and create directories
        // Check if it's a URL (starts with protocol://) or a file path
        const isUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target);
        const resolvedTarget = isUrl ? target : resolve(target);

        // Create directory structure for local files (not URLs)
        if (!isUrl && target !== '') {
          const dir = dirname(resolvedTarget);
          mkdirSync(dir, { recursive: true });
        }
        // Allocate output context
        const ret = output.formatContext.allocOutputContext2(null, options?.format ?? null, resolvedTarget === '' ? null : resolvedTarget);
        FFmpegError.throwIfError(ret, 'Failed to allocate output context');

        // Set format options if provided
        if (options?.options) {
          for (const [key, value] of Object.entries(options.options)) {
            output.formatContext.setOption(key, value);
          }
        }

        // Check if we need to open IO
        const oformat = output.formatContext.oformat;
        if (resolvedTarget && oformat && !oformat.hasFlags(AVFMT_NOFILE)) {
          // For file-based formats, we need to open the file using avio_open2
          // FFmpeg will manage the AVIOContext internally
          output.ioContext = new IOContext();
          const openRet = output.ioContext.open2Sync(resolvedTarget, AVIO_FLAG_WRITE);
          FFmpegError.throwIfError(openRet, `Failed to open output file: ${resolvedTarget}`);
          output.formatContext.pb = output.ioContext;
        }
      } else {
        // Custom IO with callbacks - format is required
        if (!options?.format) {
          throw new Error('Format must be specified for custom IO');
        }

        const ret = output.formatContext.allocOutputContext2(null, options.format, null);
        FFmpegError.throwIfError(ret, 'Failed to allocate output context');

        // Set format options if provided
        if (options?.options) {
          for (const [key, value] of Object.entries(options.options)) {
            output.formatContext.setOption(key, value);
          }
        }

        // Setup custom IO with callbacks
        output.ioContext = new IOContext();
        output.ioContext.allocContextWithCallbacks(options.bufferSize ?? IO_BUFFER_SIZE, 1, target.read, target.write, target.seek);
        output.ioContext.maxPacketSize = options.maxPacketSize ?? MAX_PACKET_SIZE;
        output.formatContext.pb = output.ioContext;
        output.formatContext.setFlags(AVFMT_FLAG_CUSTOM_IO);
      }

      return output;
    } catch (error) {
      // Cleanup on error
      if (output.ioContext) {
        try {
          const isCustomIO = output.formatContext.hasFlags(AVFMT_FLAG_CUSTOM_IO);
          if (isCustomIO) {
            // Clear the pb reference first
            output.formatContext.pb = null;
            // For custom IO with callbacks, free the context
            output.ioContext.freeContext();
          } else {
            // For file-based IO, close the file handle
            output.ioContext.closepSync();
          }
        } catch {
          // Ignore errors
        }
      }
      if (output.formatContext) {
        try {
          output.formatContext.freeContext();
        } catch {
          // Ignore errors
        }
      }
      throw error;
    }
  }

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
  get isOutputOpen(): boolean {
    return !this.isClosed;
  }

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
  get isOutputInitialized(): boolean {
    if (this._streams.size === 0) {
      return false;
    }

    if (this.isClosed) {
      return false;
    }

    return Array.from(this._streams).every(([_, stream]) => stream.initialized);
  }

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
  get streams(): Stream[] {
    return this.formatContext.streams;
  }

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
  get formatName(): string {
    if (this.isClosed) {
      return 'unknown';
    }

    return this.formatContext.oformat?.name ?? 'unknown';
  }

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
  get formatLongName(): string {
    if (this.isClosed) {
      return 'Unknown Format';
    }

    return this.formatContext.oformat?.longName ?? 'Unknown Format';
  }

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
  get mimeType(): string | null {
    if (this.isClosed) {
      return null;
    }

    return this.formatContext.oformat?.mimeType ?? null;
  }

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

  addStream(streamOrEncoder: Stream | Encoder, options?: AddStreamOptionsWithEncoder | AddStreamOptionsWithInputStream): number {
    if (this.isClosed) {
      throw new Error('MediaOutput is closed');
    }

    if (this.headerWritten) {
      throw new Error('Cannot add streams after packets have been written');
    }

    const outStream = this.formatContext.newStream(null);
    if (!outStream) {
      throw new Error('Failed to create new stream');
    }

    // Determine if first parameter is Encoder or Stream
    const isEncoderFirst = streamOrEncoder instanceof Encoder;

    let stream: Stream | undefined;
    let encoder: Encoder | undefined;

    if (isEncoderFirst) {
      // First parameter is Encoder
      encoder = streamOrEncoder;
      stream = (options as AddStreamOptionsWithInputStream | undefined)?.inputStream;
    } else {
      // First parameter is Stream
      stream = streamOrEncoder;
      encoder = (options as AddStreamOptionsWithEncoder | undefined)?.encoder;
    }

    const isStreamCopy = !encoder;

    // Auto-set GLOBAL_HEADER flag if format requires it
    if (encoder) {
      const oformat = this.formatContext.oformat;
      if (oformat?.hasFlags(AVFMT_GLOBALHEADER)) {
        encoder.setCodecFlags(AV_CODEC_FLAG_GLOBAL_HEADER);
      }
    }

    // For stream copy, initialize immediately since we have all the info
    if (isStreamCopy) {
      if (!stream) {
        throw new Error('Stream copy mode requires an input stream');
      }

      const ret = stream.codecpar.copy(outStream.codecpar);
      FFmpegError.throwIfError(ret, 'Failed to copy codec parameters');

      // Set the timebases
      const sourceTimeBase = stream.timeBase;

      if (options?.timeBase) {
        outStream.timeBase = new Rational(options.timeBase.num, options.timeBase.den);
      } else {
        outStream.timeBase = new Rational(stream.timeBase.num, stream.timeBase.den);
      }

      // Copy frame rates and aspect ratios
      outStream.avgFrameRate = stream.avgFrameRate;
      if (stream.sampleAspectRatio.num > 0) {
        outStream.sampleAspectRatio = stream.sampleAspectRatio;
      }
      outStream.rFrameRate = stream.rFrameRate;

      // Copy duration
      if (stream.duration > 0n) {
        outStream.duration = stream.duration;
      }

      // Copy metadata
      const metadata = stream.metadata;
      if (metadata) {
        outStream.metadata = metadata;
      }

      // Copy disposition
      outStream.disposition = stream.disposition;

      // Copy coded_side_data (HDR/Dolby Vision)
      // Iterate over all side_data entries and copy them
      const allSideData = stream.codecpar.getAllCodedSideData();
      for (const sd of allSideData) {
        outStream.codecpar.addCodedSideData(sd.type, sd.data);
      }

      this._streams.set(outStream.index, {
        initialized: true,
        stream: outStream,
        inputStream: stream,
        encoder: undefined,
        timeBase: options?.timeBase,
        sourceTimeBase,
        isStreamCopy: true,
        sqIdxMux: -1, // Will be set if sync queue is needed
        bufferedPackets: [],
        bufferedDataSize: 0,
        lastMuxDts: AV_NOPTS_VALUE,
        tsRescaleDeltaLast: { value: AV_NOPTS_VALUE },
        streamcopyStarted: false,
      });
    } else {
      // Encoding path - lazy initialization
      // stream is optional here - if provided, we copy metadata/disposition
      // If not provided (encoder-only mode), stream will be initialized from first encoded frame
      this._streams.set(outStream.index, {
        initialized: false,
        stream: outStream,
        inputStream: stream,
        encoder,
        timeBase: options?.timeBase,
        sourceTimeBase: undefined, // Will be set on initialization
        isStreamCopy: false,
        sqIdxMux: -1, // Will be set if sync queue is needed
        bufferedPackets: [],
        bufferedDataSize: 0,
        lastMuxDts: AV_NOPTS_VALUE,
        tsRescaleDeltaLast: { value: AV_NOPTS_VALUE },
        streamcopyStarted: false,
      });
    }

    return outStream.index;
  }

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
   * const output = await MediaOutput.open('output.mp4');
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
  getStream(index: number): Stream | undefined {
    const streams = this.formatContext.streams;
    if (!streams || index < 0 || index >= streams.length) {
      return undefined;
    }
    return streams[index];
  }

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
   * const output = await MediaOutput.open('output.mp4');
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
  video(index = 0): Stream | undefined {
    const streams = this.formatContext.streams;
    if (!streams) return undefined;
    const videoStreams = streams.filter((s) => s.codecpar.codecType === AVMEDIA_TYPE_VIDEO);
    return videoStreams[index];
  }

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
   * const output = await MediaOutput.open('output.mp4');
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
  audio(index = 0): Stream | undefined {
    const streams = this.formatContext.streams;
    if (!streams) return undefined;
    const audioStreams = streams.filter((s) => s.codecpar.codecType === AVMEDIA_TYPE_AUDIO);
    return audioStreams[index];
  }

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
   * const output = await MediaOutput.open('output.mp4');
   * const format = output.outputFormat();
   * if (format) {
   *   console.log(`Output format: ${format.name}`);
   * }
   * ```
   *
   * @see {@link OutputFormat} For format details
   */
  outputFormat(): OutputFormat | null {
    return this.formatContext.oformat;
  }

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
   * Direct mapping to avformat_write_header() (on first packet) and av_interleaved_write_frame().
   *
   * @param packet - Packet to write
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
  async writePacket(packet: Packet, streamIndex: number): Promise<void> {
    if (this.isClosed) {
      throw new Error('MediaOutput is closed');
    }

    if (this.trailerWritten) {
      throw new Error('Cannot write packets after output is finalized');
    }

    if (!this._streams.get(streamIndex)) {
      throw new Error(`Invalid stream index: ${streamIndex}`);
    }

    // Initialize any encoder streams that are ready
    for (const streamInfo of this._streams.values()) {
      if (!streamInfo.initialized && streamInfo.encoder) {
        const encoder = streamInfo.encoder;
        const codecContext = encoder.getCodecContext();

        // Skip if encoder not ready yet
        if (!encoder.isEncoderInitialized || !codecContext) {
          continue;
        }

        // This encoder is ready, initialize it now
        // Read codecType from codecContext, not from stream (which is still uninitialized)
        const codecType = codecContext.codecType;

        // 1. Set stream timebase
        // Use encoder's timebase unless user specified custom timebase
        if (streamInfo.timeBase) {
          // User specified custom timebase
          streamInfo.stream.timeBase = new Rational(streamInfo.timeBase.num, streamInfo.timeBase.den);
        } else {
          // Use encoder's timebase directly
          // The encoder timebase is already set from the first frame in Encoder.initialize()
          streamInfo.stream.timeBase = new Rational(codecContext.timeBase.num, codecContext.timeBase.den);
        }

        // 2. Set stream avg_frame_rate and sample_aspect_ratio
        if (codecType === AVMEDIA_TYPE_VIDEO) {
          const fr = codecContext.framerate;
          streamInfo.stream.avgFrameRate = new Rational(fr.num, fr.den);
          streamInfo.stream.sampleAspectRatio = codecContext.sampleAspectRatio;
        }

        // 3. Copy codec parameters from encoder context
        const ret = streamInfo.stream.codecpar.fromContext(codecContext);
        FFmpegError.throwIfError(ret, 'Failed to copy codec parameters from encoder');

        // 4. Copy metadata from input stream
        if (streamInfo.inputStream) {
          const metadata = streamInfo.inputStream.metadata;
          if (metadata) {
            streamInfo.stream.metadata = metadata;
          }

          // 5. Copy disposition from input stream
          streamInfo.stream.disposition = streamInfo.inputStream.disposition;

          // 6. Copy duration hint from input stream
          if (streamInfo.inputStream.duration > 0n) {
            const inputTb = streamInfo.inputStream.timeBase;
            const outputTb = streamInfo.stream.timeBase;
            streamInfo.stream.duration = avRescaleQ(streamInfo.inputStream.duration, inputTb, outputTb);
          }
        }

        // Update the source timebase for timestamp rescaling
        streamInfo.sourceTimeBase = codecContext.timeBase;

        // Mark as initialized
        streamInfo.initialized = true;
      }
    }

    const streamInfo = this._streams.get(streamIndex)!;

    // Apply streamcopy filtering BEFORE buffering
    // This ensures rejected packets never enter the queue/buffer
    if (streamInfo.isStreamCopy) {
      const shouldWrite = this.ofStreamcopy(packet, streamInfo, streamIndex);
      if (!shouldWrite) {
        return;
      }
    }

    // Check if any streams are still uninitialized or header is being written
    const uninitialized = Array.from(this._streams.values()).some((s) => !s.initialized);

    // Before header write, buffer packets:
    // - WITH SyncQueue: Send directly to sq_send() (SyncQueue buffers internally)
    // - WITHOUT SyncQueue: Buffer in bufferedPackets[] array
    const usingSyncQueue = this.syncQueue && streamInfo.sqIdxMux >= 0;

    // Buffer packets before header write (not ready yet)
    if (uninitialized || this.headerWritePromise) {
      // Check buffering limits (applies
      const maxPackets = this.options.maxMuxingQueueSize ?? MAX_MUXING_QUEUE_SIZE;
      const dataThreshold = this.options.muxingQueueDataThreshold ?? MUXING_QUEUE_DATA_THRESHOLD;

      const currentPackets = streamInfo.bufferedPackets.length;
      const currentBytes = streamInfo.bufferedDataSize;
      const packetSize = packet.size;

      const thresholdReached = currentBytes + packetSize > dataThreshold;
      const effectiveMaxPackets = thresholdReached ? maxPackets : Number.MAX_SAFE_INTEGER;

      // Check if we would exceed packet limit (only if threshold reached)
      if (currentPackets >= effectiveMaxPackets) {
        throw new Error(
          // eslint-disable-next-line @stylistic/max-len
          `Too many packets buffered for output stream ${streamIndex} (packets: ${currentPackets}, bytes: ${currentBytes}, threshold: ${dataThreshold}, max: ${maxPackets})`,
        );
      }

      if (usingSyncQueue) {
        // Path 1: Send to SyncQueue (buffers internally)
        // Set packet timeBase from stream
        packet.timeBase = streamInfo.stream.timeBase;

        const ret = this.syncQueue!.send(streamInfo.sqIdxMux, packet);
        FFmpegError.throwIfError(ret, 'Failed to send packet to sync queue');

        // Track buffered data size for limit checking (even though SyncQueue holds the actual packets)
        streamInfo.bufferedDataSize += packetSize;
      } else {
        // Path 2: Buffer in bufferedPackets[] array
        const clonedPacket = packet.clone();
        if (clonedPacket) {
          streamInfo.bufferedPackets.push(clonedPacket);
          streamInfo.bufferedDataSize += packetSize;
        }
      }

      return; // Don't proceed to header write yet
    }
    // Automatically write header if not written yet
    if (!this.headerWritten) {
      this.headerWritePromise ??= (async () => {
        this.setupSyncQueues();
        this.updateDefaultDisposition();
        this.copyContainerMetadata();

        const ret = await this.formatContext.writeHeader();
        FFmpegError.throwIfError(ret, 'Failed to write header');

        this.headerWritten = true;
      })();

      await this.headerWritePromise;

      if (this.headerWritten) {
        this.headerWritePromise = undefined;
      }
    }

    // Write packet - different strategy based on sync queue usage
    if (this.syncQueue && streamInfo.sqIdxMux >= 0) {
      // Use SyncQueue for packet interleaving
      // Set packet timeBase from stream
      packet.timeBase = streamInfo.stream.timeBase;

      // Send packet to sync queue
      const ret = this.syncQueue.send(streamInfo.sqIdxMux, packet);

      // Handle errors from sq_send
      if (ret < 0) {
        if (ret === AVERROR_EOF) {
          // Stream finished - this is normal, just return
          return;
        }

        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Failed to send packet to sync queue');
        }
        return;
      }

      // Receive synchronized packets from queue and write to muxer
      while (!this.isClosed) {
        const recvRet = this.syncQueue.receive(-1, this.sqPacket!);
        if (recvRet === AVERROR_EAGAIN) {
          break; // No more packets ready
        }
        if (recvRet === AVERROR_EOF) {
          break; // All streams finished
        }
        if (recvRet >= 0) {
          // recvRet is the stream index
          const recvStreamInfo = this._streams.get(recvRet)!;

          // Clone packet before writing (muxer takes ownership and will unref it)
          // We need to keep sqPacket alive for the next receive() call
          const pkt = this.sqPacket!.clone();
          if (!pkt) {
            throw new Error('Failed to clone packet from sync queue');
          }
          pkt.streamIndex = recvRet;

          // Write packet (muxer takes ownership)
          await this.write(pkt, recvStreamInfo, recvRet);
        }
      }
    } else {
      // No sync queue needed
      // Flush buffered packets
      if (streamInfo.bufferedPackets.length > 0) {
        for (const pkt of streamInfo.bufferedPackets) {
          pkt.streamIndex = streamIndex;
          await this.write(pkt, streamInfo, streamIndex);
        }
        streamInfo.bufferedPackets = [];
        streamInfo.bufferedDataSize = 0;
      }

      // Write current packet directly
      // Clone packet since caller still owns it
      const clonedPacket = packet.clone();
      if (!clonedPacket) {
        throw new Error('Failed to clone packet for writing');
      }
      clonedPacket.streamIndex = streamIndex;
      await this.write(clonedPacket, streamInfo, streamIndex);
    }
  }

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
   * Direct mapping to avformat_write_header() (on first packet) and av_interleaved_write_frame().
   *
   * @param packet - Packet to write
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
  writePacketSync(packet: Packet, streamIndex: number): void {
    if (this.isClosed) {
      throw new Error('MediaOutput is closed');
    }

    if (this.trailerWritten) {
      throw new Error('Cannot write packets after output is finalized');
    }

    if (!this._streams.get(streamIndex)) {
      throw new Error(`Invalid stream index: ${streamIndex}`);
    }

    // Initialize any encoder streams that are ready
    for (const streamInfo of this._streams.values()) {
      if (!streamInfo.initialized && streamInfo.encoder) {
        const encoder = streamInfo.encoder;
        const codecContext = encoder.getCodecContext();

        // Skip if encoder not ready yet
        if (!encoder.isEncoderInitialized || !codecContext) {
          continue;
        }

        // This encoder is ready, initialize it now
        // Read codecType from codecContext, not from stream (which is still uninitialized)
        const codecType = codecContext.codecType;

        // 1. Set stream timebase
        // Use encoder's timebase unless user specified custom timebase
        if (streamInfo.timeBase) {
          // User specified custom timebase
          streamInfo.stream.timeBase = new Rational(streamInfo.timeBase.num, streamInfo.timeBase.den);
        } else {
          // Use encoder's timebase directly
          // The encoder timebase is already set from the first frame in Encoder.initialize()
          streamInfo.stream.timeBase = new Rational(codecContext.timeBase.num, codecContext.timeBase.den);
        }

        // 2. Set stream avg_frame_rate and sample_aspect_ratio
        if (codecType === AVMEDIA_TYPE_VIDEO) {
          const fr = codecContext.framerate;
          streamInfo.stream.avgFrameRate = new Rational(fr.num, fr.den);
          streamInfo.stream.sampleAspectRatio = codecContext.sampleAspectRatio;
        }

        // 3. Copy codec parameters from encoder context
        const ret = streamInfo.stream.codecpar.fromContext(codecContext);
        FFmpegError.throwIfError(ret, 'Failed to copy codec parameters from encoder');

        // 4. Copy metadata from input stream
        if (streamInfo.inputStream) {
          const metadata = streamInfo.inputStream.metadata;
          if (metadata) {
            streamInfo.stream.metadata = metadata;
          }

          // 5. Copy disposition from input stream
          streamInfo.stream.disposition = streamInfo.inputStream.disposition;

          // 6. Copy duration hint from input stream
          if (streamInfo.inputStream.duration > 0n) {
            const inputTb = streamInfo.inputStream.timeBase;
            const outputTb = streamInfo.stream.timeBase;
            streamInfo.stream.duration = avRescaleQ(streamInfo.inputStream.duration, inputTb, outputTb);
          }
        }

        // Update the source timebase for timestamp rescaling
        streamInfo.sourceTimeBase = codecContext.timeBase;

        // Mark as initialized
        streamInfo.initialized = true;
      }
    }

    const streamInfo = this._streams.get(streamIndex)!;

    // Apply streamcopy filtering BEFORE buffering
    // This ensures rejected packets never enter the queue/buffer
    if (streamInfo.isStreamCopy) {
      const shouldWrite = this.ofStreamcopy(packet, streamInfo, streamIndex);
      if (!shouldWrite) {
        return;
      }
    }

    // Check if any streams are still uninitialized
    const uninitialized = Array.from(this._streams.values()).some((s) => !s.initialized);

    // Before header write, buffer packets:
    // - WITH SyncQueue: Send directly to sq_send() (SyncQueue buffers internally)
    // - WITHOUT SyncQueue: Buffer in bufferedPackets[] array
    const usingSyncQueue = this.syncQueue && streamInfo.sqIdxMux >= 0;

    // Buffer packets before header write (not ready yet)
    if (uninitialized) {
      // Check buffering limits
      const maxPackets = this.options.maxMuxingQueueSize ?? MAX_MUXING_QUEUE_SIZE;
      const dataThreshold = this.options.muxingQueueDataThreshold ?? MUXING_QUEUE_DATA_THRESHOLD;

      const currentPackets = streamInfo.bufferedPackets.length;
      const currentBytes = streamInfo.bufferedDataSize;
      const packetSize = packet.size;

      const thresholdReached = currentBytes + packetSize > dataThreshold;
      const effectiveMaxPackets = thresholdReached ? maxPackets : Number.MAX_SAFE_INTEGER;

      // Check if we would exceed packet limit (only if threshold reached)
      if (currentPackets >= effectiveMaxPackets) {
        throw new Error(
          // eslint-disable-next-line @stylistic/max-len
          `Too many packets buffered for output stream ${streamIndex} (packets: ${currentPackets}, bytes: ${currentBytes}, threshold: ${dataThreshold}, max: ${maxPackets})`,
        );
      }

      if (usingSyncQueue) {
        // Path 1: Send to SyncQueue (buffers internally)
        // Set packet timeBase from stream
        packet.timeBase = streamInfo.stream.timeBase;

        const ret = this.syncQueue!.send(streamInfo.sqIdxMux, packet);
        FFmpegError.throwIfError(ret, 'Failed to send packet to sync queue');

        // Track buffered data size for limit checking (even though SyncQueue holds the actual packets)
        streamInfo.bufferedDataSize += packetSize;
      } else {
        // Path 2: Buffer in bufferedPackets[] array
        const clonedPacket = packet.clone();
        if (clonedPacket) {
          streamInfo.bufferedPackets.push(clonedPacket);
          streamInfo.bufferedDataSize += packetSize;
        }
      }

      return; // Don't proceed to header write yet
    }

    // Automatically write header if not written yet
    if (!this.headerWritten) {
      this.setupSyncQueues();
      this.updateDefaultDisposition();
      this.copyContainerMetadata();

      const ret = this.formatContext.writeHeaderSync();
      FFmpegError.throwIfError(ret, 'Failed to write header');
      this.headerWritten = true;
    }

    // Write packet - different strategy based on sync queue usage
    if (this.syncQueue && streamInfo.sqIdxMux >= 0) {
      // Use SyncQueue for packet interleaving
      // Set packet timeBase from stream
      packet.timeBase = streamInfo.stream.timeBase;

      // Send packet to sync queue
      const ret = this.syncQueue.send(streamInfo.sqIdxMux, packet);

      // Handle errors from sq_send
      if (ret < 0) {
        if (ret === AVERROR_EOF) {
          // Stream finished - this is normal, just return
          return;
        }

        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Failed to send packet to sync queue');
        }
        return;
      }

      // Receive synchronized packets from queue and write to muxer
      while (!this.isClosed) {
        const recvRet = this.syncQueue.receive(-1, this.sqPacket!);
        if (recvRet === AVERROR_EAGAIN) {
          break; // No more packets ready
        }
        if (recvRet === AVERROR_EOF) {
          break; // All streams finished
        }
        if (recvRet >= 0) {
          // recvRet is the stream index
          const recvStreamInfo = this._streams.get(recvRet)!;

          // Clone packet before writing (muxer takes ownership and will unref it)
          // We need to keep sqPacket alive for the next receive() call
          const pkt = this.sqPacket!.clone();
          if (!pkt) {
            throw new Error('Failed to clone packet from sync queue');
          }
          pkt.streamIndex = recvRet;

          // Write packet (muxer takes ownership)
          this.writeSync(pkt, recvStreamInfo, recvRet);
        }
      }
    } else {
      // No sync queue needed
      // Flush buffered packets
      if (streamInfo.bufferedPackets.length > 0) {
        for (const pkt of streamInfo.bufferedPackets) {
          pkt.streamIndex = streamIndex;
          this.writeSync(pkt, streamInfo, streamIndex);
        }
        streamInfo.bufferedPackets = [];
        streamInfo.bufferedDataSize = 0;
      }

      // Write current packet directly
      // Clone packet since caller still owns it
      const clonedPacket = packet.clone();
      if (!clonedPacket) {
        throw new Error('Failed to clone packet for writing');
      }
      clonedPacket.streamIndex = streamIndex;
      this.writeSync(clonedPacket, streamInfo, streamIndex);
    }
  }

  /**
   * Close media output and free resources.
   *
   * Automatically writes trailer if header was written.
   * Closes the output file and releases all resources.
   * Safe to call multiple times.
   * Automatically called by Symbol.asyncDispose.
   *
   * @example
   * ```typescript
   * const output = await MediaOutput.open('output.mp4');
   * try {
   *   // Use output - trailer written automatically on close
   * } finally {
   *   await output.close();
   * }
   * ```
   *
   * @see {@link Symbol.asyncDispose} For automatic cleanup
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Close write queue and wait for worker to finish
    if (this.writeQueue) {
      this.writeQueue.close();
      await this.writeWorkerPromise;
    }

    // Free any buffered packets
    for (const streamInfo of this._streams.values()) {
      // Free any buffered packets
      for (const pkt of streamInfo.bufferedPackets) {
        pkt.free();
      }
      streamInfo.bufferedPackets = [];
    }

    // Free sync queue resources
    if (this.sqPacket) {
      this.sqPacket.free();
      this.sqPacket = undefined;
    }
    if (this.syncQueue) {
      this.syncQueue.free();
      this.syncQueue = undefined;
    }

    // Try to write trailer if header was written but trailer wasn't
    try {
      if (this.headerWritten && !this.trailerWritten) {
        await this.formatContext.writeTrailer();
        this.trailerWritten = true;
      }
    } catch {
      // Ignore errors
    }

    // Clear pb reference first to prevent use-after-free
    if (this.ioContext) {
      this.formatContext.pb = null;
    }

    // Determine if this is custom IO before freeing format context
    const isCustomIO = this.formatContext.hasFlags(AVFMT_FLAG_CUSTOM_IO);

    // For file-based IO, close the file handle via closep
    // For custom IO, the context will be freed below
    if (this.ioContext && !isCustomIO) {
      try {
        await this.ioContext.closep();
      } catch {
        // Ignore errors
      }
    }

    // Free format context
    if (this.formatContext) {
      try {
        this.formatContext.freeContext();
      } catch {
        // Ignore errors
      }
    }

    // Now free custom IO context if present
    if (this.ioContext && isCustomIO) {
      try {
        this.ioContext.freeContext();
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Close media output and free resources synchronously.
   * Synchronous version of close.
   *
   * Automatically writes trailer if header was written.
   * Closes the output file and releases all resources.
   * Safe to call multiple times.
   * Automatically called by Symbol.dispose.
   *
   * @example
   * ```typescript
   * const output = MediaOutput.openSync('output.mp4');
   * try {
   *   // Use output - trailer written automatically on close
   * } finally {
   *   output.closeSync();
   * }
   * ```
   *
   * @see {@link close} For async version
   */
  closeSync(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Free any buffered packets
    for (const streamInfo of this._streams.values()) {
      // Free any buffered packets
      for (const pkt of streamInfo.bufferedPackets) {
        pkt.free();
      }
      streamInfo.bufferedPackets = [];
    }

    // Free sync queue resources
    if (this.sqPacket) {
      this.sqPacket.free();
      this.sqPacket = undefined;
    }
    if (this.syncQueue) {
      this.syncQueue.free();
      this.syncQueue = undefined;
    }

    // Try to write trailer if header was written but trailer wasn't
    try {
      if (this.headerWritten && !this.trailerWritten) {
        this.formatContext.writeTrailerSync();
        this.trailerWritten = true;
      }
    } catch {
      // Ignore errors
    }

    // Clear pb reference first to prevent use-after-free
    if (this.ioContext) {
      this.formatContext.pb = null;
    }

    // Determine if this is custom IO before freeing format context
    const isCustomIO = this.formatContext.hasFlags(AVFMT_FLAG_CUSTOM_IO);

    // For file-based IO, close the file handle via closep
    // For custom IO, the context will be freed below
    if (this.ioContext && !isCustomIO) {
      try {
        this.ioContext.closepSync();
      } catch {
        // Ignore errors
      }
    }

    // Free format context
    if (this.formatContext) {
      try {
        this.formatContext.freeContext();
      } catch {
        // Ignore errors
      }
    }

    // Now free custom IO context if present
    if (this.ioContext && isCustomIO) {
      try {
        this.ioContext.freeContext();
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Get underlying format context.
   *
   * Returns the internal format context for advanced operations.
   *
   * @returns Format context
   *
   * @internal
   */
  getFormatContext(): FormatContext {
    return this.formatContext;
  }

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
  private setupSyncQueues(): void {
    const nbInterleaved = this._streams.size; // All streams are interleaved (no attachments)
    const nbAvEnc = Array.from(this._streams.values()).filter((s) => !s.isStreamCopy).length;

    // FFmpeg's condition: if there are streamcopy streams (nb_interleaved > nb_av_enc),
    // then ALL streams use the sync queue (but as non-limiting, so no actual sync happens)
    const needsSyncQueue = this.options.useSyncQueue && nbInterleaved > nbAvEnc;

    if (needsSyncQueue && !this.syncQueue) {
      // Create sync queue
      const bufDurationSec = this.options.syncQueueBufferDuration ?? SYNC_BUFFER_DURATION;
      const bufSizeUs = bufDurationSec * 1000000; // Convert to microseconds
      this.syncQueue = SyncQueue.create(SyncQueueType.PACKETS, bufSizeUs);
      this.sqPacket = new Packet();
      this.sqPacket.alloc();

      // Add all streams to sync queue
      // FFmpeg standard (without -shortest): limiting = 0 (non-limiting)
      // This means frames are output immediately without synchronization
      for (const streamInfo of this._streams.values()) {
        streamInfo.sqIdxMux = this.syncQueue.addStream(0); // 0 = non-limiting
      }
    } else if (!needsSyncQueue && this.syncQueue) {
      // Free sync queue if we don't need it anymore
      this.sqPacket?.free();
      this.sqPacket = undefined;
      this.syncQueue.free();
      this.syncQueue = undefined;

      // Reset all sqIdxMux to -1
      for (const streamInfo of this._streams.values()) {
        streamInfo.sqIdxMux = -1;
      }
    }
  }

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
  private async write(pkt: Packet, streamInfo: StreamDescription, streamIndex: number): Promise<void> {
    if (this.writeQueue) {
      // Use async queue for serialized writes
      await this.writeQueue.send({ pkt, streamInfo, streamIndex });
    } else {
      // Direct write without serialization
      await this.writeInternal(pkt, streamInfo, streamIndex);
    }
  }

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
  private async writeInternal(pkt: Packet, streamInfo: StreamDescription, streamIndex: number): Promise<void> {
    // Fix timestamps (rescale, DTS>PTS fix, monotonic DTS enforcement)
    this.muxFixupTs(pkt, streamInfo, streamIndex);

    // Write the packet (muxer takes ownership and will unref it)
    // NOTE: Caller must clone packet if they need to keep it (e.g., for SyncQueue)
    const ret = await this.formatContext.interleavedWriteFrame(pkt);

    // Handle write errors
    if (ret < 0 && ret !== AVERROR_EOF) {
      if (this.options.exitOnError) {
        FFmpegError.throwIfError(ret, 'Failed to write packet');
      }
    }
  }

  /**
   * Start background worker for async write queue.
   * Processes write jobs sequentially to prevent race conditions.
   *
   * @internal
   */
  private startWriteWorker(): void {
    this.writeWorkerPromise = (async () => {
      while (true) {
        const job = await this.writeQueue!.receive();
        if (!job) break; // Queue closed
        await this.writeInternal(job.pkt, job.streamInfo, job.streamIndex);
      }
    })();
  }

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
  private writeSync(pkt: Packet, streamInfo: StreamDescription, streamIndex: number): void {
    // Fix timestamps (rescale, DTS>PTS fix, monotonic DTS enforcement)
    this.muxFixupTs(pkt, streamInfo, streamIndex);

    // Write the packet (muxer takes ownership and will unref it)
    // NOTE: Caller must clone packet if they need to keep it (e.g., for SyncQueue)
    const ret = this.formatContext.interleavedWriteFrameSync(pkt);

    FFmpegError.throwIfError(ret, 'Failed to write packet');
  }

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
  private ofStreamcopy(pkt: Packet, streamInfo: StreamDescription, streamIndex: number): boolean {
    const outputStream = this.formatContext.streams[streamIndex];
    if (!outputStream) {
      return false;
    }

    // Get DTS in AV_TIME_BASE for comparison
    // Use packet DTS directly
    const dts = pkt.dts !== AV_NOPTS_VALUE ? avRescaleQ(pkt.dts, pkt.timeBase, AV_TIME_BASE_Q) : AV_NOPTS_VALUE;
    const startTimeUs = this.options.startTime !== undefined ? BigInt(Math.floor(this.options.startTime * 1000000)) : AV_NOPTS_VALUE;

    // 1. Skip non-keyframes at start
    const copyInitialNonkeyframes = this.options.copyInitialNonkeyframes ?? false;
    if (!streamInfo.streamcopyStarted && !pkt.isKeyframe && !copyInitialNonkeyframes) {
      return false; // skip packet
    }

    // 2. Copy from specific start point
    if (!streamInfo.streamcopyStarted) {
      const copyPriorStart = this.options.copyPriorStart ?? -1;

      // Calculate ts_copy_start
      // Since we don't have input file timestamps, ts_copy_start is simply startTime or 0
      const tsCopyStart = startTimeUs !== AV_NOPTS_VALUE ? startTimeUs : 0n;

      // Only check ts_copy_start if copyPriorStart is not set (0 or -1)
      if (copyPriorStart !== 1 && tsCopyStart > 0n) {
        const pktTsUs = pkt.pts !== AV_NOPTS_VALUE ? avRescaleQ(pkt.pts, pkt.timeBase, AV_TIME_BASE_Q) : dts;

        if (pktTsUs !== AV_NOPTS_VALUE && pktTsUs < tsCopyStart) {
          return false; // skip packet
        }
      }

      // 3. Skip packets before startTime
      if (startTimeUs !== AV_NOPTS_VALUE && dts !== AV_NOPTS_VALUE && dts < startTimeUs) {
        return false; // skip packet
      }
    }

    // 4. Apply start_time timestamp offset
    // FFmpeg uses: start_time = (of->start_time == AV_NOPTS_VALUE) ? 0 : of->start_time
    const startForOffset = startTimeUs !== AV_NOPTS_VALUE ? startTimeUs : 0n;
    const tsOffset = avRescaleQ(startForOffset, AV_TIME_BASE_Q, pkt.timeBase);

    if (pkt.pts !== AV_NOPTS_VALUE) {
      pkt.pts -= tsOffset;
    }

    if (pkt.dts === AV_NOPTS_VALUE) {
      // If DTS missing, use our estimated DTS
      if (dts !== AV_NOPTS_VALUE) {
        pkt.dts = avRescaleQ(dts, AV_TIME_BASE_Q, pkt.timeBase);
      }
    } else if (outputStream.codecpar.codecType === AVMEDIA_TYPE_AUDIO) {
      // Audio: PTS = DTS - ts_offset
      pkt.pts = pkt.dts - tsOffset;
    }

    if (pkt.dts !== AV_NOPTS_VALUE) {
      pkt.dts -= tsOffset;
    }

    // Mark streamcopy as started
    streamInfo.streamcopyStarted = true;

    return true; // Packet should be written
  }

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
  private muxFixupTs(pkt: Packet, streamInfo: StreamDescription, streamIndex: number): void {
    const outputStream = this.formatContext.streams[streamIndex];
    if (!outputStream) return;

    const codecType = streamInfo.stream.codecpar.codecType;
    const dstTb = outputStream.timeBase;
    // const srcTb = streamInfo.sourceTimeBase!;

    // Check if timestamps are valid before rescaling
    // FFmpeg's av_rescale_q/av_rescale_delta don't accept AV_NOPTS_VALUE
    if (pkt.dts === AV_NOPTS_VALUE && pkt.pts === AV_NOPTS_VALUE) {
      // Set packet timebase anyway for muxer
      pkt.timeBase = dstTb;
      return;
    }

    // 1. Rescale timestamps to the stream timebase
    if (codecType === AVMEDIA_TYPE_AUDIO && streamInfo.isStreamCopy) {
      let duration = avGetAudioFrameDuration2(streamInfo.stream.codecpar, pkt.size);
      if (!duration) {
        duration = streamInfo.stream.codecpar.frameSize;
      }

      const srcTb = streamInfo.sourceTimeBase!;
      const sampleRate = streamInfo.stream.codecpar.sampleRate;
      const fsTb: IRational = { num: 1, den: sampleRate };

      pkt.dts = avRescaleDelta(srcTb, pkt.dts, fsTb, duration, streamInfo.tsRescaleDeltaLast, dstTb);
      pkt.pts = pkt.dts;

      pkt.duration = avRescaleQ(pkt.duration, srcTb, dstTb);
    } else {
      // For video or encoded audio, use regular rescaling
      const srcTb = streamInfo.sourceTimeBase!;
      pkt.rescaleTs(srcTb, dstTb);
    }

    // 2. Set packet timeBase
    // av_interleaved_write_frame uses this for sorting!
    pkt.timeBase = dstTb;

    // 3. Fix DTS > PTS (invalid relationship)
    // FFmpeg formula: median of (pts, dts, last_mux_dts+1)
    if (pkt.dts !== AV_NOPTS_VALUE && pkt.pts !== AV_NOPTS_VALUE && pkt.dts > pkt.pts) {
      const last = streamInfo.lastMuxDts !== AV_NOPTS_VALUE ? streamInfo.lastMuxDts + 1n : 0n;
      const min = pkt.pts < pkt.dts ? (pkt.pts < last ? pkt.pts : last) : pkt.dts < last ? pkt.dts : last;
      const max = pkt.pts > pkt.dts ? (pkt.pts > last ? pkt.pts : last) : pkt.dts > last ? pkt.dts : last;
      const median = pkt.pts + pkt.dts + last - min - max;
      pkt.pts = median;
      pkt.dts = median;
    }

    // 4. Enforce monotonic DTS
    if ((codecType === AVMEDIA_TYPE_AUDIO || codecType === AVMEDIA_TYPE_VIDEO) && pkt.dts !== AV_NOPTS_VALUE && streamInfo.lastMuxDts !== AV_NOPTS_VALUE) {
      const max = streamInfo.lastMuxDts + 1n;
      if (pkt.dts < max) {
        // Adjust PTS if it would create invalid relationship
        if (pkt.pts !== AV_NOPTS_VALUE && pkt.pts >= pkt.dts) {
          pkt.pts = pkt.pts > max ? pkt.pts : max;
        }
        pkt.dts = max;
      }
    }

    // 5. Update last mux DTS for next packet
    streamInfo.lastMuxDts = pkt.dts;
  }

  /**
   * Copy container metadata from input to output.
   *
   * Automatically copies global metadata from input MediaInput to output format context.
   * Only copies once (on first call). Removes duration/creation_time metadata.
   *
   * @internal
   */
  private copyContainerMetadata(): void {
    if (this.containerMetadataCopied || !this.options.input) {
      return;
    }

    const mediaInput = 'input' in this.options.input ? this.options.input.input : this.options.input;
    const inputFormatContext = mediaInput.getFormatContext();
    const inputMetadata = inputFormatContext.metadata;

    if (inputMetadata) {
      // Keys that FFmpeg removes after copying
      const keysToSkip = new Set(['duration', 'creation_time', 'company_name', 'product_name', 'product_version']);

      // Get all input metadata entries
      const entries = inputMetadata.getAll();

      // Filter out keys that should be skipped
      const filteredEntries: Record<string, string> = {};
      for (const [key, value] of Object.entries(entries)) {
        if (!keysToSkip.has(key)) {
          filteredEntries[key] = value;
        }
      }

      // Create new dictionary with filtered entries
      const metadata = Dictionary.fromObject(filteredEntries);

      // Set metadata to format context
      // This will copy the dictionary content via av_dict_copy
      this.formatContext.metadata = metadata;
    }

    this.containerMetadataCopied = true;
  }

  /**
   * Auto-set DEFAULT disposition for first stream of each type.
   *
   * FFmpeg automatically sets DEFAULT flag for the first stream of each type
   * if no stream of that type has DEFAULT set yet.
   *
   * @internal
   */
  private updateDefaultDisposition(): void {
    // Group streams by media type
    const streamsByType = new Map<number, Stream[]>();

    for (const streamInfo of this._streams.values()) {
      const codecType = streamInfo.stream.codecpar.codecType;
      if (!streamsByType.has(codecType)) {
        streamsByType.set(codecType, []);
      }
      streamsByType.get(codecType)!.push(streamInfo.stream);
    }

    // For each media type, check if any stream has DEFAULT disposition
    // If not, set DEFAULT on first stream
    for (const [_, streams] of streamsByType.entries()) {
      // Skip if only one stream of this type
      if (streams.length < 2) {
        continue;
      }

      // Check if any stream already has DEFAULT disposition
      const hasDefault = streams.some((s) => s.hasDisposition(AV_DISPOSITION_DEFAULT));

      if (!hasDefault) {
        // Find first stream that is not an attached picture
        const firstNonAttachedPic = streams.find((s) => !s.hasDisposition(AV_DISPOSITION_ATTACHED_PIC));

        if (firstNonAttachedPic) {
          // Set DEFAULT on first non-attached-picture stream
          firstNonAttachedPic.setDisposition(AV_DISPOSITION_DEFAULT);
        }
      }
    }
  }

  /**
   * Dispose of media output.
   *
   * Implements AsyncDisposable interface for automatic cleanup.
   * Equivalent to calling close().
   *
   * @example
   * ```typescript
   * {
   *   await using output = await MediaOutput.open('output.mp4');
   *   // Use output...
   * } // Automatically closed
   * ```
   *
   * @see {@link close} For manual cleanup
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }

  /**
   * Dispose of media output synchronously.
   *
   * Implements Disposable interface for automatic cleanup.
   * Equivalent to calling closeSync().
   *
   * @example
   * ```typescript
   * {
   *   using output = MediaOutput.openSync('output.mp4');
   *   // Use output...
   * } // Automatically closed
   * ```
   *
   * @see {@link closeSync} For manual cleanup
   */
  [Symbol.dispose](): void {
    this.closeSync();
  }
}
