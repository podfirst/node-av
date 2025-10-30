import {
  AV_CODEC_ID_AAC,
  AV_CODEC_ID_AV1,
  AV_CODEC_ID_FLAC,
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_OPUS,
  AV_HWDEVICE_TYPE_NONE,
  AV_SAMPLE_FMT_FLTP,
} from '../constants/constants.js';
import { FF_ENCODER_AAC, FF_ENCODER_LIBX264 } from '../constants/encoders.js';
import { avGetCodecStringHls } from '../lib/utilities.js';
import { Decoder } from './decoder.js';
import { Encoder } from './encoder.js';
import { FilterPreset } from './filter-presets.js';
import { FilterAPI } from './filter.js';
import { HardwareContext } from './hardware.js';
import { MediaInput } from './media-input.js';
import { MediaOutput } from './media-output.js';

import type { AVCodecID, AVHWDeviceType } from '../constants/constants.js';
import type { FFHWDeviceType } from '../constants/hardware.js';
import type { IOOutputCallbacks } from './types.js';

/**
 * MP4 box information.
 */
export interface MP4Box {
  /** Four-character code identifying the box type (e.g., 'ftyp', 'moov', 'moof') */
  type: string;

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
   * Use this to send data to your client (WebSocket, HTTP, etc.).
   *
   * @param data - fMP4 data information with buffer and box details
   */
  onData?: (data: Buffer, info: FMP4Data) => void;

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
  hardware?: 'auto' | { deviceType: AVHWDeviceType | FFHWDeviceType; device?: string; options?: Record<string, string> };

  /**
   * FFmpeg input options passed directly to the input.
   *
   * @default { flags: 'low_delay' }
   */
  inputOptions?: Record<string, string | number | boolean | null | undefined>;

