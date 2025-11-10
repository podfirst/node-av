import {
  AV_CODEC_CAP_ENCODER_REORDERED_OPAQUE,
  AV_CODEC_CAP_PARAM_CHANGE,
  AV_CODEC_FLAG_COPY_OPAQUE,
  AV_CODEC_FLAG_FRAME_DURATION,
  AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX,
  AV_CODEC_HW_CONFIG_METHOD_HW_FRAMES_CTX,
  AV_PIX_FMT_NONE,
  AV_PKT_FLAG_TRUSTED,
  AVCHROMA_LOC_UNSPECIFIED,
  AVERROR_EAGAIN,
  AVERROR_EOF,
  AVMEDIA_TYPE_AUDIO,
  AVMEDIA_TYPE_VIDEO,
} from '../constants/constants.js';
import { CodecContext } from '../lib/codec-context.js';
import { Codec } from '../lib/codec.js';
import { Dictionary } from '../lib/dictionary.js';
import { FFmpegError } from '../lib/error.js';
import { Packet } from '../lib/packet.js';
import { Rational } from '../lib/rational.js';
import { avRescaleQ } from '../lib/utilities.js';
import { AudioFrameBuffer } from './audio-frame-buffer.js';
import { FRAME_THREAD_QUEUE_SIZE, PACKET_THREAD_QUEUE_SIZE } from './constants.js';
import { AsyncQueue } from './utilities/async-queue.js';
import { SchedulerControl } from './utilities/scheduler.js';
import { parseBitrate } from './utils.js';

import type { AVCodecFlag, AVCodecID, AVPixelFormat, AVSampleFormat, FFEncoderCodec } from '../constants/index.js';
import type { Frame } from '../lib/frame.js';
import type { Muxer } from './muxer.js';
import type { EncoderOptions } from './types.js';
import type { SchedulableComponent } from './utilities/scheduler.js';

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
export class Encoder implements Disposable {
  private codecContext: CodecContext;
  private packet: Packet;
  private codec: Codec;
  private initializePromise: Promise<void> | null = null;
  private initialized = false;
  private isClosed = false;
  private opts?: Dictionary | null;
  private options: EncoderOptions;
  private audioFrameBuffer?: AudioFrameBuffer;

  // Worker pattern for push-based processing
  private inputQueue: AsyncQueue<Frame>;
  private outputQueue: AsyncQueue<Packet>;
  private workerPromise: Promise<void> | null = null;
  private pipeToPromise: Promise<void> | null = null;

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
  private constructor(codecContext: CodecContext, codec: Codec, options: EncoderOptions, opts?: Dictionary | null) {
    this.codecContext = codecContext;
    this.codec = codec;
    this.options = options;
    this.opts = opts;

    this.packet = new Packet();
    this.packet.alloc();
    this.inputQueue = new AsyncQueue<Frame>(FRAME_THREAD_QUEUE_SIZE);
    this.outputQueue = new AsyncQueue<Packet>(PACKET_THREAD_QUEUE_SIZE);
  }

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
  static async create(encoderCodec: FFEncoderCodec | AVCodecID | Codec, options: EncoderOptions = {}): Promise<Encoder> {
    let codec: Codec | null = null;
    let codecName = '';

    if (encoderCodec instanceof Codec) {
      codec = encoderCodec;
      codecName = codec.name ?? 'Unknown';
    } else if (typeof encoderCodec === 'string') {
      codec = Codec.findEncoderByName(encoderCodec);
      codecName = codec?.name ?? encoderCodec;
    } else {
      codec = Codec.findEncoder(encoderCodec);
      codecName = codec?.name ?? encoderCodec.toString();
    }

    if (!codec) {
      throw new Error(`Encoder ${codecName} not found`);
    }

    // Allocate codec context
    const codecContext = new CodecContext();
    codecContext.allocContext3(codec);

    // Apply encoder-specific options
    if (options.gopSize !== undefined) {
      codecContext.gopSize = options.gopSize;
    }

    if (options.maxBFrames !== undefined) {
      codecContext.maxBFrames = options.maxBFrames;
    }

    // Apply common options with codec-type-specific defaults
    if (options.bitrate === undefined) {
      // Set codec-type-specific default bitrate
      const isAudio = codec.type === AVMEDIA_TYPE_AUDIO;
      options.bitrate = isAudio ? 128_000 : 1_000_000;
    }

    const bitrate = typeof options.bitrate === 'string' ? parseBitrate(options.bitrate) : BigInt(options.bitrate);
    codecContext.bitRate = bitrate;

    if (options.minRate !== undefined) {
      const minRate = typeof options.minRate === 'string' ? parseBitrate(options.minRate) : BigInt(options.minRate);
      codecContext.rcMinRate = minRate;
    }

    if (options.maxRate !== undefined) {
      const maxRate = typeof options.maxRate === 'string' ? parseBitrate(options.maxRate) : BigInt(options.maxRate);
      codecContext.rcMaxRate = maxRate;
    }

    if (options.bufSize !== undefined) {
      const bufSize = typeof options.bufSize === 'string' ? parseBitrate(options.bufSize) : BigInt(options.bufSize);
      codecContext.rcBufferSize = Number(bufSize);
    }

    const opts = options.options ? Dictionary.fromObject(options.options) : undefined;

    return new Encoder(codecContext, codec, options, opts);
  }

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
  static createSync(encoderCodec: FFEncoderCodec | AVCodecID | Codec, options: EncoderOptions = {}): Encoder {
    let codec: Codec | null = null;
    let codecName = '';

    if (encoderCodec instanceof Codec) {
      codec = encoderCodec;
      codecName = codec.name ?? 'Unknown';
    } else if (typeof encoderCodec === 'string') {
      codec = Codec.findEncoderByName(encoderCodec);
      codecName = codec?.name ?? encoderCodec;
    } else {
      codec = Codec.findEncoder(encoderCodec);
      codecName = codec?.name ?? encoderCodec.toString();
    }

    if (!codec) {
      throw new Error(`Encoder ${codecName} not found`);
    }

    // Allocate codec context

    const codecContext = new CodecContext();
    codecContext.allocContext3(codec);

    // Apply common options with codec-type-specific defaults
    if (options.bitrate === undefined) {
      // Set codec-type-specific default bitrate
      const isAudio = codec.type === AVMEDIA_TYPE_AUDIO;
      options.bitrate = isAudio ? 128_000 : 1_000_000;
    }

    const bitrate = typeof options.bitrate === 'string' ? parseBitrate(options.bitrate) : BigInt(options.bitrate);
    codecContext.bitRate = bitrate;

    if (options.gopSize !== undefined) {
      codecContext.gopSize = options.gopSize;
    }

    if (options.maxBFrames !== undefined) {
      codecContext.maxBFrames = options.maxBFrames;
    }

    if (options.minRate !== undefined) {
      const minRate = typeof options.minRate === 'string' ? parseBitrate(options.minRate) : BigInt(options.minRate);
      codecContext.rcMinRate = minRate;
    }

    if (options.maxRate !== undefined) {
      const maxRate = typeof options.maxRate === 'string' ? parseBitrate(options.maxRate) : BigInt(options.maxRate);
      codecContext.rcMaxRate = maxRate;
    }

    if (options.bufSize !== undefined) {
      const bufSize = typeof options.bufSize === 'string' ? parseBitrate(options.bufSize) : BigInt(options.bufSize);
      codecContext.rcBufferSize = Number(bufSize);
    }

    const opts = options.options ? Dictionary.fromObject(options.options) : undefined;

    return new Encoder(codecContext, codec, options, opts);
  }

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
  get isEncoderOpen(): boolean {
    return !this.isClosed;
  }

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
  get isEncoderInitialized(): boolean {
    return this.initialized;
  }

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
  get codecFlags(): AVCodecFlag {
    if (this.isClosed) {
      throw new Error('Cannot get flags on closed encoder');
    }
    return this.codecContext.flags;
  }

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
  setCodecFlags(...flags: AVCodecFlag[]): void {
    if (this.isClosed) {
      throw new Error('Cannot set flags on closed encoder');
    }
    if (this.initialized) {
      throw new Error('Cannot set flags on already initialized encoder');
    }
    this.codecContext.setFlags(...flags);
  }

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
  clearCodecFlags(...flags: AVCodecFlag[]): void {
    if (this.isClosed) {
      throw new Error('Cannot clear flags on closed encoder');
    }
    if (this.initialized) {
      throw new Error('Cannot clear flags on already initialized encoder');
    }
    this.codecContext.clearFlags(...flags);
  }

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
  hasCodecFlags(...flags: AVCodecFlag[]): boolean {
    if (this.isClosed) {
      throw new Error('Cannot check flags on closed encoder');
    }
    return this.codecContext.hasFlags(...flags);
  }

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
  isHardware(): boolean {
    return this.codec.isHardwareAcceleratedEncoder();
  }

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
  isReady(): boolean {
    return this.initialized && !this.isClosed;
  }

