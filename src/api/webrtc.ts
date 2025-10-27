import { MediaStreamTrack, RTCIceCandidate, RTCPeerConnection, RTCRtpCodecParameters, RTCSessionDescription, RtpPacket } from 'werift';

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

import type { AVCodecID, AVHWDeviceType } from '../constants/constants.js';

/**
 * Codec information for WebRTC streaming.
 *
 * Contains RTP codec parameters and FFmpeg codec IDs for video and audio streams.
 * Used for codec negotiation in WebRTC peer connections.
 */
export interface WebRTCCodecInfo {
  /**
   * Video codec configuration.
   * Combines RTP parameters (mimeType, clockRate, etc.) with FFmpeg codec ID.
   */
  video: Partial<RTCRtpCodecParameters> & {
    codecId: AVCodecID;
  };

  /**
   * Optional audio codec configuration.
   * Combines RTP parameters (mimeType, clockRate, channels) with FFmpeg codec ID.
   */
  audio?: Partial<RTCRtpCodecParameters> & {
    codecId: AVCodecID;
  };
}

/**
 * Options for configuring WebRTC streaming.
 */
export interface WebRTCStreamOptions {
  /**
   * Callback invoked for each video RTP packet.
   * Use this to send packets to your WebRTC implementation.
   *
   * @param packet - Serialized RTP packet ready for transmission
   */
  onVideoPacket?: (packet: RtpPacket) => void;

  /**
   * Callback invoked for each audio RTP packet.
   * Use this to send packets to your WebRTC implementation.
   *
   * @param packet - Serialized RTP packet ready for transmission
   */
  onAudioPacket?: (packet: RtpPacket) => void;

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
  hardware?: 'auto' | { deviceType: AVHWDeviceType; device?: string; options?: Record<string, string> };

