import { isRtcp, RtpPacket } from 'werift';

import { AV_HWDEVICE_TYPE_NONE } from '../constants/constants.js';
import { FF_ENCODER_LIBOPUS, FF_ENCODER_LIBX264, FF_ENCODER_LIBX265, type FFAudioEncoder, type FFVideoEncoder } from '../constants/encoders.js';
import { Codec } from '../lib/codec.js';
import { Decoder } from './decoder.js';
import { Encoder } from './encoder.js';
import { FilterPreset } from './filter-presets.js';
import { FilterAPI } from './filter.js';
import { HardwareContext } from './hardware.js';
import { MediaInput } from './media-input.js';
import { MediaOutput } from './media-output.js';
import { pipeline } from './pipeline.js';

import type { AVCodecID, AVHWDeviceType, AVSampleFormat } from '../constants/constants.js';
import type { FFHWDeviceType } from '../constants/hardware.js';
import type { PipelineControl } from './pipeline.js';
import type { EncoderOptions, MediaInputOptions } from './types.js';

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
  hardware?: 'auto' | { deviceType: AVHWDeviceType | FFHWDeviceType; device?: string; options?: Record<string, string> };

  /**
   * Input media options passed to MediaInput.
   */
  inputOptions?: MediaInputOptions;

  /**
   * Video stream configuration.
   */
  video?: {
    ssrc?: number;
    payloadType?: number;
    mtu?: number;
    fps?: number;
    encoderOptions?: EncoderOptions['options'];
  };

  /**
   * Audio stream configuration.
   */
  audio?: {
    ssrc?: number;
    payloadType?: number;
    mtu?: number;
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
 * @see {@link MediaInput} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export class RTPStream {
  private options: Required<RTPStreamOptions>;
  private inputUrl: string;
  private inputOptions: MediaInputOptions;
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
  private supportedVideoCodecs: Set<AVCodecID | FFVideoEncoder>;
  private supportedAudioCodecs: Set<AVCodecID | FFAudioEncoder>;

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
      ...options.inputOptions,
      options: {
        flags: 'low_delay',
        fflags: 'nobuffer',
        analyzeduration: 0,
        probesize: 32,
        timeout: 5000000,
        rtsp_transport: inputUrl.toLowerCase().startsWith('rtsp') ? 'tcp' : undefined,
        ...options.inputOptions?.options,
      },
    };

    options.supportedVideoCodecs = options.supportedVideoCodecs?.filter(Boolean);
    options.supportedAudioCodecs = options.supportedAudioCodecs?.filter(Boolean);

    // If no supported codecs specified, empty set means ALL codecs are supported (passthrough only)
    this.supportedVideoCodecs = new Set(options.supportedVideoCodecs && options.supportedVideoCodecs.length > 0 ? options.supportedVideoCodecs : []);
    this.supportedAudioCodecs = new Set(options.supportedAudioCodecs && options.supportedAudioCodecs.length > 0 ? options.supportedAudioCodecs : []);

    this.options = {
      onVideoPacket: options.onVideoPacket ?? (() => {}),
      onAudioPacket: options.onAudioPacket ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      supportedVideoCodecs: Array.from(this.supportedVideoCodecs),
      supportedAudioCodecs: Array.from(this.supportedAudioCodecs),
      hardware: options.hardware ?? { deviceType: AV_HWDEVICE_TYPE_NONE },
      inputOptions: options.inputOptions!,
      video: {
        ssrc: options.video?.ssrc,
        payloadType: options.video?.payloadType,
        mtu: options.video?.mtu ?? 1200,
        fps: options.video?.fps ?? 20,
        encoderOptions: options.video?.encoderOptions ?? {},
      },
      audio: {
        ssrc: options.audio?.ssrc,
        payloadType: options.audio?.payloadType,
        mtu: options.audio?.mtu ?? 1200,
        sampleRate: options.audio?.sampleRate,
        channels: options.audio?.channels,
        encoderOptions: options.audio?.encoderOptions,
      },
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

    if (!this.input) {
      this.input = await MediaInput.open(this.inputUrl, this.inputOptions);

      const videoStream = this.input.video();
      if (!videoStream) {
        await this.input.close();
        this.input = undefined;
        throw new Error('No video stream found in input');
      }
    }

    const videoStream = this.input.video()!;
    const audioStream = this.input.audio();

    // Setup video transcoding if needed
    if (!this.isVideoCodecSupported(videoStream.codecpar.codecId)) {
      // Check if we need hardware acceleration
      if (this.options.hardware === 'auto') {
        this.hardwareContext = HardwareContext.auto();
      } else if (this.options.hardware.deviceType !== AV_HWDEVICE_TYPE_NONE) {
        this.hardwareContext = HardwareContext.create(this.options.hardware.deviceType, this.options.hardware.device, this.options.hardware.options);
      }

      this.videoDecoder = await Decoder.create(videoStream, {
        exitOnError: false,
        hardware: this.hardwareContext,
      });

      // Get first supported codec
      const targetCodecId = this.options.supportedVideoCodecs[0];
      if (!targetCodecId) {
        throw new Error('No supported video codec specified for transcoding');
      }

      let encoderCodec: Codec | null = null;
      if (typeof targetCodecId === 'string') {
        encoderCodec = Codec.findEncoderByName(targetCodecId);
      } else {
        encoderCodec = this.hardwareContext?.getEncoderCodec(targetCodecId) ?? Codec.findEncoder(targetCodecId);
      }

      if (!encoderCodec) {
        throw new Error(`No encoder found for codec ID ${targetCodecId}`);
      }

      let encoderOptions: EncoderOptions['options'] = {};
      if (encoderCodec.name === FF_ENCODER_LIBX264 || encoderCodec.name === FF_ENCODER_LIBX265) {
        encoderOptions.preset = 'ultrafast';
        encoderOptions.tune = 'zerolatency';
      }

      encoderOptions = {
        ...encoderOptions,
        ...this.options.video.encoderOptions,
      };

      this.videoEncoder = await Encoder.create(encoderCodec, {
        timeBase: videoStream.timeBase,
        frameRate: videoStream.avgFrameRate,
        maxBFrames: 0,
        options: encoderOptions,
      });
    }

    // Initialize RTP sequence numbers and timestamps
    let videoSequenceNumber = Math.floor(Math.random() * 0xffff);
    let videoTimestamp = Math.floor(Math.random() * 0xffffffff) >>> 0; // unsigned 32-bit
    let audioSequenceNumber = Math.floor(Math.random() * 0xffff);

    // Calculate video timestamp increment
    let fps = this.options.video.fps ?? videoStream.avgFrameRate.num / videoStream.avgFrameRate.den;
    if (!isFinite(fps) || fps <= 0 || isNaN(fps)) {
      fps = 20; // Default to 20 FPS if invalid
    }

    const videoTimestampIncrement = 90000 / fps;

    // Setup video output
    this.videoOutput = await MediaOutput.open(
      {
        write: (buffer: Buffer) => {
          if (isRtcp(buffer)) {
            // Ignore RTCP packets
            return buffer.length;
          }

          const rtpPacket = RtpPacket.deSerialize(buffer);

          // Set SSRC (synchronization source identifier)
          if (this.options.video.ssrc !== undefined) {
            rtpPacket.header.ssrc = this.options.video.ssrc;
          }

          // Set payload type
          if (this.options.video.payloadType !== undefined) {
            rtpPacket.header.payloadType = this.options.video.payloadType;
          }

          // Fix sequence number - ensure continuous sequence
          rtpPacket.header.sequenceNumber = videoSequenceNumber;
          videoSequenceNumber = (videoSequenceNumber + 1) & 0xffff; // Wrap at 16-bit

          // Fix timestamp - calculate based on FPS
          // All packets in same frame have same timestamp (marker=false)
          // Only increment timestamp when frame ends (marker=true)
          rtpPacket.header.timestamp = videoTimestamp;

          // Increment timestamp for next frame when current frame ends
          if (rtpPacket.header.marker) {
            videoTimestamp = (videoTimestamp + videoTimestampIncrement) >>> 0; // Unsigned 32-bit wrap
          }

          this.options.onVideoPacket(rtpPacket);
          return buffer.length;
        },
      },
      {
        format: 'rtp',
        bufferSize: this.options.video.mtu,
        options: {
          pkt_size: this.options.video.mtu,
        },
      },
    );

    // Setup audio if available and needs transcoding
    if (audioStream && !this.isAudioCodecSupported(audioStream.codecpar.codecId)) {
      this.audioDecoder = await Decoder.create(audioStream, {
        exitOnError: false,
      });

      // Get first supported audio codec
      const targetCodecId = this.options.supportedAudioCodecs[0];
      if (!targetCodecId) {
        throw new Error('No supported audio codec specified for transcoding');
      }

      let encoderCodec: Codec | null = null;
      if (typeof targetCodecId === 'string') {
        encoderCodec = Codec.findEncoderByName(targetCodecId);
      } else {
        encoderCodec = Codec.findEncoder(targetCodecId);
      }

      if (!encoderCodec) {
        throw new Error(`No encoder found for codec ID ${targetCodecId}`);
      }

      // Determine target audio parameters from options
      const desiredSampleFormat = audioStream.codecpar.format as AVSampleFormat;
      const desiredSampleRate = this.options.audio?.sampleRate ?? (audioStream.codecpar.sampleRate > 0 ? audioStream.codecpar.sampleRate : 48000);
      const desiredChannels = this.options.audio?.channels ?? (audioStream.codecpar.channels > 0 ? audioStream.codecpar.channels : 2);

      // Select best supported parameters from codec
      const targetSampleFormat = this.selectSampleFormat(encoderCodec, desiredSampleFormat);
      const targetSampleRate = this.selectSampleRate(encoderCodec, desiredSampleRate);
      const channelLayoutStr = this.selectChannelLayout(encoderCodec, desiredChannels);

      // Create audio filter for resampling
      const filterChain = FilterPreset.chain().aformat(targetSampleFormat, targetSampleRate, channelLayoutStr).build();

      this.audioFilter = FilterAPI.create(filterChain, {
        timeBase: audioStream.timeBase,
      });

      let encoderOptions: EncoderOptions['options'] = {};
      if (encoderCodec.name === FF_ENCODER_LIBOPUS) {
        encoderOptions.application = 'lowdelay';
        encoderOptions.frame_duration = 20;
      }

      encoderOptions = {
        ...encoderOptions,
        ...this.options.audio.encoderOptions,
      };

      this.audioEncoder = await Encoder.create(encoderCodec, {
        timeBase: { num: 1, den: targetSampleRate },
        options: encoderOptions,
      });
    }

    // Setup audio output if available
    if (audioStream) {
      this.audioOutput = await MediaOutput.open(
        {
          write: (buffer: Buffer) => {
            if (isRtcp(buffer)) {
              // Ignore RTCP packets
              return buffer.length;
            }

            const rtpPacket = RtpPacket.deSerialize(buffer);

            // Set SSRC (synchronization source identifier)
            if (this.options.audio.ssrc !== undefined) {
              rtpPacket.header.ssrc = this.options.audio.ssrc;
            }

            // Set payload type
            if (this.options.audio.payloadType !== undefined) {
              rtpPacket.header.payloadType = this.options.audio.payloadType;
            }

            // Fix sequence number - ensure continuous sequence
            rtpPacket.header.sequenceNumber = audioSequenceNumber;
            audioSequenceNumber = (audioSequenceNumber + 1) & 0xffff; // Wrap at 16-bit

            this.options.onAudioPacket(rtpPacket);
            return buffer.length;
          },
        },
        {
          format: 'rtp',
          bufferSize: this.options.audio.mtu,
          options: {
            pkt_size: this.options.audio.mtu,
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
    // Empty set means all codecs are supported (passthrough only)
    if (this.supportedAudioCodecs.size === 0) {
      return true;
    }

    const isSupported = this.supportedAudioCodecs.has(codecId);

    if (!isSupported) {
      try {
        const ffEncoderCodecs = Array.from(this.supportedAudioCodecs).filter((c) => typeof c === 'string');
        for (const encoderName of ffEncoderCodecs) {
          const encoderCodec = Codec.findEncoderByName(encoderName);
          if (encoderCodec?.id === codecId) {
            return true;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return isSupported;
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
    // Empty set means all codecs are supported (passthrough only)
    if (this.supportedVideoCodecs.size === 0) {
      return true;
    }

    const isSupported = this.supportedVideoCodecs.has(codecId);

    if (!isSupported) {
      try {
        const ffEncoderCodecs = Array.from(this.supportedVideoCodecs).filter((c) => typeof c === 'string');
        for (const encoderName of ffEncoderCodecs) {
          const encoderCodec = Codec.findEncoderByName(encoderName);
          if (encoderCodec?.id === codecId) {
            return true;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    return isSupported;
  }

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
  private selectSampleFormat(codec: Codec, desiredFormat: AVSampleFormat): AVSampleFormat {
    const supportedFormats = codec.sampleFormats;
    if (!supportedFormats || supportedFormats.length === 0) {
      return desiredFormat; // should normally not happen
    }

    if (supportedFormats.includes(desiredFormat)) {
      return desiredFormat;
    }

    return supportedFormats[0];
  }

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
  private selectSampleRate(codec: Codec, desiredRate: number): number {
    const supportedRates = codec.supportedSamplerates;
    if (!supportedRates || supportedRates.length === 0) {
      return desiredRate; // should normally not happen
    }

    let bestSampleRate = supportedRates[0];
    for (const rate of supportedRates) {
      if (Math.abs(desiredRate - rate) < Math.abs(desiredRate - bestSampleRate)) {
        bestSampleRate = rate;
      }
    }
    return bestSampleRate;
  }

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
  private selectChannelLayout(codec: Codec, desiredChannels: number): string {
    const supportedLayouts = codec.channelLayouts;
    if (!supportedLayouts || supportedLayouts.length === 0) {
      return desiredChannels === 1 ? 'mono' : 'stereo'; // should normally not happen
    }

    // Try to find exact match
    for (const layout of supportedLayouts) {
      if (layout.nbChannels === desiredChannels) {
        // Use standard names for common layouts
        if (desiredChannels === 1) return 'mono';
        if (desiredChannels === 2) return 'stereo';
        // For other channel counts, use the mask
        return layout.mask.toString();
      }
    }

    // No exact match, return first supported
    const firstLayout = supportedLayouts[0];
    if (firstLayout.nbChannels === 1) return 'mono';
    if (firstLayout.nbChannels === 2) return 'stereo';
    return firstLayout.mask.toString();
  }
}