  /**
   * Buffer size for I/O operations in bytes.
   * Smaller values send data more frequently but with more overhead.
   * Larger values reduce overhead but increase latency.
   *
   * @default 4096
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
}

/**
 * Target codec strings for fMP4 streaming.
 */
export const FMP4_CODECS = {
  H264: 'avc1.640029',
  H265: 'hvc1.1.6.L153.B0',
  AV1: 'av01.0.00M.08',
  AAC: 'mp4a.40.2',
  FLAC: 'flac',
  OPUS: 'opus',
} as const;

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
 * const stream = await FMP4Stream.create('rtsp://camera.local/stream', {
 *   supportedCodecs,
 *   onData: (data) => ws.send(data.data)
 * });
 *
 * // Start streaming (auto-transcodes if needed)
 * await stream.start();
 * ```
 *
 * @example
 * ```typescript
 * // Stream with hardware acceleration
 * const stream = await FMP4Stream.create('input.mp4', {
 *   supportedCodecs: 'avc1.640029,mp4a.40.2',
 *   hardware: 'auto',
 *   fragDuration: 1,
 *   onData: (data) => sendToClient(data.data)
 * });
 *
 * await stream.start();
 * stream.stop();
 * stream.dispose();
 * ```
 *
 * @see {@link MediaInput} For input media handling
 * @see {@link MediaOutput} For fMP4 generation
 * @see {@link HardwareContext} For GPU acceleration
 */
export class FMP4Stream implements Disposable {
  private input: MediaInput;
  private options: Required<FMP4StreamOptions>;
  private output: MediaOutput | null = null;
  private hardwareContext: HardwareContext | null = null;
  private videoDecoder: Decoder | null = null;
  private videoEncoder: Encoder | null = null;
  private audioDecoder: Decoder | null = null;
  private audioFilter: FilterAPI | null = null;
  private audioEncoder: Encoder | null = null;
  private streamActive = false;
  private supportedCodecs: Set<string>;
  private incompleteBoxBuffer: Buffer | null = null;

  /**
   * @param input - Media input source
   *
   * @param options - Stream configuration options
   *
   * Use {@link create} factory method
   *
   * @internal
   */
  private constructor(input: MediaInput, options: FMP4StreamOptions) {
    this.input = input;
    this.options = {
      onData: options.onData ?? (() => {}),
      supportedCodecs: options.supportedCodecs ?? '',
      fragDuration: options.fragDuration ?? 1,
      hardware: options.hardware ?? { deviceType: AV_HWDEVICE_TYPE_NONE },
      inputOptions: options.inputOptions!,
      bufferSize: options.bufferSize ?? 4096,
      boxMode: options.boxMode ?? false,
    };

    // Parse supported codecs
    this.supportedCodecs = new Set(
      this.options.supportedCodecs
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    );
  }

  /**
   * Create a fMP4 stream from a media source.
   *
   * Opens the input media, detects video and audio codecs, and prepares
   * transcoding pipelines based on client-supported codecs.
   * Automatically transcodes to H.264 and AAC if necessary.
   *
   * @param inputUrl - Media source URL (RTSP, file path, HTTP, etc.)
   *
   * @param options - Stream configuration options with supported codecs
   *
   * @returns Configured fMP4 stream instance
   *
   * @throws {Error} If no video stream found in input
   *
   * @throws {FFmpegError} If input cannot be opened
   *
   * @example
   * ```typescript
   * // Stream from file with codec negotiation
   * const stream = await FMP4Stream.create('video.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2',
   *   onData: (data) => ws.send(data.data)
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Stream from RTSP with auto hardware acceleration
   * const stream = await FMP4Stream.create('rtsp://camera.local/stream', {
   *   supportedCodecs: 'avc1.640029,hvc1.1.6.L153.B0,mp4a.40.2',
   *   hardware: 'auto',
   *   fragDuration: 0.5
   * });
   * ```
   */
  static async create(inputUrl: string, options: FMP4StreamOptions = {}): Promise<FMP4Stream> {
    const isRtsp = inputUrl.toLowerCase().startsWith('rtsp');

    options.inputOptions = options.inputOptions ?? {};

    options.inputOptions = {
      flags: 'low_delay',
      rtsp_transport: isRtsp ? 'tcp' : undefined,
      ...options.inputOptions,
    };

    const input = await MediaInput.open(inputUrl, {
      options: options.inputOptions,
    });

    const videoStream = input.video();
    if (!videoStream) {
      throw new Error('No video stream found in input');
    }

    return new FMP4Stream(input, options);
  }

  /**
   * Get the codec string that will be used by client.
   *
   * Returns the MIME type codec string based on input codecs and transcoding decisions.
   * Call this after creating the stream to know what codec string to use for addSourceBuffer().
   *
   * @returns MIME type codec string (e.g., "avc1.640029,mp4a.40.2")
   *
   * @example
   * ```typescript
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2'
   * });
   *
   * const codecString = stream.getCodecString();
   * console.log(codecString); // "avc1.640029,mp4a.40.2"
   * // Use this for: sourceBuffer = mediaSource.addSourceBuffer(`video/mp4; codecs="${codecString}"`);
   * ```
   */
  getCodecString(): string {
    const videoStream = this.input.video()!;
    const audioStream = this.input.audio();

    const videoCodecId = videoStream.codecpar.codecId;
    const audioCodecId = audioStream?.codecpar.codecId;

    // Determine video codec string
    let videoCodec: string;
    const needsVideoTranscode = !this.isVideoCodecSupported(videoCodecId);

    if (needsVideoTranscode) {
      // Transcoding to H.264
      videoCodec = FMP4_CODECS.H264;
    } else if (videoCodecId === AV_CODEC_ID_H264) {
      // H.264 - use HLS codec string from input
      const hlsCodec = avGetCodecStringHls(videoStream.codecpar);
      videoCodec = hlsCodec ?? FMP4_CODECS.H264;
    } else if (videoCodecId === AV_CODEC_ID_HEVC) {
      // H.265 - use HLS codec string from input
      const hlsCodec = avGetCodecStringHls(videoStream.codecpar);
      videoCodec = hlsCodec ?? FMP4_CODECS.H265;
    } else if (videoCodecId === AV_CODEC_ID_AV1) {
      // AV1 - use HLS codec string from input
      const hlsCodec = avGetCodecStringHls(videoStream.codecpar);
      videoCodec = hlsCodec ?? FMP4_CODECS.AV1;
    } else {
      // Fallback to H.264 (should not happen as we transcode unsupported codecs)
      videoCodec = FMP4_CODECS.H264;
    }

    // Determine audio codec string
    let audioCodec: string | null = null;
    if (audioCodecId) {
      const needsAudioTranscode = !this.isAudioCodecSupported(audioCodecId);

      if (needsAudioTranscode) {
        // Transcoding to AAC
        audioCodec = FMP4_CODECS.AAC;
      } else if (audioCodecId === AV_CODEC_ID_AAC) {
        // AAC - use fixed codec string
        audioCodec = FMP4_CODECS.AAC;
      } else if (audioCodecId === AV_CODEC_ID_FLAC) {
        // FLAC
        audioCodec = FMP4_CODECS.FLAC;
      } else if (audioCodecId === AV_CODEC_ID_OPUS) {
        // Opus
        audioCodec = FMP4_CODECS.OPUS;
      } else {
        // Fallback to AAC (should not happen as we transcode unsupported codecs)
        audioCodec = FMP4_CODECS.AAC;
      }
    }

    // Combine video and audio codec strings
    return audioCodec ? `${videoCodec},${audioCodec}` : videoCodec;
  }

  /**
   * Get the resolution of the input video stream.
   *
   * @returns Object with width and height properties
   *
   * @example
   * ```typescript
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2'
   * });
   *
   * const resolution = stream.getResolution();
   * console.log(`Width: ${resolution.width}, Height: ${resolution.height}`);
   * ```
   */
  getResolution(): { width: number; height: number } {
    const videoStream = this.input.video()!;
    return {
      width: videoStream.codecpar.width,
      height: videoStream.codecpar.height,
    };
  }

  /**
   * Start streaming media to fMP4 chunks.
   *
   * Begins the media processing pipeline, reading packets from input,
   * transcoding based on supported codecs, and generating fMP4 chunks.
   * Video transcodes to H.264 if H.264/H.265 not supported.
   * Audio transcodes to AAC if AAC/FLAC/Opus not supported.
   * This method blocks until streaming completes or {@link stop} is called.
   *
   * @returns Promise that resolves when streaming completes
   *
   * @throws {FFmpegError} If transcoding or muxing fails
   *
   * @example
   * ```typescript
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2',
   *   onData: (data) => sendToClient(data.data)
   * });
   *
   * // Start streaming (blocks until complete)
   * await stream.start();
   * ```
   *
   * @example
   * ```typescript
   * // Non-blocking start with background promise
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2'
   * });
   * const streamPromise = stream.start();
   *
   * // Later: stop streaming
   * stream.stop();
   * await streamPromise;
   * ```
   */
  async start(): Promise<void> {
    if (this.streamActive) {
      return;
    }

    this.streamActive = true;

    const videoStream = this.input.video()!;
    const audioStream = this.input.audio();

    // Check if we need hardware acceleration
    if (this.options.hardware === 'auto') {
      this.hardwareContext = HardwareContext.auto();
    } else if (this.options.hardware.deviceType !== AV_HWDEVICE_TYPE_NONE) {
      this.hardwareContext = HardwareContext.create(this.options.hardware.deviceType, this.options.hardware.device, this.options.hardware.options);
    }

    // Check if video needs transcoding
    const needsVideoTranscode = !this.isVideoCodecSupported(videoStream.codecpar.codecId);

    if (needsVideoTranscode) {
      // Transcode to H.264
      this.videoDecoder = await Decoder.create(videoStream, {
        hardware: this.hardwareContext ?? undefined,
        exitOnError: false,
      });

      this.videoEncoder = await Encoder.create(FF_ENCODER_LIBX264, {
        timeBase: videoStream.timeBase,
        frameRate: videoStream.avgFrameRate,
        maxBFrames: 0,
      });
    }

    // Check if audio needs transcoding
    const needsAudioTranscode = audioStream && !this.isAudioCodecSupported(audioStream.codecpar.codecId);

    if (needsAudioTranscode) {
      // Transcode to AAC
      this.audioDecoder = await Decoder.create(audioStream, {
        exitOnError: false,
      });

      const targetSampleRate = 48000;
      const filterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_FLTP, targetSampleRate, 'stereo').asetnsamples(1024).build();

      this.audioFilter = FilterAPI.create(filterChain, {
        timeBase: audioStream.timeBase,
      });

      this.audioEncoder = await Encoder.create(FF_ENCODER_AAC, {
        timeBase: { num: 1, den: targetSampleRate },
      });
    }

    // Setup output with callback
    const cb: IOOutputCallbacks = {
      write: (buffer: Buffer) => {
        if (this.options.boxMode) {
          // Box mode: buffer until we have complete boxes
          this.processBoxMode(buffer);
        } else {
          // Chunk mode: send raw data immediately
          this.options.onData(buffer, {
            isComplete: false,
            boxes: [],
          });
        }
        return buffer.length;
      },
    };

    this.output = await MediaOutput.open(cb, {
      format: 'mp4',
      bufferSize: this.options.bufferSize,
      options: {
        movflags: '+frag_keyframe+separate_moof+default_base_moof+empty_moov',
        frag_duration: this.options.fragDuration,
      },
    });

    // Add streams to output
    const videoStreamIndex = this.videoEncoder ? this.output.addStream(this.videoEncoder) : this.output.addStream(videoStream);
    const audioStreamIndex = this.audioEncoder ? this.output.addStream(this.audioEncoder) : audioStream ? this.output.addStream(audioStream) : null;

    const hasAudio = audioStreamIndex !== null && audioStream !== undefined;

    // Start processing loop
    for await (using packet of this.input.packets()) {
      if (!this.streamActive) {
        break;
      }

      if (packet.streamIndex === videoStream.index) {
        if (this.videoDecoder && this.videoEncoder) {
          // Transcode video
          using decodedFrame = await this.videoDecoder.decode(packet);
          if (!decodedFrame) {
            continue;
          }

          using encodedPacket = await this.videoEncoder.encode(decodedFrame);
          if (!encodedPacket) {
            continue;
          }

          await this.output.writePacket(encodedPacket, videoStreamIndex);
        } else {
          // Stream copy video
          await this.output.writePacket(packet, videoStreamIndex);
        }
      } else if (hasAudio && packet.streamIndex === audioStream.index) {
        if (this.audioDecoder && this.audioFilter && this.audioEncoder) {
          // Transcode audio
          using decodedFrame = await this.audioDecoder.decode(packet);
          if (!decodedFrame) {
            continue;
          }

          using filteredFrame = await this.audioFilter.process(decodedFrame);
          if (!filteredFrame) {
            continue;
          }

          using encodedPacket = await this.audioEncoder.encode(filteredFrame);
          if (!encodedPacket) {
            continue;
          }

          await this.output.writePacket(encodedPacket, audioStreamIndex);
        } else {
          // Stream copy audio
          await this.output.writePacket(packet, audioStreamIndex);
        }
      }
    }

    // Flush pipelines
    await Promise.allSettled([this.flushVideo(videoStreamIndex), this.flushAudio(audioStreamIndex)]);

    // Close output - remaining data will be written via callback
    await this.output.close();
  }

  /**
   * Stop streaming gracefully.
   *
   * Signals the streaming loop to exit after the current packet is processed.
   * Does not immediately close resources - use {@link dispose} for cleanup.
   * Safe to call multiple times.
   *
   * @example
   * ```typescript
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2'
   * });
   * const streamPromise = stream.start();
   *
   * // Stop after 10 seconds
   * setTimeout(() => stream.stop(), 10000);
   *
   * await streamPromise; // Resolves when stopped
   * stream.dispose();
   * ```
   */
  stop(): void {
    this.streamActive = false;
  }

  /**
   * Clean up all resources and close the stream.
   *
   * Stops streaming if active and releases all FFmpeg resources including
   * decoders, encoders, filters, output, and input. Should be called when
   * done with the stream to prevent memory leaks.
   * Safe to call multiple times.
   *
   * @example
   * ```typescript
   * const stream = await FMP4Stream.create('input.mp4', {
   *   supportedCodecs: 'avc1.640029,mp4a.40.2'
   * });
   * await stream.start();
   * stream.dispose();
   * ```
   *
   * @example
   * ```typescript
   * // Using automatic cleanup
   * {
   *   await using stream = await FMP4Stream.create('input.mp4', {
   *     supportedCodecs: 'avc1.640029,mp4a.40.2'
   *   });
   *   await stream.start();
   * } // Automatically disposed
   * ```
   */
  dispose(): void {
    this.stop();
    this.output?.close();
    this.videoDecoder?.close();
    this.videoEncoder?.close();
    this.audioDecoder?.close();
    this.audioFilter?.close();
    this.audioEncoder?.close();
    this.hardwareContext?.dispose();
    this.hardwareContext = null;
    this.input.close();
  }

  /**
   * Check if video codec is supported.
   *
   * @param codecId - Codec ID
   *
   * @returns True if H.264, H.265, or AV1 is in supported codecs
   *
   * @internal
   */
  private isVideoCodecSupported(codecId: AVCodecID): boolean {
    if (codecId === AV_CODEC_ID_H264 && (this.supportedCodecs.has(FMP4_CODECS.H264) || this.supportedCodecs.has('avc1'))) {
      return true;
    }

    if (codecId === AV_CODEC_ID_HEVC && (this.supportedCodecs.has(FMP4_CODECS.H265) || this.supportedCodecs.has('hvc1') || this.supportedCodecs.has('hev1'))) {
      return true;
    }

    if (codecId === AV_CODEC_ID_AV1 && (this.supportedCodecs.has(FMP4_CODECS.AV1) || this.supportedCodecs.has('av01'))) {
      return true;
    }

    return false;
  }

  /**
   * Check if audio codec is supported.
   *
   * @param codecId - Codec ID
   *
   * @returns True if AAC, FLAC, or Opus is in supported codecs
   *
   * @internal
   */
  private isAudioCodecSupported(codecId: AVCodecID): boolean {
    if (codecId === AV_CODEC_ID_AAC && (this.supportedCodecs.has(FMP4_CODECS.AAC) || this.supportedCodecs.has('mp4a'))) {
      return true;
    }

    if (codecId === AV_CODEC_ID_FLAC && this.supportedCodecs.has(FMP4_CODECS.FLAC)) {
      return true;
    }

    if (codecId === AV_CODEC_ID_OPUS && this.supportedCodecs.has(FMP4_CODECS.OPUS)) {
      return true;
    }

    return false;
  }

  /**
   * Process buffer in box mode - buffers until complete boxes are available.
   *
   * @param chunk - Incoming data chunk from FFmpeg
   *
   * @internal
   */
  private processBoxMode(chunk: Buffer): void {
    // If we have an incomplete box from previous chunk, append to it
    if (this.incompleteBoxBuffer) {
      chunk = Buffer.concat([this.incompleteBoxBuffer, chunk]);
      this.incompleteBoxBuffer = null;
    }

    let offset = 0;
    const boxes: MP4Box[] = [];

    while (offset + 8 <= chunk.length) {
      // Read box header
      const boxSize = chunk.readUInt32BE(offset);
      const boxType = chunk.toString('ascii', offset + 4, offset + 8);

      // Check if we have the complete box
      if (offset + boxSize > chunk.length) {
        // Box is incomplete - save for next chunk
        this.incompleteBoxBuffer = chunk.subarray(offset);
        break;
      }

      // We have the complete box - parse it
      const box: MP4Box = {
        type: boxType,
        size: boxSize,
        data: chunk.subarray(offset + 8, offset + boxSize),
        offset: offset,
      };
      boxes.push(box);

      // Move to next box
      offset += boxSize;

      // Safety check: invalid box size
      if (boxSize < 8) {
        break;
      }
    }

    // If we have complete boxes, send them to the callback
    if (boxes.length > 0) {
      this.options.onData(chunk.subarray(0, offset), {
        isComplete: true,
        boxes,
      });
    }
  }

  /**
   * Flush video encoder pipeline.
   *
   * @param videoStreamIndex - Output video stream index
   *
   * @internal
   */
  private async flushVideo(videoStreamIndex: number): Promise<void> {
    if (!this.videoDecoder || !this.videoEncoder || !this.output) {
      return;
    }

    for await (using frame of this.videoDecoder.flushFrames()) {
      using encodedPacket = await this.videoEncoder.encode(frame);
      if (encodedPacket) {
        await this.output.writePacket(encodedPacket, videoStreamIndex);
      }
    }

    for await (using packet of this.videoEncoder.flushPackets()) {
      await this.output.writePacket(packet, videoStreamIndex);
    }
  }

  /**
   * Flush audio encoder pipeline.
   *
   * @param audioStreamIndex - Output audio stream index
   *
   * @internal
   */
  private async flushAudio(audioStreamIndex: number | null): Promise<void> {
    if (!this.audioDecoder || !this.audioFilter || !this.audioEncoder || audioStreamIndex === null || !this.output) {
      return;
    }

    for await (using frame of this.audioDecoder.flushFrames()) {
      using filteredFrame = await this.audioFilter.process(frame);
      if (!filteredFrame) {
        continue;
      }

      using encodedPacket = await this.audioEncoder.encode(filteredFrame);
      if (encodedPacket) {
        await this.output.writePacket(encodedPacket, audioStreamIndex);
      }
    }

    for await (using frame of this.audioFilter.flushFrames()) {
      using encodedPacket = await this.audioEncoder.encode(frame);
      if (encodedPacket) {
        await this.output.writePacket(encodedPacket, audioStreamIndex);
      }
    }

    for await (using packet of this.audioEncoder.flushPackets()) {
      await this.output.writePacket(packet, audioStreamIndex);
    }
  }

  /**
   * Symbol.dispose implementation for automatic cleanup.
   *
   * @internal
   */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