  /**
   * FFmpeg input options passed directly to the input.
   *
   * @default { flags: 'low_delay' }
   */
  inputOptions?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * High-level WebRTC streaming with automatic codec detection and transcoding.
 *
 * Provides library-agnostic RTP streaming for WebRTC applications.
 * Automatically detects input codecs and transcodes non-WebRTC-compatible formats.
 * Handles video (H.264, H.265, VP8, VP9) and audio (Opus, PCMA, PCMU) codecs.
 * Supports hardware acceleration for video transcoding.
 * Essential component for building WebRTC streaming servers without direct WebRTC library coupling.
 *
 * @example
 * ```typescript
 * import { WebRTCStream } from 'node-av/api';
 *
 * // Create stream with RTP packet callbacks
 * const stream = await WebRTCStream.create('rtsp://camera.local/stream', {
 *   mtu: 1200,
 *   hardware: 'auto',
 *   onVideoPacket: (rtp) => {
 *     // Send RTP packet to WebRTC peer connection
 *     videoTrack.writeRtp(rtp);
 *   },
 *   onAudioPacket: (rtp) => {
 *     audioTrack.writeRtp(rtp);
 *   }
 * });
 *
 * // Get detected codecs for SDP negotiation
 * const codecs = stream.getCodecs();
 * console.log('Video:', codecs.video.mimeType);
 * console.log('Audio:', codecs.audio?.mimeType);
 *
 * // Start streaming
 * await stream.start();
 * ```
 *
 * @example
 * ```typescript
 * // Stream with hardware acceleration
 * import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';
 *
 * const stream = await WebRTCStream.create('video.mp4', {
 *   hardware: {
 *     deviceType: AV_HWDEVICE_TYPE_CUDA,
 *     device: '/dev/nvidia0'
 *   },
 *   onVideoPacket: (rtp) => sendToWebRTC(rtp)
 * });
 *
 * await stream.start();
 * stream.stop();
 * stream.dispose();
 * ```
 *
 * @see {@link WebRTCSession} For complete WebRTC session management with werift
 * @see {@link MediaInput} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export class WebRTCStream implements Disposable {
  public readonly input: MediaInput;

  private codecInfo: WebRTCCodecInfo;
  private options: Required<WebRTCStreamOptions>;
  private videoOutput: MediaOutput | null = null;
  private audioOutput: MediaOutput | null = null;
  private hardwareContext: HardwareContext | null = null;
  private videoDecoder: Decoder | null = null;
  private videoEncoder: Encoder | null = null;
  private audioDecoder: Decoder | null = null;
  private audioFilter: FilterAPI | null = null;
  private audioEncoder: Encoder | null = null;
  private streamActive = false;

  /**
   * @param input - Media input source
   *
   * @param options - Stream configuration options
   *
   * Use {@link create} factory method
   *
   * @internal
   */
  private constructor(input: MediaInput, options: WebRTCStreamOptions) {
    this.input = input;

    const videoStream = input.video()!;
    const audioStream = input.audio();
    const videoCodecId = videoStream.codecpar.codecId;
    const audioCodecId = audioStream?.codecpar.codecId ?? null;
    const videoConfig = this.getVideoCodecConfig(videoCodecId) ?? this.getVideoCodecConfig(AV_CODEC_ID_H264)!; // We transcode unsupported codecs to H264

    this.codecInfo = {
      video: {
        codecId: videoCodecId,
        ...videoConfig,
      },
    };

    if (audioCodecId !== null) {
      const audioConfig = this.getAudioCodecConfig(audioCodecId) ?? this.getAudioCodecConfig(AV_CODEC_ID_OPUS)!; // We transcode unsupported codecs to OPUS
      this.codecInfo.audio = {
        codecId: audioCodecId,
        ...audioConfig,
      };
    }

    this.options = {
      onVideoPacket: options.onVideoPacket ?? (() => {}),
      onAudioPacket: options.onAudioPacket ?? (() => {}),
      mtu: options.mtu ?? 1200,
      hardware: options.hardware ?? { deviceType: AV_HWDEVICE_TYPE_NONE },
      inputOptions: options.inputOptions!,
    };
  }

  /**
   * Create a WebRTC stream from a media source.
   *
   * Opens the input media, detects video and audio codecs, and prepares
   * transcoding pipelines for non-WebRTC-compatible formats.
   * Automatically configures H.264 encoding for unsupported video codecs
   * and Opus encoding for unsupported audio codecs.
   *
   * @param inputUrl - Media source URL (RTSP, file path, HTTP, etc.)
   *
   * @param options - Stream configuration options
   *
   * @returns Configured WebRTC stream instance
   *
   * @throws {Error} If no video stream found in input
   *
   * @throws {FFmpegError} If input cannot be opened
   *
   * @example
   * ```typescript
   * // Stream from RTSP camera
   * const stream = await WebRTCStream.create('rtsp://camera.local/stream', {
   *   mtu: 1200,
   *   onVideoPacket: (rtp) => videoTrack.writeRtp(rtp),
   *   onAudioPacket: (rtp) => audioTrack.writeRtp(rtp)
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Stream file with auto hardware acceleration
   * const stream = await WebRTCStream.create('video.mp4', {
   *   hardware: 'auto'
   * });
   * ```
   */
  static async create(inputUrl: string, options: WebRTCStreamOptions = {}): Promise<WebRTCStream> {
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

    return new WebRTCStream(input, options);
  }

  /**
   * Check if the stream is active.
   *
   * @returns True if the stream is active, false otherwise
   */
  get isStreamActive(): boolean {
    return this.streamActive;
  }

  /**
   * Get detected codec information for SDP negotiation.
   *
   * Returns RTP codec parameters and FFmpeg codec IDs for video and audio.
   * Use this information to configure WebRTC peer connections with matching codecs.
   *
   * @returns Codec configuration for video and audio streams
   *
   * @example
   * ```typescript
   * const stream = await WebRTCStream.create('input.mp4');
   * const codecs = stream.getCodecs();
   *
   * console.log('Video codec:', codecs.video.mimeType);
   * console.log('Audio codec:', codecs.audio?.mimeType);
   * ```
   */
  getCodecs(): WebRTCCodecInfo {
    return this.codecInfo;
  }

  /**
   * Start streaming media to RTP packets.
   *
   * Begins the media processing pipeline, reading packets from input,
   * transcoding if necessary, and invoking RTP packet callbacks.
   * Automatically handles video and audio streams in parallel.
   * Flushes all buffers at the end of stream.
   * This method blocks until streaming completes or {@link stop} is called.
   *
   * @returns Promise that resolves when streaming completes
   *
   * @throws {FFmpegError} If transcoding or muxing fails
   *
   * @example
   * ```typescript
   * const stream = await WebRTCStream.create('rtsp://camera.local/stream', {
   *   onVideoPacket: (rtp) => sendRtp(rtp)
   * });
   *
   * // Start streaming (blocks until complete or stopped)
   * await stream.start();
   * ```
   *
   * @example
   * ```typescript
   * // Non-blocking start with background promise
   * const stream = await WebRTCStream.create('input.mp4');
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

    // Setup video transcoding if needed
    if (!this.isVideoCodecSupported(videoStream.codecpar.codecId)) {
      if (this.options.hardware === 'auto') {
        this.hardwareContext = HardwareContext.auto();
      } else if (this.options.hardware.deviceType !== AV_HWDEVICE_TYPE_NONE) {
        this.hardwareContext = HardwareContext.create(this.options.hardware.deviceType, this.options.hardware.device, this.options.hardware.options);
      }

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

    const videoStreamIndex = this.videoEncoder ? this.videoOutput.addStream(this.videoEncoder) : this.videoOutput.addStream(videoStream);

    // Setup audio if available
    let audioStreamIndex: number | null = null;

    if (audioStream) {
      if (!this.isAudioCodecSupported(audioStream.codecpar.codecId)) {
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

      audioStreamIndex = this.audioEncoder ? this.audioOutput.addStream(this.audioEncoder) : this.audioOutput.addStream(audioStream);
    }

    const hasAudio = audioStreamIndex !== null && this.audioOutput !== null && audioStream !== undefined;

    // Start processing loop
    for await (using packet of this.input.packets()) {
      if (!this.streamActive) {
        break;
      }

      if (packet.streamIndex === videoStream.index) {
        if (this.videoDecoder === null || this.videoEncoder === null) {
          await this.videoOutput.writePacket(packet, videoStreamIndex);
        } else {
          using decodedFrame = await this.videoDecoder.decode(packet);
          if (!decodedFrame) {
            continue;
          }

          using encodedPacket = await this.videoEncoder.encode(decodedFrame);
          if (!encodedPacket) {
            continue;
          }

          await this.videoOutput.writePacket(encodedPacket, videoStreamIndex);
        }
      } else if (hasAudio && packet.streamIndex === audioStream.index) {
        if (this.audioDecoder === null || this.audioFilter === null || this.audioEncoder === null) {
          await this.audioOutput?.writePacket(packet, audioStreamIndex!);
          continue;
        } else {
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

          await this.audioOutput?.writePacket(encodedPacket, audioStreamIndex!);
        }
      }
    }

    // Flush pipelines
    await Promise.allSettled([this.flushVideo(videoStreamIndex), this.flushAudio(audioStreamIndex!, hasAudio)]);
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
   * const stream = await WebRTCStream.create('input.mp4');
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
   * decoders, encoders, filters, outputs, and input. Should be called when
   * done with the stream to prevent memory leaks.
   * Safe to call multiple times.
   *
   * @example
   * ```typescript
   * const stream = await WebRTCStream.create('input.mp4');
   * await stream.start();
   * stream.dispose();
   * ```
   *
   * @example
   * ```typescript
   * // Using automatic cleanup
   * {
   *   await using stream = await WebRTCStream.create('input.mp4');
   *   await stream.start();
   * } // Automatically disposed
   * ```
   */
  dispose(): void {
    if (!this.streamActive) {
      return;
    }

    this.stop();
    this.videoOutput?.close();
    this.audioOutput?.close();
    this.videoDecoder?.close();
    this.videoEncoder?.close();
    this.audioDecoder?.close();
    this.audioFilter?.close();
    this.audioEncoder?.close();
    this.input.close();
  }

  /**
   * Check if the given audio codec is compatible with WebRTC.
   *
   * @param codecId - The AVCodecID to check
   *
   * @returns True if the codec is WebRTC compatible, false otherwise
   *
   * @internal
   */
  private isAudioCodecSupported(codecId: AVCodecID): boolean {
    switch (codecId) {
      case AV_CODEC_ID_PCM_ALAW:
      case AV_CODEC_ID_PCM_MULAW:
      case AV_CODEC_ID_OPUS:
        return true;
      default:
        return false;
    }
  }

  /**
   * Check if the given video codec is compatible with WebRTC.
   *
   * @param codecId - The AVCodecID to check
   *
   * @returns True if the codec is WebRTC compatible, false otherwise
   *
   * @internal
   */
  private isVideoCodecSupported(codecId: AVCodecID): boolean {
    switch (codecId) {
      case AV_CODEC_ID_H264:
      case AV_CODEC_ID_HEVC:
      case AV_CODEC_ID_VP8:
      case AV_CODEC_ID_VP9:
      case AV_CODEC_ID_AV1:
        return true;
      default:
        return false;
    }
  }

  /**
   * Get the audio codec configuration for WebRTC.
   *
   * @param codecId - The AVCodecID of the audio codec
   *
   * @returns An object containing MIME type, clock rate, and channels, or null if unsupported
   *
   * @internal
   */
  private getAudioCodecConfig(codecId: AVCodecID): Partial<RTCRtpCodecParameters> | null {
    switch (codecId) {
      case AV_CODEC_ID_OPUS:
        return {
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          payloadType: 111,
        };
      case AV_CODEC_ID_PCM_MULAW:
        return {
          mimeType: 'audio/PCMU',
          clockRate: 8000,
          channels: 1,
          payloadType: 0,
        };
      case AV_CODEC_ID_PCM_ALAW:
        return {
          mimeType: 'audio/PCMA',
          clockRate: 8000,
          channels: 1,
          payloadType: 8,
        };
      default:
        return null;
    }
  }

  /**
   * Get the video codec configuration for WebRTC.
   *
   * @param codecId - The AVCodecID of the video codec
   *
   * @returns An object containing MIME type and clock rate, or null if unsupported
   *
   * @internal
   */
  private getVideoCodecConfig(codecId: AVCodecID): Partial<RTCRtpCodecParameters> | null {
    switch (codecId) {
      case AV_CODEC_ID_H264:
        return {
          mimeType: 'video/H264',
          clockRate: 90000,
          payloadType: 102,
        };
      case AV_CODEC_ID_HEVC:
        return {
          mimeType: 'video/H265',
          clockRate: 90000,
          payloadType: 103,
        };
      case AV_CODEC_ID_VP8:
        return {
          mimeType: 'video/VP8',
          clockRate: 90000,
          payloadType: 96,
        };
      case AV_CODEC_ID_VP9:
        return {
          mimeType: 'video/VP9',
          clockRate: 90000,
          payloadType: 98,
        };
      case AV_CODEC_ID_AV1:
        return {
          mimeType: 'video/AV1',
          clockRate: 90000,
          payloadType: 35,
        };
      default:
        return null;
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
    if (!this.videoDecoder || !this.videoEncoder || !this.videoOutput) {
      return;
    }

    for await (using frame of this.videoDecoder.flushFrames()) {
      using encodedPacket = await this.videoEncoder.encode(frame);
      if (encodedPacket) {
        await this.videoOutput.writePacket(encodedPacket, videoStreamIndex);
      }
    }

    for await (using packet of this.videoEncoder.flushPackets()) {
      await this.videoOutput.writePacket(packet, videoStreamIndex);
    }
  }

  /**
   * Flush audio encoder pipeline.
   *
   * @param audioStreamIndex - Output audio stream index
   *
   * @param hasAudio - Whether audio stream exists
   *
   * @internal
   */
  private async flushAudio(audioStreamIndex: number, hasAudio: boolean): Promise<void> {
    if (!this.audioDecoder || !this.audioFilter || !this.audioEncoder || !hasAudio || !this.audioOutput) {
      return;
    }

    for await (using frame of this.audioDecoder.flushFrames()) {
      using filteredFrame = await this.audioFilter.process(frame);
      if (!filteredFrame) {
        continue;
      }

      using encodedPacket = await this.audioEncoder.encode(filteredFrame);
      if (encodedPacket) {
        await this.audioOutput.writePacket(encodedPacket, audioStreamIndex);
      }
    }

    for await (using frame of this.audioFilter.flushFrames()) {
      using encodedPacket = await this.audioEncoder.encode(frame);
      if (encodedPacket) {
        await this.audioOutput.writePacket(encodedPacket, audioStreamIndex);
      }
    }

    for await (using packet of this.audioEncoder.flushPackets()) {
      await this.audioOutput.writePacket(packet, audioStreamIndex);
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

/**
 * Options for configuring WebRTC session with werift integration.
 *
 * Extends WebRTCStreamOptions but excludes RTP packet callbacks since
 * they are automatically handled by the session's media tracks.
 */
export interface WebRTCSessionOptions extends Omit<WebRTCStreamOptions, 'onVideoPacket' | 'onAudioPacket'> {
  /**
   * ICE servers for NAT traversal and STUN/TURN configuration.
   *
   * @default []
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('input.mp4', {
   *   iceServers: [
   *     { urls: 'stun:stun.l.google.com:19302' },
   *     { urls: 'turn:turn.example.com:3478' }
   *   ]
   * });
   * ```
   */
  iceServers?: { urls: string }[];
}

/**
 * Complete WebRTC session management with werift integration.
 *
 * Provides end-to-end WebRTC streaming with automatic SDP negotiation,
 * ICE candidate handling, and peer connection management.
 * Built on top of {@link WebRTCStream} but handles all WebRTC protocol details.
 * Integrates with werift library for RTCPeerConnection and media track handling.
 * Ideal for building complete WebRTC streaming applications with minimal code.
 *
 * @example
 * ```typescript
 * import { WebRTCSession } from 'node-av/api';
 *
 * // Create session from media source
 * const session = await WebRTCSession.create('rtsp://camera.local/stream', {
 *   mtu: 1200,
 *   hardware: 'auto',
 *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
 * });
 *
 * // Setup ICE candidate handler
 * session.onIceCandidate = (candidate) => {
 *   sendToClient({ type: 'candidate', value: candidate });
 * };
 *
 * // Process SDP offer from client
 * const answer = await session.setOffer(clientOffer);
 * sendToClient({ type: 'answer', value: answer });
 *
 * // Start streaming
 * await session.start();
 * ```
 *
 * @example
 * ```typescript
 * // Complete WebSocket signaling server
 * import { WebSocket } from 'ws';
 *
 * ws.on('message', async (data) => {
 *   const msg = JSON.parse(data);
 *
 *   if (msg.type === 'offer') {
 *     const session = await WebRTCSession.create(msg.url, {
 *       hardware: 'auto'
 *     });
 *
 *     session.onIceCandidate = (candidate) => {
 *       ws.send(JSON.stringify({ type: 'candidate', value: candidate }));
 *     };
 *
 *     const answer = await session.setOffer(msg.value);
 *     ws.send(JSON.stringify({ type: 'answer', value: answer }));
 *
 *     await session.start();
 *   } else if (msg.type === 'candidate') {
 *     session.addIceCandidate(msg.value);
 *   }
 * });
 * ```
 *
 * @see {@link WebRTCStream} For library-agnostic RTP streaming
 * @see {@link MediaInput} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export class WebRTCSession implements Disposable {
  private stream!: WebRTCStream;
  private pc: RTCPeerConnection | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private options: WebRTCSessionOptions;

  /**
   * Callback invoked when a new ICE candidate is discovered.
   * Send this candidate to the remote peer via signaling channel.
   *
   * @param candidate - ICE candidate string to send to remote peer
   *
   * @example
   * ```typescript
   * session.onIceCandidate = (candidate) => {
   *   ws.send(JSON.stringify({ type: 'candidate', value: candidate }));
   * };
   * ```
   */
  public onIceCandidate: ((candidate: string) => void) | null = null;

  /**
   * @param options - Session configuration options
   *
   * Use {@link create} factory method
   *
   * @internal
   */
  private constructor(options: WebRTCSessionOptions) {
    this.options = options;
  }

  /**
   * Create a WebRTC session from a media source.
   *
   * Opens the input media, creates internal streaming components, and prepares
   * for WebRTC peer connection negotiation. Does not start streaming yet.
   * Call {@link setOffer} to negotiate SDP and {@link start} to begin streaming.
   *
   * @param inputUrl - Media source URL (RTSP, file path, HTTP, etc.)
   *
   * @param options - Session configuration options
   *
   * @returns Configured WebRTC session instance
   *
   * @throws {Error} If no video stream found in input
   *
   * @throws {FFmpegError} If input cannot be opened
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('rtsp://camera.local/stream', {
   *   mtu: 1200,
   *   hardware: 'auto',
   *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
   * });
   * ```
   *
   * @example
   * ```typescript
   * // Session from file with hardware acceleration
   * const session = await WebRTCSession.create('video.mp4', {
   *   hardware: {
   *     deviceType: AV_HWDEVICE_TYPE_CUDA
   *   }
   * });
   * ```
   */
  static async create(inputUrl: string, options: WebRTCSessionOptions = {}): Promise<WebRTCSession> {
    const session = new WebRTCSession(options);

    // Create stream to detect codecs
    session.stream = await WebRTCStream.create(inputUrl, {
      mtu: options.mtu,
      hardware: options.hardware,
      onVideoPacket: (rtp) => {
        session.videoTrack?.writeRtp(rtp);
      },
      onAudioPacket: (rtp) => {
        session.audioTrack?.writeRtp(rtp);
      },
    });

    return session;
  }

  /**
   * Get detected codec information.
   *
   * Returns RTP codec parameters and FFmpeg codec IDs for video and audio.
   * Useful for inspecting what codecs will be used in the WebRTC session.
   *
   * @returns Codec configuration for video and audio streams
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('input.mp4');
   * const codecs = session.getCodecs();
   *
   * console.log('Video:', codecs.video.mimeType);
   * console.log('Audio:', codecs.audio?.mimeType);
   * ```
   */
  getCodecs(): WebRTCCodecInfo {
    return this.stream.getCodecs();
  }

  /**
   * Process SDP offer from remote peer and generate SDP answer.
   *
   * Creates RTCPeerConnection with detected codecs, sets up media tracks,
   * processes the remote SDP offer, and generates a local SDP answer.
   * Also configures ICE candidate handling via {@link onIceCandidate} callback.
   * Must be called before {@link start}.
   *
   * @param offerSdp - SDP offer string from remote WebRTC peer
   *
   * @returns SDP answer string to send back to remote peer
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('input.mp4');
   *
   * // Setup ICE candidate handler first
   * session.onIceCandidate = (candidate) => {
   *   sendToRemote({ type: 'candidate', value: candidate });
   * };
   *
   * // Process offer and send answer
   * const answer = await session.setOffer(remoteOffer);
   * sendToRemote({ type: 'answer', value: answer });
   * ```
   */
  async setOffer(offerSdp: string): Promise<string> {
    const codecs = this.stream.getCodecs();

    const videoConfig: any = codecs.video;
    delete videoConfig.codecId;

    const audioConfig: any = codecs.audio ?? {
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
      payloadType: 111,
    };

    delete audioConfig.codecId;

    // Create PeerConnection with detected codecs
    const codecParams: { video: RTCRtpCodecParameters[]; audio: RTCRtpCodecParameters[] } = {
      video: [
        new RTCRtpCodecParameters({
          ...videoConfig,
        }),
      ],
      audio: [
        new RTCRtpCodecParameters({
          ...audioConfig,
        }),
      ],
    };

    this.pc = new RTCPeerConnection({
      codecs: codecParams,
      iceServers: this.options.iceServers,
    });

    // Setup ICE candidate handling
    this.pc.onIceCandidate.subscribe((candidate) => {
      if (candidate?.candidate && this.onIceCandidate) {
        this.onIceCandidate(candidate.candidate);
      }
    });

    // Setup tracks
    this.pc.onRemoteTransceiverAdded.subscribe(async (transceiver) => {
      if (transceiver.kind === 'video') {
        this.videoTrack = new MediaStreamTrack({ kind: 'video' });
        transceiver.sender.replaceTrack(this.videoTrack);
        transceiver.setDirection('sendonly');
      } else if (transceiver.kind === 'audio' && this.audioTrack === null) {
        this.audioTrack = new MediaStreamTrack({ kind: 'audio' });
        transceiver.sender.replaceTrack(this.audioTrack);
        transceiver.setDirection('sendonly');
      } else if (transceiver.kind === 'audio') {
        // Backchannel
        const [track] = await transceiver.onTrack.asPromise();
        const ctx = this.stream.input.getFormatContext();
        const streams = ctx?.getRTSPStreamInfo();
        const backchannel = streams?.find((s) => s.direction === 'sendonly');

        track.onReceiveRtp.subscribe((rtp) => {
          if (backchannel && this.stream.isStreamActive) {
            try {
              ctx?.sendRTSPPacket(backchannel.streamIndex, rtp.serialize());
            } catch {
              // Ignore send errors
            }
          }
        });
      }
    });

    // Set remote description and create answer
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp, 'offer'));
    const answer = await this.pc.createAnswer();
    this.pc.setLocalDescription(answer);

    return this.pc.localDescription?.sdp ?? '';
  }

  /**
   * Add ICE candidate from remote peer.
   *
   * Processes ICE candidates received from the remote peer via signaling channel.
   * Should be called whenever a new candidate message arrives from remote peer.
   * Can be called multiple times as candidates are discovered.
   *
   * @param candidate - ICE candidate string from remote peer
   *
   * @throws {Error} If peer connection not initialized (call {@link setOffer} first)
   *
   * @example
   * ```typescript
   * // In signaling message handler
   * if (msg.type === 'candidate') {
   *   session.addIceCandidate(msg.value);
   * }
   * ```
   */
  addIceCandidate(candidate: string): void {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }
    this.pc.addIceCandidate(new RTCIceCandidate({ candidate }));
  }

  /**
   * Start streaming media to WebRTC peer connection.
   *
   * Begins the media processing pipeline, reading packets from input,
   * transcoding if necessary, and sending RTP packets to media tracks.
   * Must call {@link setOffer} before starting.
   * This method blocks until streaming completes or {@link stop} is called.
   *
   * @returns Promise that resolves when streaming completes
   *
   * @throws {FFmpegError} If transcoding or muxing fails
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('input.mp4');
   * session.onIceCandidate = (c) => sendToRemote(c);
   *
   * const answer = await session.setOffer(remoteOffer);
   * sendToRemote(answer);
   *
   * // Start streaming (blocks until complete)
   * await session.start();
   * ```
   *
   * @example
   * ```typescript
   * // Non-blocking start
   * const session = await WebRTCSession.create('input.mp4');
   * const streamPromise = session.start();
   *
   * // Later: stop streaming
   * session.stop();
   * await streamPromise;
   * ```
   */
  async start(): Promise<void> {
    await this.stream.start();
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
   * const session = await WebRTCSession.create('input.mp4');
   * const streamPromise = session.start();
   *
   * // Stop after 10 seconds
   * setTimeout(() => session.stop(), 10000);
   *
   * await streamPromise;
   * session.dispose();
   * ```
   */
  stop(): void {
    this.stream.stop();
  }

  /**
   * Clean up all resources and close the session.
   *
   * Stops streaming if active, releases all FFmpeg resources, closes peer connection,
   * and cleans up media tracks. Should be called when done with the session to prevent
   * memory leaks. Safe to call multiple times.
   *
   * @example
   * ```typescript
   * const session = await WebRTCSession.create('input.mp4');
   * await session.start();
   * session.dispose();
   * ```
   *
   * @example
   * ```typescript
   * // Using automatic cleanup
   * {
   *   await using session = await WebRTCSession.create('input.mp4');
   *   await session.start();
   * } // Automatically disposed
   * ```
   */
  dispose(): void {
    this.stop();
    this.stream.dispose();
    this.pc?.close();
    this.videoTrack = null;
    this.audioTrack = null;
    this.pc = null;
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