  /**
   * Encode a frame to a packet.
   *
   * Sends a frame to the encoder and attempts to receive an encoded packet.
   * On first frame, automatically initializes encoder with frame properties.
   * Handles internal buffering - may return null if more frames needed.
   *
   * **Note**: This method receives only ONE packet per call.
   * A single frame can produce multiple packets (e.g., B-frames, codec buffering).
   * To receive all packets from a frame, use {@link encodeAll} or {@link packets} instead.
   *
   * Direct mapping to avcodec_send_frame() and avcodec_receive_packet().
   *
   * @param frame - Raw frame to encode (or null to flush)
   *
   * @returns Encoded packet, null if more data needed, or null if encoder is closed
   *
   * @throws {FFmpegError} If encoding fails
   *
   * @example
   * ```typescript
   * const packet = await encoder.encode(frame);
   * if (packet) {
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
   *   const packet = await encoder.encode(frame);
   *   if (packet) {
   *     await output.writePacket(packet);
   *     packet.free();
   *   }
   *   frame.free();
   * }
   * ```
   *
   * @see {@link encodeAll} For multiple packet encoding
   * @see {@link packets} For automatic frame iteration
   * @see {@link flush} For end-of-stream handling
   * @see {@link encodeSync} For synchronous version
   */
  async encode(frame: Frame | null): Promise<Packet | null> {
    if (this.isClosed) {
      return null;
    }

    // Open encoder if not already done
    if (!this.initialized) {
      if (!frame) {
        return null;
      }

      this.initializePromise ??= this.initialize(frame);
    }

    await this.initializePromise;

    // Prepare frame for encoding (set quality, validate channel count)
    if (frame) {
      this.prepareFrameForEncoding(frame);
    }

    // Send frame to encoder
    const sendRet = await this.codecContext.sendFrame(frame);

    // Handle EAGAIN: encoder buffer is full, need to read packets first
    // Unlike FFmpeg CLI which reads ALL packets in a loop, our encode() returns
    // only one packet at a time. This means the encoder can still have packets
    // from previous frames when we try to send a new frame.
    if (sendRet === AVERROR_EAGAIN) {
      // Encoder is full, receive a packet first
      const packet = await this.receive();
      if (packet) {
        return packet;
      }
      // If receive() returned null, this is unexpected - treat as error
      throw new Error('Encoder returned EAGAIN but no packet available');
    }

    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      FFmpegError.throwIfError(sendRet, 'Failed to send frame');
    }

