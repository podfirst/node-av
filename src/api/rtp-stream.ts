import { RtpPacket } from 'werift';

import {
  AV_CODEC_ID_AV1,
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_OPUS,
  AV_CODEC_ID_PCM_ALAW,
  AV_CODEC_ID_PCM_MULAW,
  AV_CODEC_ID_VP8,
  AV_CODEC_ID_VP9,
  AV_HWDEVICE_TYPE_NONE,
  AV_SAMPLE_FMT_S16,
} from '../constants/constants.js';
import { FF_ENCODER_LIBOPUS, FF_ENCODER_LIBX264 } from '../constants/encoders.js';
import { Decoder } from './decoder.js';
import { Encoder } from './encoder.js';
import { FilterPreset } from './filter-presets.js';
import { FilterAPI } from './filter.js';
import { HardwareContext } from './hardware.js';
import { MediaInput } from './media-input.js';
import { MediaOutput } from './media-output.js';
import { pipeline } from './pipeline.js';

import type { AVCodecID, AVHWDeviceType } from '../constants/constants.js';
import type { FFHWDeviceType } from '../constants/hardware.js';
import type { PipelineControl } from './pipeline.js';

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
   * Maximum transmission unit (MTU) size in bytes.
   * RTP packets will be fragmented to fit within this size.
   *
   * @default 1200
   */
  mtu?: number;

  /**
   * Hardware acceleration configuration.
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
   * Supported video codec IDs for transcoding decisions.
   * If not provided or empty, defaults to: H.264, H.265, VP8, VP9, AV1.
   *
   * @default [AV_CODEC_ID_H264, AV_CODEC_ID_HEVC, AV_CODEC_ID_VP8, AV_CODEC_ID_VP9, AV_CODEC_ID_AV1]
   */
  supportedVideoCodecs?: AVCodecID[];

  /**
   * Supported audio codec IDs for transcoding decisions.
   * If not provided or empty, defaults to: Opus, PCMA, PCMU.
   *
   * @default [AV_CODEC_ID_OPUS, AV_CODEC_ID_PCM_ALAW, AV_CODEC_ID_PCM_MULAW]
   */
  supportedAudioCodecs?: AVCodecID[];
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
 * @see {@link MediaInput} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export class RTPStream {
  private options: Required<RTPStreamOptions>;
  private inputUrl: string;
  private inputOptions: Record<string, string | number | boolean | null | undefined>;
  private input?: MediaInput;
  private videoOutput?: MediaOutput;
  private audioOutput?: MediaOutput;
  private hardwareContext?: HardwareContext | null;
  private videoDecoder?: Decoder;
  private videoEncoder?: Encoder;
  private audioDecoder?: Decoder;
  private audioFilter?: FilterAPI;
  private audioEncoder?: Encoder;
  private pipeline?: PipelineControl;
  private supportedVideoCodecs: Set<AVCodecID>;
  private supportedAudioCodecs: Set<AVCodecID>;

  /**
   * @param inputUrl - Media input URL
   *
   * @param options - Stream configuration options
   *
   * Use {@link create} factory method
   *
   * @internal
   */
  private constructor(inputUrl: string, options: RTPStreamOptions) {
    this.inputUrl = inputUrl;

    this.inputOptions = {
      flags: 'low_delay',
      fflags: 'nobuffer',
      analyzeduration: 0,
      probesize: 32,
      timeout: 5000000,
      rtsp_transport: inputUrl.toLowerCase().startsWith('rtsp') ? 'tcp' : undefined,
      ...options.inputOptions,
    };

    // Default supported codecs
    const defaultVideoCodecs = [AV_CODEC_ID_H264, AV_CODEC_ID_HEVC, AV_CODEC_ID_VP8, AV_CODEC_ID_VP9, AV_CODEC_ID_AV1];
    const defaultAudioCodecs = [AV_CODEC_ID_OPUS, AV_CODEC_ID_PCM_ALAW, AV_CODEC_ID_PCM_MULAW];

    this.supportedVideoCodecs = new Set(options.supportedVideoCodecs && options.supportedVideoCodecs.length > 0 ? options.supportedVideoCodecs : defaultVideoCodecs);
    this.supportedAudioCodecs = new Set(options.supportedAudioCodecs && options.supportedAudioCodecs.length > 0 ? options.supportedAudioCodecs : defaultAudioCodecs);

    this.options = {
      onVideoPacket: options.onVideoPacket ?? (() => {}),
      onAudioPacket: options.onAudioPacket ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      mtu: options.mtu ?? 1200,
      hardware: options.hardware ?? { deviceType: AV_HWDEVICE_TYPE_NONE },
      inputOptions: options.inputOptions!,
      supportedVideoCodecs: Array.from(this.supportedVideoCodecs),
      supportedAudioCodecs: Array.from(this.supportedAudioCodecs),
    };
  }

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
  static create(inputUrl: string, options: RTPStreamOptions = {}): RTPStream {
    return new RTPStream(inputUrl, options);
  }

  /**
   * Check if the stream is active.
   *
   * @returns True if the stream is active, false otherwise
   */
  get isStreamActive(): boolean {
    return this.pipeline !== undefined && !this.pipeline.isStopped();
  }

  /**
   * Get the media input instance.
   *
   * Used for accessing the underlying media input.
   * Only available after start() is called.
   *
   * @returns MediaInput instance or undefined if not started
   *
   * @internal
   */
  getInput(): MediaInput | undefined {
    return this.input;
  }

  /**
   * Ensure input is open without starting the pipeline.
   *
   * Opens the media input if not already open, allowing codec detection
   * and stream inspection before starting the actual streaming pipeline.
   *
   * @returns Promise that resolves when input is open
   *
   * @throws {Error} If no video stream found in input
   *
   * @throws {FFmpegError} If input cannot be opened
   *
   * @internal
   */
  async ensureInputOpen(): Promise<void> {
    if (this.input) {
      return;
    }

    this.input = await MediaInput.open(this.inputUrl, {
      options: this.inputOptions,
    });

    const videoStream = this.input.video();
    if (!videoStream) {
      await this.input.close();
      this.input = undefined;
      throw new Error('No video stream found in input');
    }
  }

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
  async start(): Promise<void> {
    if (this.pipeline) {
      return;
    }

    // Open input if not already open
    await this.ensureInputOpen();

    const videoStream = this.input!.video()!;
    const audioStream = this.input!.audio();

    // Check if we need hardware acceleration
    if (this.options.hardware === 'auto') {
      this.hardwareContext = HardwareContext.auto();
    } else if (this.options.hardware.deviceType !== AV_HWDEVICE_TYPE_NONE) {
      this.hardwareContext = HardwareContext.create(this.options.hardware.deviceType, this.options.hardware.device, this.options.hardware.options);
    }

    // Setup video transcoding if needed
    if (!this.isVideoCodecSupported(videoStream.codecpar.codecId)) {
      this.videoDecoder = await Decoder.create(videoStream, {
        exitOnError: false,
        hardware: this.hardwareContext,
      });

      const encoderCodec = this.hardwareContext?.getEncoderCodec('h264') ?? FF_ENCODER_LIBX264;

      const encoderOptions: Record<string, string> = {};
      if (encoderCodec === FF_ENCODER_LIBX264) {
        encoderOptions.preset = 'ultrafast';
        encoderOptions.tune = 'zerolatency';
      }

      this.videoEncoder = await Encoder.create(encoderCodec, {
        timeBase: videoStream.timeBase,
        frameRate: videoStream.avgFrameRate,
        maxBFrames: 0,
        options: encoderOptions,
      });
    }

    // Setup video output
    this.videoOutput = await MediaOutput.open(
      {
        write: (buffer: Buffer) => {
          this.options.onVideoPacket(RtpPacket.deSerialize(buffer));
          return buffer.length;
        },
      },
      {
        format: 'rtp',
        bufferSize: this.options.mtu,
        options: {
          pkt_size: this.options.mtu,
        },
      },
    );

    // Setup audio if available and needs transcoding
    if (audioStream && !this.isAudioCodecSupported(audioStream.codecpar.codecId)) {
      this.audioDecoder = await Decoder.create(audioStream, {
        exitOnError: false,
      });

      const targetSampleRate = 48000;
      const filterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_S16, targetSampleRate, 'stereo').asetnsamples(960).build();

      this.audioFilter = FilterAPI.create(filterChain, {
        timeBase: audioStream.timeBase,
      });

      this.audioEncoder = await Encoder.create(FF_ENCODER_LIBOPUS, {
        timeBase: { num: 1, den: targetSampleRate },
        options: {
          application: 'lowdelay',
          frame_duration: 20,
        },
      });
    }

    // Setup audio output if available
    if (audioStream) {
      this.audioOutput = await MediaOutput.open(
        {
          write: (buffer: Buffer) => {
            this.options.onAudioPacket(RtpPacket.deSerialize(buffer));
            return buffer.length;
          },
        },
        {
          format: 'rtp',
          bufferSize: this.options.mtu,
          options: {
            pkt_size: this.options.mtu,
          },
        },
      );
    }

    // Start pipeline in background (don't await)
    this.runPipeline()
      .then(() => {
        // Pipeline completed successfully
        this.options.onClose?.();
      })
      .catch(async (error) => {
        console.error('[RTPStream] Pipeline error:', error);
        await this.stop();
        this.options.onClose?.(error);
      });
  }

  /**
   * Run the streaming pipeline until completion or stopped.
   *
   * @internal
   */
  private async runPipeline(): Promise<void> {
    if (!this.input || !this.videoOutput) {
      return;
    }

    const hasAudio = this.input.audio() !== undefined && this.audioOutput !== undefined;

    if (hasAudio && this.audioOutput) {
      this.pipeline = pipeline(
        {
          video: this.input,
          audio: this.input,
        },
        {
          video: [this.videoDecoder, this.videoEncoder],
          audio: [this.audioDecoder, this.audioFilter, this.audioEncoder],
        },
        {
          video: this.videoOutput,
          audio: this.audioOutput,
        },
      );
    } else {
      this.pipeline = pipeline(
        {
          video: this.input,
        },
        {
          video: [this.videoDecoder, this.videoEncoder],
        },
        {
          video: this.videoOutput,
        },
      );
    }

    await this.pipeline.completion;
    this.pipeline = undefined;
  }

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
  async stop(): Promise<void> {
    // Stop pipeline if running and wait for completion
    if (this.pipeline && !this.pipeline.isStopped()) {
      this.pipeline.stop();
      await this.pipeline.completion;
      this.pipeline = undefined;
    }

    // Close all resources
    await this.videoOutput?.close();
    this.videoOutput = undefined;
    await this.audioOutput?.close();
    this.audioOutput = undefined;

    this.videoEncoder?.close();
    this.videoEncoder = undefined;
    this.videoDecoder?.close();
    this.videoDecoder = undefined;

    this.audioEncoder?.close();
    this.audioEncoder = undefined;
    this.audioFilter?.close();
    this.audioFilter = undefined;
    this.audioDecoder?.close();
    this.audioDecoder = undefined;

    this.hardwareContext?.dispose();
    this.hardwareContext = undefined;

    await this.input?.close();
    this.input = undefined;
  }

  /**
   * Check if the given audio codec is supported.
   *
   * @param codecId - The AVCodecID to check
   *
   * @returns True if the codec is supported, false otherwise
   *
   * @internal
   */
  private isAudioCodecSupported(codecId: AVCodecID): boolean {
    return this.supportedAudioCodecs.has(codecId);
  }

  /**
   * Check if the given video codec is supported.
   *
   * @param codecId - The AVCodecID to check
   *
   * @returns True if the codec is supported, false otherwise
   *
   * @internal
   */
  private isVideoCodecSupported(codecId: AVCodecID): boolean {
    return this.supportedVideoCodecs.has(codecId);
  }
}