    // Try to receive packet
    return await this.receive();
  }

  /**
   * Encode a frame to a packet synchronously.
   * Synchronous version of encode.
   *
   * Sends a frame to the encoder and attempts to receive an encoded packet.
   * On first frame, automatically initializes encoder with frame properties.
   * Handles internal buffering - may return null if more frames needed.
   *
   * **Note**: This method receives only ONE packet per call.
   * A single frame can produce multiple packets (e.g., B-frames, codec buffering).
   * To receive all packets from a frame, use {@link encodeAllSync} or {@link packetsSync} instead.
   *
   * Direct mapping to avcodec_send_frame() and avcodec_receive_packet().
   *
   * @param frame - Raw frame to encode (or null to flush)
   *
   * @returns Encoded packet, null if more data needed, or null if encoder is closed
   *
   * @throws {FFmpegError} If encoding fails
   *
   * @example
   * ```typescript
   * const packet = encoder.encodeSync(frame);
   * if (packet) {
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
   *   const packet = encoder.encodeSync(frame);
   *   if (packet) {
   *     output.writePacketSync(packet);
   *     packet.free();
   *   }
   *   frame.free();
   * }
   * ```
   *
   * @see {@link encodeAllSync} For multiple packet encoding
   * @see {@link packetsSync} For automatic frame iteration
   * @see {@link flushSync} For end-of-stream handling
   * @see {@link encode} For async version
   */
  encodeSync(frame: Frame | null): Packet | null {
    if (this.isClosed) {
      return null;
    }

    // Open encoder if not already done
    if (!this.initialized) {
      if (!frame) {
        return null;
      }

      this.initializeSync(frame);
    }

    // Prepare frame for encoding (set quality, validate channel count)
    if (frame) {
      this.prepareFrameForEncoding(frame);
    }

    // Send frame to encoder
    const sendRet = this.codecContext.sendFrameSync(frame);

    // Handle EAGAIN: encoder buffer is full, need to read packets first
    // Unlike FFmpeg CLI which reads ALL packets in a loop, our encode() returns
    // only one packet at a time. This means the encoder can still have packets
    // from previous frames when we try to send a new frame.
    if (sendRet === AVERROR_EAGAIN) {
      // Encoder is full, receive a packet first
      const packet = this.receiveSync();
      if (packet) {
        return packet;
      }
      // If receive() returned null, this is unexpected - treat as error
      throw new Error('Encoder returned EAGAIN but no packet available');
    }

    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      FFmpegError.throwIfError(sendRet, 'Failed to send frame');
    }

    // Try to receive packet
    return this.receiveSync();
  }

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
  async encodeAll(frame: Frame | null): Promise<Packet[]> {
    if (this.isClosed) {
      return [];
    }

    // Open encoder if not already done
    if (!this.initialized) {
      if (!frame) {
        return [];
      }

      this.initializePromise ??= this.initialize(frame);
    }

    await this.initializePromise;

    // Prepare frame for encoding (set quality, validate channel count)
    if (frame) {
      this.prepareFrameForEncoding(frame);
    }

    // If audio encoder with fixed frame size, use AudioFrameBuffer
    if (this.audioFrameBuffer && frame) {
      // Push frame into buffer
      await this.audioFrameBuffer.push(frame);

      // Pull and encode all available fixed-size frames
      const packets: Packet[] = [];
      let _bufferedFrame;
      while (!this.isClosed && (_bufferedFrame = await this.audioFrameBuffer.pull()) !== null) {
        using bufferedFrame = _bufferedFrame;

        // Send buffered frame to encoder
        const sendRet = await this.codecContext.sendFrame(bufferedFrame);
        if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
          FFmpegError.throwIfError(sendRet, 'Failed to send frame');
        }

        // Receive packets
        while (true) {
          const packet = await this.receive();
          if (!packet) break;
          packets.push(packet);
        }
      }
      return packets;
    }

    // Send frame first, error immediately if send fails
    const sendRet = await this.codecContext.sendFrame(frame);
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      FFmpegError.throwIfError(sendRet, 'Failed to send frame to encoder');
      return [];
    }

    // Receive all available packets
    const packets: Packet[] = [];
    while (true) {
      const packet = await this.receive();
      if (!packet) break;
      packets.push(packet);
    }
    return packets;
  }

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
  encodeAllSync(frame: Frame | null): Packet[] {
    if (this.isClosed) {
      return [];
    }

    // Open encoder if not already done
    if (!this.initialized) {
      if (!frame) {
        return [];
      }

      this.initializeSync(frame);
    }

    // Prepare frame for encoding (set quality, validate channel count)
    if (frame) {
      this.prepareFrameForEncoding(frame);
    }

    // If audio encoder with fixed frame size, use AudioFrameBuffer
    if (this.audioFrameBuffer && frame) {
      // Push frame into buffer
      this.audioFrameBuffer.pushSync(frame);

      // Pull and encode all available fixed-size frames
      const packets: Packet[] = [];
      let _bufferedFrame;
      while (!this.isClosed && (_bufferedFrame = this.audioFrameBuffer.pullSync()) !== null) {
        using bufferedFrame = _bufferedFrame;

        // Send buffered frame to encoder
        const sendRet = this.codecContext.sendFrameSync(bufferedFrame);
        if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
          FFmpegError.throwIfError(sendRet, 'Failed to send frame');
        }

        // Receive packets
        while (true) {
          const packet = this.receiveSync();
          if (!packet) break;
          packets.push(packet);
        }
      }
      return packets;
    }

    // Send frame first, error immediately if send fails
    const sendRet = this.codecContext.sendFrameSync(frame);
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      FFmpegError.throwIfError(sendRet, 'Failed to send frame to encoder');
      return [];
    }

    // Receive all available packets
    const packets: Packet[] = [];
    while (true) {
      const packet = this.receiveSync();
      if (!packet) break;
      packets.push(packet);
    }
    return packets;
  }

  /**
   * Encode frame stream to packet stream.
   *
   * High-level async generator for complete encoding pipeline.
   * Automatically manages frame memory, encoder state,
   * and flushes buffered packets at end.
   * Primary interface for stream-based encoding.
   *
   * @param frames - Async iterable of frames (freed automatically)
   *
   * @yields {Packet} Encoded packets (caller must free)
   *
   * @throws {FFmpegError} If encoding fails
   *
   * @example
   * ```typescript
   * // Basic encoding pipeline
   * for await (const packet of encoder.packets(decoder.frames(input.packets()))) {
   *   await output.writePacket(packet);
   *   packet.free(); // Must free output packets
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With frame filtering
   * async function* filteredFrames() {
   *   for await (const frame of decoder.frames(input.packets())) {
   *     const filtered = await filter.process(frame);
   *     if (filtered) {
   *       yield filtered;
   *     }
   *     frame.free();
   *   }
   * }
   *
   * for await (const packet of encoder.packets(filteredFrames())) {
   *   await output.writePacket(packet);
   *   packet.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Pipeline integration
   * import { pipeline } from 'node-av/api';
   *
   * const control = pipeline(
   *   input,
   *   decoder,
   *   encoder,
   *   output
   * );
   * await control.completion;
   * ```
   *
   * @see {@link encode} For single frame encoding
   * @see {@link Decoder.frames} For frame source
   * @see {@link packetsSync} For sync version
   */
  async *packets(frames: AsyncIterable<Frame | null>): AsyncGenerator<Packet | null> {
    // Process frames
    for await (using frame of frames) {
      // Handle EOF signal
      if (frame === null) {
        // Flush encoder (audio frame buffer doesn't need explicit flush)
        await this.flush();
        while (true) {
          const remaining = await this.receive();
          if (!remaining) break;
          yield remaining;
        }
        // Signal EOF and stop processing
        yield null;
        return;
      }

      if (this.isClosed) {
        break;
      }

      // Open encoder if not already done
      if (!this.initialized) {
        this.initializePromise ??= this.initialize(frame);
      }

      await this.initializePromise;

      // Prepare frame for encoding (set quality, validate channel count)
      if (frame) {
        this.prepareFrameForEncoding(frame);
      }

      // If audio encoder with fixed frame size, use AudioFrameBuffer
      if (this.audioFrameBuffer) {
        // Push frame into buffer
        await this.audioFrameBuffer.push(frame);

        // Pull and encode all available fixed-size frames
        let _bufferedFrame;
        while (!this.isClosed && (_bufferedFrame = await this.audioFrameBuffer.pull()) !== null) {
          using bufferedFrame = _bufferedFrame;

          // Send buffered frame to encoder
          const sendRet = await this.codecContext.sendFrame(bufferedFrame);
          if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
            FFmpegError.throwIfError(sendRet, 'Failed to send frame');
          }

          // Receive packets
          while (true) {
            const packet = await this.receive();
            if (!packet) break;
            yield packet;
          }
        }
      } else {
        // Send frame to encoder
        const sendRet = await this.codecContext.sendFrame(frame);
        if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
          FFmpegError.throwIfError(sendRet, 'Failed to send frame');
        }

        // Receive ALL packets
        // A single frame can produce multiple packets (e.g., B-frames, lookahead)
        while (true) {
          const packet = await this.receive();
          if (!packet) break;
          yield packet;
        }
      }
    }

    // Flush encoder after all frames (fallback if no null was sent)
    await this.flush();
    while (true) {
      const remaining = await this.receive();
      if (!remaining) break;
      yield remaining;
    }

    // Signal EOF
    yield null;
  }

  /**
   * Encode frame stream to packet stream synchronously.
   * Synchronous version of packets.
   *
   * High-level sync generator for complete encoding pipeline.
   * Automatically manages frame memory, encoder state,
   * and flushes buffered packets at end.
   * Primary interface for stream-based encoding.
   *
   * @param frames - Iterable of frames (freed automatically)
   *
   * @yields {Packet} Encoded packets (caller must free)
   *
   * @throws {FFmpegError} If encoding fails
   *
   * @example
   * ```typescript
   * // Basic encoding pipeline
   * for (const packet of encoder.packetsSync(decoder.framesSync(packets))) {
   *   output.writePacketSync(packet);
   *   packet.free(); // Must free output packets
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With frame filtering
   * function* filteredFrames() {
   *   for (const frame of decoder.framesSync(packets)) {
   *     const filtered = filter.processSync(frame);
   *     if (filtered) {
   *       yield filtered;
   *     }
   *     frame.free();
   *   }
   * }
   *
   * for (const packet of encoder.packetsSync(filteredFrames())) {
   *   output.writePacketSync(packet);
   *   packet.free();
   * }
   * ```
   *
   * @see {@link encodeSync} For single frame encoding
   * @see {@link Decoder.framesSync} For frame source
   * @see {@link packets} For async version
   */
  *packetsSync(frames: Iterable<Frame | null>): Generator<Packet | null> {
    // Process frames
    for (using frame of frames) {
      // Handle EOF signal
      if (frame === null) {
        // Flush encoder (audio frame buffer doesn't need explicit flush)
        this.flushSync();
        while (true) {
          const remaining = this.receiveSync();
          if (!remaining) break;
          yield remaining;
        }
        // Signal EOF and stop processing
        yield null;
        return;
      }

      if (this.isClosed) {
        break;
      }

      // Open encoder if not already done
      if (!this.initialized) {
        this.initializeSync(frame);
      }

      // Prepare frame for encoding (set quality, validate channel count)
      if (frame) {
        this.prepareFrameForEncoding(frame);
      }

      // If audio encoder with fixed frame size, use AudioFrameBuffer
      if (this.audioFrameBuffer) {
        // Push frame into buffer
        this.audioFrameBuffer.pushSync(frame);

        // Pull and encode all available fixed-size frames
        let _bufferedFrame;
        while (!this.isClosed && (_bufferedFrame = this.audioFrameBuffer.pullSync()) !== null) {
          using bufferedFrame = _bufferedFrame;

          // Send buffered frame to encoder
          const sendRet = this.codecContext.sendFrameSync(bufferedFrame);
          if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
            FFmpegError.throwIfError(sendRet, 'Failed to send frame');
          }

          // Receive packets
          while (true) {
            const packet = this.receiveSync();
            if (!packet) break;
            yield packet;
          }
        }
      } else {
        // Send frame to encoder
        const sendRet = this.codecContext.sendFrameSync(frame);
        if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
          FFmpegError.throwIfError(sendRet, 'Failed to send frame');
        }

        // Receive ALL packets
        // A single frame can produce multiple packets (e.g., B-frames, lookahead)
        while (true) {
          const packet = this.receiveSync();
          if (!packet) break;
          yield packet;
        }
      }
    }

    // Flush encoder after all frames (fallback if no null was sent)
    this.flushSync();
    while (true) {
      const remaining = this.receiveSync();
      if (!remaining) break;
      yield remaining;
    }

    // Signal EOF
    yield null;
  }

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
  async flush(): Promise<void> {
    if (this.isClosed || !this.initialized) {
      return;
    }

    // If using AudioFrameBuffer, flush remaining buffered samples first
    if (this.audioFrameBuffer && this.audioFrameBuffer.size > 0) {
      // Pull any remaining partial frame (may be less than frameSize)
      // For the final frame, we pad or truncate as needed
      let _bufferedFrame;
      while (!this.isClosed && (_bufferedFrame = await this.audioFrameBuffer.pull()) !== null) {
        using bufferedFrame = _bufferedFrame;
        await this.codecContext.sendFrame(bufferedFrame);
      }
    }

    // Send flush frame (null)
    const ret = await this.codecContext.sendFrame(null);
    if (ret < 0 && ret !== AVERROR_EOF) {
      if (ret !== AVERROR_EAGAIN) {
        FFmpegError.throwIfError(ret, 'Failed to flush encoder');
      }
    }
  }

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
  flushSync(): void {
    if (this.isClosed || !this.initialized) {
      return;
    }

    // If using AudioFrameBuffer, flush remaining buffered samples first
    if (this.audioFrameBuffer && this.audioFrameBuffer.size > 0) {
      // Pull any remaining partial frame (may be less than frameSize)
      // For the final frame, we pad or truncate as needed
      let _bufferedFrame;
      while (!this.isClosed && (_bufferedFrame = this.audioFrameBuffer.pullSync()) !== null) {
        using bufferedFrame = _bufferedFrame;
        this.codecContext.sendFrameSync(bufferedFrame);
      }
    }

    // Send flush frame (null)
    const ret = this.codecContext.sendFrameSync(null);
    if (ret < 0 && ret !== AVERROR_EOF) {
      if (ret !== AVERROR_EAGAIN) {
        FFmpegError.throwIfError(ret, 'Failed to flush encoder');
      }
    }
  }

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
  async *flushPackets(): AsyncGenerator<Packet> {
    // Send flush signal
    await this.flush();

    while (true) {
      const packet = await this.receive();
      if (!packet) break;
      yield packet;
    }
  }

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
  *flushPacketsSync(): Generator<Packet> {
    // Send flush signal
    this.flushSync();

    while (true) {
      const packet = this.receiveSync();
      if (!packet) break;
      yield packet;
    }
  }

  /**
   * Receive packet from encoder.
   *
   * Gets encoded packets from the codec's internal buffer.
   * Handles packet cloning and error checking.
   * Returns null if encoder is closed, not initialized, or no packets available.
   * Call repeatedly until null to drain all buffered packets.
   *
   * Direct mapping to avcodec_receive_packet().
   *
   * @returns Cloned packet or null if no packets available
   *
   * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
   *
   * @example
   * ```typescript
   * const packet = await encoder.receive();
   * if (packet) {
   *   console.log(`Got packet with PTS: ${packet.pts}`);
   *   await output.writePacket(packet);
   *   packet.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Drain all buffered packets
   * let packet;
   * while ((packet = await encoder.receive()) !== null) {
   *   console.log(`Packet size: ${packet.size}`);
   *   await output.writePacket(packet);
   *   packet.free();
   * }
   * ```
   *
   * @see {@link encode} For sending frames and receiving packets
   * @see {@link flush} For signaling end-of-stream
   * @see {@link receiveSync} For synchronous version
   */
  async receive(): Promise<Packet | null> {
    if (this.isClosed || !this.initialized) {
      return null;
    }

    // Clear previous packet data
    this.packet.unref();

    const ret = await this.codecContext.receivePacket(this.packet);

    if (ret === 0) {
      // Set packet timebase to codec timebase
      this.packet.timeBase = this.codecContext.timeBase;

      // Mark packet as trusted (from encoder)
      this.packet.setFlags(AV_PKT_FLAG_TRUSTED);

      // Got a packet, clone it for the user
      return this.packet.clone();
    } else if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
      // Need more data or end of stream
      return null;
    } else {
      // Error
      FFmpegError.throwIfError(ret, 'Failed to receive packet');
      return null;
    }
  }

  /**
   * Receive packet from encoder synchronously.
   * Synchronous version of receive.
   *
   * Gets encoded packets from the codec's internal buffer.
   * Handles packet cloning and error checking.
   * Returns null if encoder is closed, not initialized, or no packets available.
   * Call repeatedly until null to drain all buffered packets.
   *
   * Direct mapping to avcodec_receive_packet().
   *
   * @returns Cloned packet or null if no packets available
   *
   * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
   *
   * @example
   * ```typescript
   * const packet = encoder.receiveSync();
   * if (packet) {
   *   console.log(`Got packet with PTS: ${packet.pts}`);
   *   output.writePacketSync(packet);
   *   packet.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Drain all buffered packets
   * let packet;
   * while ((packet = encoder.receiveSync()) !== null) {
   *   console.log(`Packet size: ${packet.size}`);
   *   output.writePacketSync(packet);
   *   packet.free();
   * }
   * ```
   *
   * @see {@link encodeSync} For sending frames and receiving packets
   * @see {@link flushSync} For signaling end-of-stream
   * @see {@link receive} For async version
   */
  receiveSync(): Packet | null {
    if (this.isClosed || !this.initialized) {
      return null;
    }

    // Clear previous packet data
    this.packet.unref();

    const ret = this.codecContext.receivePacketSync(this.packet);

    if (ret === 0) {
      // Set packet timebase to codec timebase
      this.packet.timeBase = this.codecContext.timeBase;

      // Mark packet as trusted (from encoder)
      this.packet.setFlags(AV_PKT_FLAG_TRUSTED);

      // Got a packet, clone it for the user
      return this.packet.clone();
    } else if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
      // Need more data or end of stream
      return null;
    } else {
      // Error
      FFmpegError.throwIfError(ret, 'Failed to receive packet');
      return null;
    }
  }

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
  pipeTo(target: Muxer, streamIndex: number): SchedulerControl<Frame> {
    // Start worker if not already running
    this.workerPromise ??= this.runWorker();

    // Start pipe task: encoder.outputQueue -> output
    this.pipeToPromise = (async () => {
      while (true) {
        const packet = await this.receiveFromQueue();
        if (!packet) break;
        await target.writePacket(packet, streamIndex);
      }
    })();

    // Return control without pipeTo (terminal stage)
    return new SchedulerControl<Frame>(this as unknown as SchedulableComponent<Frame>);
  }

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
  close(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Close queues
    this.inputQueue.close();
    this.outputQueue.close();

    this.packet.free();
    this.codecContext.freeContext();

    this.initialized = false;
  }

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
  getCodec(): Codec {
    return this.codec;
  }

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
  getCodecContext(): CodecContext | null {
    return !this.isClosed && this.initialized ? this.codecContext : null;
  }

  /**
   * Worker loop for push-based processing.
   *
   * @internal
   */
  private async runWorker(): Promise<void> {
    try {
      // Outer loop - receive frames
      while (!this.inputQueue.isClosed) {
        using frame = await this.inputQueue.receive();
        if (!frame) break;

        // Open encoder if not already done
        if (!this.initialized) {
          this.initializePromise ??= this.initialize(frame);
        }

        await this.initializePromise;

        // Prepare frame for encoding (set quality, validate channel count)
        this.prepareFrameForEncoding(frame);

        // If audio encoder with fixed frame size, use AudioFrameBuffer
        if (this.audioFrameBuffer) {
          // Push frame into buffer
          await this.audioFrameBuffer.push(frame);

          // Pull and encode all available fixed-size frames
          let _bufferedFrame;
          while ((_bufferedFrame = await this.audioFrameBuffer.pull()) !== null) {
            using bufferedFrame = _bufferedFrame;

            // Send buffered frame to encoder
            const sendRet = await this.codecContext.sendFrame(bufferedFrame);
            if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
              FFmpegError.throwIfError(sendRet, 'Failed to send frame');
            }

            // Receive packets
            while (true) {
              const packet = await this.receive();
              if (!packet) break;
              await this.outputQueue.send(packet);
            }
          }
        } else {
          // Send frame to encoder
          const sendRet = await this.codecContext.sendFrame(frame);
          if (sendRet < 0 && sendRet !== AVERROR_EOF && sendRet !== AVERROR_EAGAIN) {
            FFmpegError.throwIfError(sendRet, 'Failed to send frame');
          }

          // Receive ALL packets
          // A single frame can produce multiple packets (e.g., B-frames, lookahead)
          while (!this.outputQueue.isClosed) {
            const packet = await this.receive();
            if (!packet) break;
            await this.outputQueue.send(packet);
          }
        }
      }

      // Flush encoder at end
      await this.flush();
      while (!this.outputQueue.isClosed) {
        const packet = await this.receive();
        if (!packet) break;
        await this.outputQueue.send(packet);
      }
    } catch {
      // Ignore error ?
    } finally {
      // Close output queue when done
      this.outputQueue?.close();
    }
  }

  /**
   * Send frame to input queue.
   *
   * @param frame - Frame to send
   *
   * @internal
   */
  private async sendToQueue(frame: Frame): Promise<void> {
    await this.inputQueue.send(frame);
  }

  /**
   * Receive packet from output queue.
   *
   * @returns Packet from output queue
   *
   * @internal
   */
  private async receiveFromQueue(): Promise<Packet | null> {
    return await this.outputQueue.receive();
  }

  /**
   * Flush the entire filter pipeline.
   *
   * Propagates flush through worker, output queue, and next component.
   *
   * @internal
   */
  private async flushPipeline(): Promise<void> {
    // Close input queue to signal end of stream to worker
    this.inputQueue.close();

    // Wait for worker to finish processing all frames (if exists)
    if (this.workerPromise) {
      await this.workerPromise;
    }

    // Flush encoder at end
    await this.flush();

    while (true) {
      const packet = await this.receive();
      if (!packet) break;
      await this.outputQueue.send(packet);
    }

    if (this.pipeToPromise) {
      await this.pipeToPromise;
    }
  }

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
  private async initialize(frame: Frame): Promise<void> {
    // Get bits_per_raw_sample from decoder if available
    if (this.options.decoder) {
      const decoderCtx = this.options.decoder.getCodecContext();
      if (decoderCtx && decoderCtx.bitsPerRawSample > 0) {
        this.codecContext.bitsPerRawSample = decoderCtx.bitsPerRawSample;
      }
    }

    // Get framerate from filter if available, otherwise from decoder
    // This matches FFmpeg CLI behavior where encoder gets frame_rate_filter from FrameData
    if (this.options.filter && frame.isVideo()) {
      const filterFrameRate = this.options.filter.frameRate;
      if (filterFrameRate) {
        this.codecContext.framerate = new Rational(filterFrameRate.num, filterFrameRate.den);
      }
    }

    // If no filter framerate, try to get from decoder stream
    if ((!this.codecContext.framerate || this.codecContext.framerate.num === 0) && this.options.decoder && frame.isVideo()) {
      const decoderCtx = this.options.decoder.getCodecContext();
      if (decoderCtx?.framerate && decoderCtx.framerate.num > 0) {
        this.codecContext.framerate = decoderCtx.framerate;
      }
    }

    if (frame.isVideo()) {
      // FFmpeg CLI sets encoder time_base to 1/framerate (inverse of framerate)
      // This allows encoder to produce sequential PTS (0, 1, 2, 3...) which enables
      // proper B-frame DTS generation (negative DTS values)
      if (this.codecContext.framerate && this.codecContext.framerate.num > 0) {
        // Use inverse of framerate (e.g., framerate=30/1 → timebase=1/30)
        this.codecContext.timeBase = new Rational(this.codecContext.framerate.den, this.codecContext.framerate.num);
      } else {
        // Fallback: use frame timebase if framerate not available
        this.codecContext.timeBase = frame.timeBase;
      }
      this.codecContext.width = frame.width;
      this.codecContext.height = frame.height;
      this.codecContext.pixelFormat = frame.format as AVPixelFormat;
      this.codecContext.sampleAspectRatio = frame.sampleAspectRatio;
      this.codecContext.colorRange = frame.colorRange;
      this.codecContext.colorPrimaries = frame.colorPrimaries;
      this.codecContext.colorTrc = frame.colorTrc;
      this.codecContext.colorSpace = frame.colorSpace;

      // Only set chroma location if unspecified
      if (this.codecContext.chromaLocation === AVCHROMA_LOC_UNSPECIFIED) {
        this.codecContext.chromaLocation = frame.chromaLocation;
      }
    } else {
      // Audio: Always use frame timebase (which is typically 1/sample_rate)
      // This ensures correct PTS progression for audio frames
      this.codecContext.timeBase = frame.timeBase;

      this.codecContext.sampleRate = frame.sampleRate;
      this.codecContext.sampleFormat = frame.format as AVSampleFormat;
      this.codecContext.channelLayout = frame.channelLayout;
    }

    // Setup hardware acceleration with validation
    this.setupHardwareAcceleration(frame);

    // AV_CODEC_FLAG_COPY_OPAQUE: Copy opaque data from frames to packets if supported
    if (this.codec.hasCapabilities(AV_CODEC_CAP_ENCODER_REORDERED_OPAQUE)) {
      this.codecContext.setFlags(AV_CODEC_FLAG_COPY_OPAQUE);
    }

    // AV_CODEC_FLAG_FRAME_DURATION: Signal that frame duration matters for timestamps
    this.codecContext.setFlags(AV_CODEC_FLAG_FRAME_DURATION);

    // Open codec
    const openRet = await this.codecContext.open2(this.codec, this.opts);
    if (openRet < 0) {
      this.codecContext.freeContext();
      FFmpegError.throwIfError(openRet, 'Failed to open encoder');
    }

    // Check if encoder requires fixed frame size (e.g., Opus, AAC, MP3)
    // If so, create AudioFrameBuffer to automatically chunk frames
    if (frame.isAudio() && this.codecContext.frameSize > 0) {
      this.audioFrameBuffer = AudioFrameBuffer.create(
        this.codecContext.frameSize,
        this.codecContext.sampleFormat,
        this.codecContext.sampleRate,
        this.codecContext.channelLayout,
        this.codecContext.channels,
      );
    }

    this.initialized = true;
  }

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
  private initializeSync(frame: Frame): void {
    // Get bits_per_raw_sample from decoder if available
    if (this.options.decoder) {
      const decoderCtx = this.options.decoder.getCodecContext();
      if (decoderCtx && decoderCtx.bitsPerRawSample > 0) {
        this.codecContext.bitsPerRawSample = decoderCtx.bitsPerRawSample;
      }
    }

    // Get framerate from filter if available, otherwise from decoder
    // This matches FFmpeg CLI behavior where encoder gets frame_rate_filter from FrameData
    if (this.options.filter && frame.isVideo()) {
      const filterFrameRate = this.options.filter.frameRate;
      if (filterFrameRate) {
        this.codecContext.framerate = new Rational(filterFrameRate.num, filterFrameRate.den);
      }
    }

    // If no filter framerate, try to get from decoder stream
    if ((!this.codecContext.framerate || this.codecContext.framerate.num === 0) && this.options.decoder && frame.isVideo()) {
      const decoderCtx = this.options.decoder.getCodecContext();
      if (decoderCtx?.framerate && decoderCtx.framerate.num > 0) {
        this.codecContext.framerate = decoderCtx.framerate;
      }
    }

    if (frame.isVideo()) {
      // FFmpeg CLI sets encoder time_base to 1/framerate (inverse of framerate)
      // This allows encoder to produce sequential PTS (0, 1, 2, 3...) which enables
      // proper B-frame DTS generation (negative DTS values)
      if (this.codecContext.framerate && this.codecContext.framerate.num > 0) {
        // Use inverse of framerate (e.g., framerate=30/1 → timebase=1/30)
        this.codecContext.timeBase = new Rational(this.codecContext.framerate.den, this.codecContext.framerate.num);
      } else {
        // Fallback: use frame timebase if framerate not available
        this.codecContext.timeBase = frame.timeBase;
      }
      this.codecContext.width = frame.width;
      this.codecContext.height = frame.height;
      this.codecContext.pixelFormat = frame.format as AVPixelFormat;
      this.codecContext.sampleAspectRatio = frame.sampleAspectRatio;
      this.codecContext.colorRange = frame.colorRange;
      this.codecContext.colorPrimaries = frame.colorPrimaries;
      this.codecContext.colorTrc = frame.colorTrc;
      this.codecContext.colorSpace = frame.colorSpace;

      // Only set chroma location if unspecified
      if (this.codecContext.chromaLocation === AVCHROMA_LOC_UNSPECIFIED) {
        this.codecContext.chromaLocation = frame.chromaLocation;
      }
    } else {
      // Audio: Always use frame timebase (which is typically 1/sample_rate)
      // This ensures correct PTS progression for audio frames
      this.codecContext.timeBase = frame.timeBase;

      this.codecContext.sampleRate = frame.sampleRate;
      this.codecContext.sampleFormat = frame.format as AVSampleFormat;
      this.codecContext.channelLayout = frame.channelLayout;
    }

    // Setup hardware acceleration with validation
    this.setupHardwareAcceleration(frame);

    // Set codec flags
    // AV_CODEC_FLAG_COPY_OPAQUE: Copy opaque data from frames to packets if supported
    if (this.codec.hasCapabilities(AV_CODEC_CAP_ENCODER_REORDERED_OPAQUE)) {
      this.codecContext.setFlags(AV_CODEC_FLAG_COPY_OPAQUE);
    }

    // AV_CODEC_FLAG_FRAME_DURATION: Signal that frame duration matters for timestamps
    this.codecContext.setFlags(AV_CODEC_FLAG_FRAME_DURATION);

    // Open codec
    const openRet = this.codecContext.open2Sync(this.codec, this.opts);
    if (openRet < 0) {
      this.codecContext.freeContext();
      FFmpegError.throwIfError(openRet, 'Failed to open encoder');
    }

    // Check if encoder requires fixed frame size (e.g., Opus, AAC, MP3)
    // If so, create AudioFrameBuffer to automatically chunk frames
    if (frame.isAudio() && this.codecContext.frameSize > 0) {
      this.audioFrameBuffer = AudioFrameBuffer.create(
        this.codecContext.frameSize,
        this.codecContext.sampleFormat,
        this.codecContext.sampleRate,
        this.codecContext.channelLayout,
        this.codecContext.channels,
      );
    }

    this.initialized = true;
  }

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
  private setupHardwareAcceleration(frame: Frame): void {
    if (!frame.hwFramesCtx) {
      // Software encoding
      return;
    }

    const hwFramesCtx = frame.hwFramesCtx;
    const framesFormat = hwFramesCtx.format;
    const encoderFormat = this.codecContext.pixelFormat;

    // Check 1: Format validation
    if (framesFormat !== encoderFormat) {
      this.codecContext.hwDeviceCtx = hwFramesCtx.deviceRef;
      this.codecContext.hwFramesCtx = null;
      return;
    }

    // Check 2: Codec supports HW_FRAMES_CTX?
    let supportsFramesCtx = false;
    for (let i = 0; ; i++) {
      const config = this.codec.getHwConfig(i);
      if (!config) break;

      // Check if codec supports HW_FRAMES_CTX method
      if (config.methods & AV_CODEC_HW_CONFIG_METHOD_HW_FRAMES_CTX) {
        // Check if pixel format matches or is unspecified
        if (config.pixFmt === AV_PIX_FMT_NONE || config.pixFmt === encoderFormat) {
          supportsFramesCtx = true;
          break;
        }
      }
    }

    if (supportsFramesCtx) {
      // Use hw_frames_ctx (best performance - zero copy)
      this.codecContext.hwFramesCtx = hwFramesCtx;
      this.codecContext.hwDeviceCtx = hwFramesCtx.deviceRef;
    } else {
      // Fallback to hw_device_ctx (still uses HW, but may copy)
      // Check if codec supports HW_DEVICE_CTX as fallback
      let supportsDeviceCtx = false;
      for (let i = 0; ; i++) {
        const config = this.codec.getHwConfig(i);
        if (!config) break;

        if (config.methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX) {
          supportsDeviceCtx = true;
          break;
        }
      }

      if (supportsDeviceCtx) {
        this.codecContext.hwDeviceCtx = hwFramesCtx.deviceRef;
        this.codecContext.hwFramesCtx = null;
      } else {
        // No hardware support at all - software encoding
        this.codecContext.hwDeviceCtx = null;
        this.codecContext.hwFramesCtx = null;
      }
    }
  }

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
  private prepareFrameForEncoding(frame: Frame): void {
    // Adjust frame PTS and timebase to encoder timebase
    // This matches FFmpeg's adjust_frame_pts_to_encoder_tb() behavior which:
    // 1. Converts PTS from frame's timebase to encoder's timebase (av_rescale_q)
    // 2. Sets frame->time_base = tb_dst (so encoder gets correct timebase)

    // Note: prepareFrameForEncoding is always called AFTER initialize(),
    // so codecContext.timeBase is already set correctly:
    // - Video: 1/framerate (if available)
    // - Audio: frame.timeBase from first frame (typically 1/sample_rate)
    const encoderTimebase = this.codecContext.timeBase;
    const oldTimebase = frame.timeBase;

    // IMPORTANT: Calculate duration BEFORE converting frame timebase
    // This matches FFmpeg's video_sync_process() which calculates:
    //   duration = frame->duration * av_q2d(frame->time_base) / av_q2d(ofp->tb_out)
    // We need the OLD timebase to convert duration properly
    let frameDuration: bigint;

    if (frame.duration && frame.duration > 0n) {
      // Convert duration from frame timebase to encoder timebase
      // This ensures encoder gets correct frame duration for timestamps
      frameDuration = avRescaleQ(frame.duration, oldTimebase, encoderTimebase);
    } else {
      // Default to 1 (constant frame rate behavior)
      // Matches FFmpeg's CFR mode: frame->duration = 1
      frameDuration = 1n;
    }

    if (frame.pts !== null && frame.pts !== undefined) {
      // Convert PTS to encoder timebase
      frame.pts = avRescaleQ(frame.pts, oldTimebase, encoderTimebase);

      // IMPORTANT: Set frame timebase to encoder timebase
      // FFmpeg does this in adjust_frame_pts_to_encoder_tb(): frame->time_base = tb_dst
      // This ensures encoder gets frames with correct timebase (1/framerate for video, 1/sample_rate for audio)
      frame.timeBase = encoderTimebase;
    }

    // Set frame duration in encoder timebase
    // This matches FFmpeg's video_sync_process() which sets frame->duration
    // based on vsync_method (CFR: 1, VFR: calculated, PASSTHROUGH: calculated)
    // Since we don't have automatic filter like FFmpeg, we always set it here
    frame.duration = frameDuration;

    if (this.codecContext.codecType === AVMEDIA_TYPE_VIDEO) {
      // Video: Set frame quality from encoder's global quality
      // Only set if encoder has globalQuality configured and frame doesn't already have quality set
      if (this.codecContext.globalQuality > 0 && frame.quality <= 0) {
        frame.quality = this.codecContext.globalQuality;
      }
    } else if (this.codecContext.codecType === AVMEDIA_TYPE_AUDIO) {
      // Audio: Validate channel count consistency
      // If encoder doesn't support AV_CODEC_CAP_PARAM_CHANGE, channel count must remain constant
      const supportsParamChange = this.codec.hasCapabilities(AV_CODEC_CAP_PARAM_CHANGE);

      if (!supportsParamChange) {
        const encoderChannels = this.codecContext.channelLayout.nbChannels;
        const frameChannels = frame.channelLayout?.nbChannels ?? 0;

        if (encoderChannels !== frameChannels) {
          throw new Error(`Audio channel count changed (${encoderChannels} -> ${frameChannels}) and encoder '${this.codec.name}' does not support parameter changes`);
        }
      }
    }
  }

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
  [Symbol.dispose](): void {
    this.close();
  }
}
