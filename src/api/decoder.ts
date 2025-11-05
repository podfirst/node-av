import {
  AV_CODEC_FLAG_COPY_OPAQUE,
  AV_FRAME_FLAG_CORRUPT,
  AV_NOPTS_VALUE,
  AV_ROUND_UP,
  AVERROR_EAGAIN,
  AVERROR_EOF,
  AVMEDIA_TYPE_AUDIO,
  AVMEDIA_TYPE_VIDEO,
  INT_MAX,
} from '../constants/constants.js';
import { CodecContext } from '../lib/codec-context.js';
import { Codec } from '../lib/codec.js';
import { Dictionary } from '../lib/dictionary.js';
import { FFmpegError } from '../lib/error.js';
import { Frame } from '../lib/frame.js';
import { Rational } from '../lib/rational.js';
import { avGcd, avInvQ, avMulQ, avRescaleDelta, avRescaleQ, avRescaleQRnd } from '../lib/utilities.js';

import type { AVCodecID, FFDecoderCodec } from '../constants/index.js';
import type { Packet } from '../lib/packet.js';
import type { Stream } from '../lib/stream.js';
import type { IRational } from '../lib/types.js';
import type { DecoderOptions } from './types.js';

/**
 * High-level decoder for audio and video streams.
 *
 * Provides a simplified interface for decoding media streams from packets to frames.
 * Handles codec initialization, hardware acceleration setup, and frame management.
 * Supports both synchronous packet-by-packet decoding and async iteration over frames.
 * Essential component in media processing pipelines for converting compressed data to raw frames.
 *
 * @example
 * ```typescript
 * import { MediaInput, Decoder } from 'node-av/api';
 *
 * // Open media and create decoder
 * await using input = await MediaInput.open('video.mp4');
 * using decoder = await Decoder.create(input.video());
 *
 * // Decode frames
 * for await (const frame of decoder.frames(input.packets())) {
 *   console.log(`Decoded frame: ${frame.width}x${frame.height}`);
 *   frame.free();
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { HardwareContext } from 'node-av/api';
 * import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';
 *
 * // Setup hardware acceleration
 * const hw = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
 * using decoder = await Decoder.create(stream, { hardware: hw });
 *
 * // Frames will be decoded on GPU
 * for await (const frame of decoder.frames(packets)) {
 *   // frame.hwFramesCtx contains GPU memory reference
 * }
 * ```
 *
 * @see {@link Encoder} For encoding frames to packets
 * @see {@link MediaInput} For reading media files
 * @see {@link HardwareContext} For GPU acceleration
 */
export class Decoder implements Disposable {
  private codecContext: CodecContext;
  private codec: Codec;
  private frame: Frame;
  private stream: Stream;
  private initialized = true;
  private isClosed = false;
  private options: DecoderOptions;

  // Frame tracking for PTS/duration estimation
  private lastFramePts = AV_NOPTS_VALUE;
  private lastFrameDurationEst = 0n;
  private lastFrameTb: Rational;

  // Audio-specific frame tracking
  private lastFrameSampleRate = 0;
  private lastFilterInRescaleDelta = AV_NOPTS_VALUE;

  /**
   * @param codecContext - Configured codec context
   *
   * @param codec - Codec being used
   *
   * @param stream - Media stream being decoded
   *
   * @param options - Decoder options
   *
   * Use {@link create} factory method
   *
   * @internal
   */
  private constructor(codecContext: CodecContext, codec: Codec, stream: Stream, options: DecoderOptions = {}) {
    this.codecContext = codecContext;
    this.codec = codec;
    this.stream = stream;
    this.options = options;
    this.frame = new Frame();
    this.frame.alloc();
    this.lastFrameTb = new Rational(0, 1);
  }

  /**
   * Create a decoder for a media stream.
   *
   * Initializes a decoder with the appropriate codec and configuration.
   * Automatically detects and configures hardware acceleration if provided.
   * Applies custom codec options and threading configuration.
   *
   * @param stream - Media stream to decode
   *
   * @param options - Decoder configuration options
   *
   * @returns Configured decoder instance
   *
   * @throws {Error} If decoder not found for codec
   *
   * @throws {FFmpegError} If codec initialization fails
   *
   * @example
   * ```typescript
   * import { MediaInput, Decoder } from 'node-av/api';
   *
   * await using input = await MediaInput.open('video.mp4');
   * using decoder = await Decoder.create(input.video());
   * ```
   *
   * @example
   * ```typescript
   * using decoder = await Decoder.create(stream, {
   *   threads: 4,
   *   options: {
   *     'refcounted_frames': '1',
   *     'skip_frame': 'nonkey'  // Only decode keyframes
   *   }
   * });
   * ```
   *
   * @example
   * ```typescript
   * const hw = HardwareContext.auto();
   * using decoder = await Decoder.create(stream, {
   *   hardware: hw,
   *   threads: 0  // Auto-detect thread count
   *   exitOnError: false     // Continue on decode errors (default: true)
   * });
   * ```
   *
   * @example
   * ```typescript
   * using decoder = await Decoder.create(stream, FF_DECODER_H264_AMF, {
   *   hardware: hw,
   *   threads: 2,
   * });
   * ```
   *
   * @see {@link HardwareContext} For GPU acceleration setup
   * @see {@link DecoderOptions} For configuration options
   * @see {@link createSync} For synchronous version
   */
  static async create(stream: Stream, options?: DecoderOptions): Promise<Decoder>;
  static async create(stream: Stream, decoderCodec?: FFDecoderCodec | AVCodecID | Codec, options?: DecoderOptions): Promise<Decoder>;
  static async create(stream: Stream, optionsOrCodec?: DecoderOptions | FFDecoderCodec | AVCodecID | Codec, maybeOptions?: DecoderOptions): Promise<Decoder> {
    // Parse arguments
    let options: DecoderOptions = {};
    let explicitCodec: FFDecoderCodec | AVCodecID | Codec | undefined;

    if (optionsOrCodec !== undefined) {
      // Check if first argument is a codec or options
      if (
        typeof optionsOrCodec === 'string' || // FFDecoderCodec
        typeof optionsOrCodec === 'number' || // AVCodecID
        optionsOrCodec instanceof Codec // Codec instance
      ) {
        // First argument is a codec
        explicitCodec = optionsOrCodec;
        options = maybeOptions ?? {};
      } else {
        // First argument is options
        options = optionsOrCodec;
      }
    }

    let codec: Codec | null = null;

    // If explicit codec provided, use it
    if (explicitCodec !== undefined) {
      if (typeof explicitCodec === 'object' && 'id' in explicitCodec) {
        // Already a Codec instance
        codec = explicitCodec;
      } else if (typeof explicitCodec === 'string') {
        // FFDecoderCodec string
        codec = Codec.findDecoderByName(explicitCodec);
        if (!codec) {
          throw new Error(`Decoder '${explicitCodec}' not found`);
        }
      } else {
        // AVCodecID number
        codec = Codec.findDecoder(explicitCodec);
        if (!codec) {
          throw new Error(`Decoder not found for codec ID ${explicitCodec}`);
        }
      }
    } else {
      // No explicit codec - use auto-detection logic
      // If hardware acceleration requested, try to find hardware decoder first
      if (options.hardware) {
        codec = options.hardware.getDecoderCodec(stream.codecpar.codecId);
        if (!codec) {
          // No hardware decoder available, fall back to software
          options.hardware = undefined;
        }
      }

      // If no hardware decoder or no hardware requested, use software decoder
      if (!codec) {
        codec = Codec.findDecoder(stream.codecpar.codecId);
        if (!codec) {
          throw new Error(`Decoder not found for codec ${stream.codecpar.codecId}`);
        }
      }
    }

    // Allocate and configure codec context
    const codecContext = new CodecContext();
    codecContext.allocContext3(codec);

    // Copy codec parameters to context
    const ret = codecContext.parametersToContext(stream.codecpar);
    if (ret < 0) {
      codecContext.freeContext();
      FFmpegError.throwIfError(ret, 'Failed to copy codec parameters');
    }

    // Set packet time base
    codecContext.pktTimebase = stream.timeBase;

    // Check if this decoder supports hardware acceleration
    // Only apply hardware acceleration if the decoder supports it
    // Silently ignore hardware for software decoders
    const isHWDecoder = codec.isHardwareAcceleratedDecoder();
    if (isHWDecoder && options.hardware) {
      codecContext.hwDeviceCtx = options.hardware.deviceContext;

      // Set hardware pixel format
      codecContext.setHardwarePixelFormat(options.hardware.devicePixelFormat);

      // Set extra_hw_frames if specified
      if (options.extraHWFrames !== undefined && options.extraHWFrames > 0) {
        codecContext.extraHWFrames = options.extraHWFrames;
      }
    } else {
      options.hardware = undefined;
    }

    options.exitOnError = options.exitOnError ?? true;

    // Enable COPY_OPAQUE flag to copy packet.opaque to frame.opaque
    codecContext.setFlags(AV_CODEC_FLAG_COPY_OPAQUE);

    const opts = options.options ? Dictionary.fromObject(options.options) : undefined;

    // Open codec
    const openRet = await codecContext.open2(codec, opts);
    if (openRet < 0) {
      codecContext.freeContext();
      FFmpegError.throwIfError(openRet, 'Failed to open codec');
    }

    // Adjust extra_hw_frames for queuing
    // This is done AFTER open2 because the decoder validates extra_hw_frames during open
    if (isHWDecoder && options.hardware) {
      const currentExtraFrames = codecContext.extraHWFrames;
      if (currentExtraFrames >= 0) {
        codecContext.extraHWFrames = currentExtraFrames + 1; // DEFAULT_FRAME_THREAD_QUEUE_SIZE = 1
      } else {
        codecContext.extraHWFrames = 1;
      }
    }

    return new Decoder(codecContext, codec, stream, options);
  }

  /**
   * Create a decoder for a media stream synchronously.
   * Synchronous version of create.
   *
   * Initializes a decoder with the appropriate codec and configuration.
   * Automatically detects and configures hardware acceleration if provided.
   * Applies custom codec options and threading configuration.
   *
   * @param stream - Media stream to decode
   *
   * @param options - Decoder configuration options
   *
   * @returns Configured decoder instance
   *
   * @throws {Error} If decoder not found for codec
   *
   * @throws {FFmpegError} If codec initialization fails
   *
   * @example
   * ```typescript
   * import { MediaInput, Decoder } from 'node-av/api';
   *
   * await using input = await MediaInput.open('video.mp4');
   * using decoder = Decoder.createSync(input.video());
   * ```
   *
   * @example
   * ```typescript
   * using decoder = Decoder.createSync(stream, {
   *   threads: 4,
   *   options: {
   *     'refcounted_frames': '1',
   *     'skip_frame': 'nonkey'  // Only decode keyframes
   *   }
   * });
   * ```
   *
   * @example
   * ```typescript
   * const hw = HardwareContext.auto();
   * using decoder = Decoder.createSync(stream, {
   *   hardware: hw,
   *   threads: 0  // Auto-detect thread count
   * });
   * ```
   *
   * @example
   * ```typescript
   * using decoder = Decoder.createSync(stream, FF_DECODER_H264_NVDEC, {
   *   hardware: hw
   * });
   * ```
   *
   * @see {@link HardwareContext} For GPU acceleration setup
   * @see {@link DecoderOptions} For configuration options
   * @see {@link create} For async version
   */
  static createSync(stream: Stream, options?: DecoderOptions): Decoder;
  static createSync(stream: Stream, decoderCodec?: FFDecoderCodec | AVCodecID | Codec, options?: DecoderOptions): Decoder;
  static createSync(stream: Stream, optionsOrCodec?: DecoderOptions | FFDecoderCodec | AVCodecID | Codec, maybeOptions?: DecoderOptions): Decoder {
    // Parse arguments
    let options: DecoderOptions = {};
    let explicitCodec: FFDecoderCodec | AVCodecID | Codec | undefined;

    if (optionsOrCodec !== undefined) {
      // Check if first argument is a codec or options
      if (
        typeof optionsOrCodec === 'string' || // FFDecoderCodec
        typeof optionsOrCodec === 'number' || // AVCodecID
        optionsOrCodec instanceof Codec // Codec instance
      ) {
        // First argument is a codec
        explicitCodec = optionsOrCodec;
        options = maybeOptions ?? {};
      } else {
        // First argument is options
        options = optionsOrCodec;
      }
    }

    let codec: Codec | null = null;

    // If explicit codec provided, use it
    if (explicitCodec !== undefined) {
      if (typeof explicitCodec === 'object' && 'id' in explicitCodec) {
        // Already a Codec instance
        codec = explicitCodec;
      } else if (typeof explicitCodec === 'string') {
        // FFDecoderCodec string
        codec = Codec.findDecoderByName(explicitCodec);
        if (!codec) {
          throw new Error(`Decoder '${explicitCodec}' not found`);
        }
      } else {
        // AVCodecID number
        codec = Codec.findDecoder(explicitCodec);
        if (!codec) {
          throw new Error(`Decoder not found for codec ID ${explicitCodec}`);
        }
      }
    } else {
      // No explicit codec - use auto-detection logic
      // If hardware acceleration requested, try to find hardware decoder first
      if (options.hardware) {
        codec = options.hardware.getDecoderCodec(stream.codecpar.codecId);
        if (!codec) {
          // No hardware decoder available, fall back to software
          options.hardware = undefined;
        }
      }

      // If no hardware decoder or no hardware requested, use software decoder
      if (!codec) {
        codec = Codec.findDecoder(stream.codecpar.codecId);
        if (!codec) {
          throw new Error(`Decoder not found for codec ${stream.codecpar.codecId}`);
        }
      }
    }

    // Allocate and configure codec context
    const codecContext = new CodecContext();
    codecContext.allocContext3(codec);

    // Copy codec parameters to context
    const ret = codecContext.parametersToContext(stream.codecpar);
    if (ret < 0) {
      codecContext.freeContext();
      FFmpegError.throwIfError(ret, 'Failed to copy codec parameters');
    }

    // Set packet time base
    codecContext.pktTimebase = stream.timeBase;

    // Check if this decoder supports hardware acceleration
    // Only apply hardware acceleration if the decoder supports it
    // Silently ignore hardware for software decoders
    const isHWDecoder = codec.isHardwareAcceleratedDecoder();
    if (isHWDecoder && options.hardware) {
      codecContext.hwDeviceCtx = options.hardware.deviceContext;

      // Set hardware pixel format and get_format callback
      codecContext.setHardwarePixelFormat(options.hardware.devicePixelFormat);

      // Set extra_hw_frames if specified
      if (options.extraHWFrames !== undefined && options.extraHWFrames > 0) {
        codecContext.extraHWFrames = options.extraHWFrames;
      }
    } else {
      options.hardware = undefined;
    }

    options.exitOnError = options.exitOnError ?? true;

    // Enable COPY_OPAQUE flag to copy packet.opaque to frame.opaque
    // codecContext.setFlags(AV_CODEC_FLAG_COPY_OPAQUE);

    const opts = options.options ? Dictionary.fromObject(options.options) : undefined;

    // Open codec synchronously
    const openRet = codecContext.open2Sync(codec, opts);
    if (openRet < 0) {
      codecContext.freeContext();
      FFmpegError.throwIfError(openRet, 'Failed to open codec');
    }

    // Adjust extra_hw_frames for queuing
    // This is done AFTER open2 because the decoder validates extra_hw_frames during open
    if (isHWDecoder && options.hardware) {
      const currentExtraFrames = codecContext.extraHWFrames;
      if (currentExtraFrames >= 0) {
        codecContext.extraHWFrames = currentExtraFrames + 1; // DEFAULT_FRAME_THREAD_QUEUE_SIZE = 1
      } else {
        codecContext.extraHWFrames = 1;
      }
    }

    return new Decoder(codecContext, codec, stream, options);
  }

  /**
   * Check if decoder is open.
   *
   * @returns true if decoder is open and ready
   *
   * @example
   * ```typescript
   * if (decoder.isDecoderOpen) {
   *   const frame = await decoder.decode(packet);
   * }
   * ```
   */
  get isDecoderOpen(): boolean {
    return !this.isClosed;
  }

  /**
   * Check if decoder has been initialized.
   *
   * Returns true if decoder is initialized (true by default for decoders).
   * Decoders are pre-initialized from stream parameters.
   *
   * @returns true if decoder has been initialized
   *
   * @example
   * ```typescript
   * if (decoder.isDecoderInitialized) {
   *   console.log('Decoder is ready to process frames');
   * }
   * ```
   */
  get isDecoderInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if decoder uses hardware acceleration.
   *
   * @returns true if hardware-accelerated
   *
   * @example
   * ```typescript
   * if (decoder.isHardware()) {
   *   console.log('Using GPU acceleration');
   * }
   * ```
   *
   * @see {@link HardwareContext} For hardware setup
   */
  isHardware(): boolean {
    return !!this.options.hardware && this.codec.isHardwareAcceleratedDecoder();
  }

  /**
   * Check if decoder is ready for processing.
   *
   * @returns true if initialized and ready
   *
   * @example
   * ```typescript
   * if (decoder.isReady()) {
   *   const frame = await decoder.decode(packet);
   * }
   * ```
   */
  isReady(): boolean {
    return this.initialized && !this.isClosed;
  }

  /**
   * Decode a packet to a frame.
   *
   * Sends a packet to the decoder and attempts to receive a decoded frame.
   * Handles internal buffering - may return null if more packets needed.
   * Automatically manages decoder state and error recovery.
   *
   * **Note**: This method receives only ONE frame per call.
   * A single packet can produce multiple frames (e.g., packed B-frames, codec buffering).
   * To receive all frames from a packet, use {@link decodeAll} or {@link frames} instead.
   *
   * Direct mapping to avcodec_send_packet() and avcodec_receive_frame().
   *
   * @param packet - Compressed packet to decode
   *
   * @returns Decoded frame or null if more data needed or decoder is closed
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * const frame = await decoder.decode(packet);
   * if (frame) {
   *   console.log(`Decoded frame with PTS: ${frame.pts}`);
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * for await (const packet of input.packets()) {
   *   if (packet.streamIndex === decoder.getStream().index) {
   *     const frame = await decoder.decode(packet);
   *     if (frame) {
   *       await processFrame(frame);
   *       frame.free();
   *     }
   *   }
   *   packet.free();
   * }
   * ```
   *
   * @see {@link decodeAll} For multiple frame decoding
   * @see {@link frames} For automatic packet iteration
   * @see {@link flush} For end-of-stream handling
   * @see {@link decodeSync} For synchronous version
   */
  async decode(packet: Packet): Promise<Frame | null> {
    if (this.isClosed) {
      return null;
    }

    // Skip 0-sized packets
    if (packet.size === 0) {
      return null;
    }

    // Send packet to decoder
    const sendRet = await this.codecContext.sendPacket(packet);

    // Handle EAGAIN: decoder buffer is full, need to read frames first
    // Unlike FFmpeg CLI which reads ALL frames in a loop, our decode() returns
    // only one frame at a time. This means the decoder can still have frames
    // from previous packets when we try to send a new packet.
    if (sendRet === AVERROR_EAGAIN) {
      // Decoder buffer full, receive a frame first
      const frame = await this.receive();
      if (frame) {
        return frame;
      }
      // If receive() returned null, this is unexpected - treat as decoder bug
      throw new Error('Decoder returned EAGAIN on send but no frame available - decoder bug');
    }

    // Handle other send errors (matches FFmpeg's error handling)
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      if (this.options.exitOnError) {
        FFmpegError.throwIfError(sendRet, 'Failed to send packet to decoder');
      }
      // exitOnError=false: Continue to receive (like FFmpeg)
    }

    // Try to receive frame
    return await this.receive();
  }

  /**
   * Decode a packet to frame synchronously.
   * Synchronous version of decode.
   *
   * Send packet to decoder and attempt to receive frame.
   * Handles decoder buffering and error conditions.
   * May return null if decoder needs more data.
   *
   * **Note**: This method receives only ONE frame per call.
   * A single packet can produce multiple frames (e.g., packed B-frames, codec buffering).
   * To receive all frames from a packet, use {@link decodeAllSync} or {@link framesSync} instead.
   *
   * @param packet - Compressed packet to decode
   *
   * @returns Decoded frame or null if more data needed or decoder is closed
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * const frame = decoder.decodeSync(packet);
   * if (frame) {
   *   console.log(`Decoded: ${frame.width}x${frame.height}`);
   * }
   * ```
   *
   * @see {@link decodeAllSync} For multiple frame decoding
   * @see {@link framesSync} For automatic packet iteration
   * @see {@link flushSync} For end-of-stream handling
   * @see {@link decode} For async version
   */
  decodeSync(packet: Packet): Frame | null {
    if (this.isClosed) {
      return null;
    }

    // Skip 0-sized packets
    if (packet.size === 0) {
      return null;
    }

    // Send packet to decoder
    const sendRet = this.codecContext.sendPacketSync(packet);

    // Handle EAGAIN: decoder buffer is full, need to read frames first
    // Unlike FFmpeg CLI which reads ALL frames in a loop, our decode() returns
    // only one frame at a time. This means the decoder can still have frames
    // from previous packets when we try to send a new packet.
    if (sendRet === AVERROR_EAGAIN) {
      // Decoder buffer full, receive a frame first
      const frame = this.receiveSync();
      if (frame) {
        return frame;
      }
      // If receive() returned null, this is unexpected - treat as decoder bug
      throw new Error('Decoder returned EAGAIN on send but no frame available - decoder bug');
    }

    // Handle other send errors
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      if (this.options.exitOnError) {
        FFmpegError.throwIfError(sendRet, 'Failed to send packet to decoder');
      }
      // exitOnError=false: Continue to receive
    }

    // Try to receive frame
    return this.receiveSync();
  }

  /**
   * Decode a packet to frames.
   *
   * Sends a packet to the decoder and receives all available decoded frames.
   * Returns array of frames - may be empty if decoder needs more data.
   * One packet can produce zero, one, or multiple frames depending on codec.
   * Automatically manages decoder state and error recovery.
   *
   * Direct mapping to avcodec_send_packet() and avcodec_receive_frame().
   *
   * @param packet - Compressed packet to decode
   *
   * @returns Array of decoded frames (empty if more data needed or decoder is closed)
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * const frames = await decoder.decodeAll(packet);
   * for (const frame of frames) {
   *   console.log(`Decoded frame with PTS: ${frame.pts}`);
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * for await (const packet of input.packets()) {
   *   if (packet.streamIndex === decoder.getStream().index) {
   *     const frames = await decoder.decodeAll(packet);
   *     for (const frame of frames) {
   *       await processFrame(frame);
   *       frame.free();
   *     }
   *   }
   *   packet.free();
   * }
   * ```
   *
   * @see {@link decode} For single packet decoding
   * @see {@link frames} For automatic packet iteration
   * @see {@link flush} For end-of-stream handling
   * @see {@link decodeAllSync} For synchronous version
   */
  async decodeAll(packet: Packet): Promise<Frame[]> {
    if (this.isClosed) {
      return [];
    }

    // Skip 0-sized packets
    if (packet.size === 0) {
      return [];
    }

    // Send packet to decoder
    const sendRet = await this.codecContext.sendPacket(packet);

    // EAGAIN during send_packet is a decoder bug (FFmpeg treats this as AVERROR_BUG)
    // We read all decoded frames with receive() until done, so decoder should never be full
    if (sendRet === AVERROR_EAGAIN) {
      throw new Error('Decoder returned EAGAIN on send - this is a decoder bug');
    }

    // Handle send errors
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      if (this.options.exitOnError) {
        FFmpegError.throwIfError(sendRet, 'Failed to send packet to decoder');
      }
      // exitOnError=false: Continue to receive loop to drain any buffered frames
    }

    // Receive all available frames
    const frames: Frame[] = [];
    while (!this.isClosed) {
      const remaining = await this.receive();
      if (!remaining) break;
      frames.push(remaining);
    }
    return frames;
  }

  /**
   * Decode a packet to frames synchronously.
   * Synchronous version of decodeAll.
   *
   * Sends packet to decoder and receives all available decoded frames.
   * Returns array of frames - may be empty if decoder needs more data.
   * One packet can produce zero, one, or multiple frames depending on codec.
   *
   * @param packet - Compressed packet to decode
   *
   * @returns Array of decoded frames (empty if more data needed or decoder is closed)
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * const frames = decoder.decodeAllSync(packet);
   * for (const frame of frames) {
   *   console.log(`Decoded: ${frame.width}x${frame.height}`);
   *   frame.free();
   * }
   * ```
   *
   * @see {@link decodeSync} For single packet decoding
   * @see {@link framesSync} For automatic packet iteration
   * @see {@link flushSync} For end-of-stream handling
   * @see {@link decodeAll} For async version
   */
  decodeAllSync(packet: Packet): Frame[] {
    if (this.isClosed) {
      return [];
    }

    // Skip 0-sized packets
    if (packet.size === 0) {
      return [];
    }

    // Send packet to decoder
    const sendRet = this.codecContext.sendPacketSync(packet);

    // EAGAIN during send_packet is a decoder bug (FFmpeg treats this as AVERROR_BUG)
    // We read all decoded frames with receive() until done, so decoder should never be full
    if (sendRet === AVERROR_EAGAIN) {
      throw new Error('Decoder returned EAGAIN on send - this is a decoder bug');
    }

    // Handle send errors
    if (sendRet < 0 && sendRet !== AVERROR_EOF) {
      if (this.options.exitOnError) {
        FFmpegError.throwIfError(sendRet, 'Failed to send packet to decoder');
      }
      // exitOnError=false: Continue to receive loop to drain any buffered frames
    }

    // Receive all available frames
    const frames: Frame[] = [];
    while (!this.isClosed) {
      const remaining = this.receiveSync();
      if (!remaining) break;
      frames.push(remaining);
    }
    return frames;
  }

  /**
   * Decode packet stream to frame stream.
   *
   * High-level async generator for complete decoding pipeline.
   * Automatically filters packets for this stream, manages memory,
   * and flushes buffered frames at end.
   * Primary interface for stream-based decoding.
   *
   * @param packets - Async iterable of packets
   *
   * @yields {Frame} Decoded frames
   *
   * @throws {Error} If decoder is closed
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * await using input = await MediaInput.open('video.mp4');
   * using decoder = await Decoder.create(input.video());
   *
   * for await (const frame of decoder.frames(input.packets())) {
   *   console.log(`Frame: ${frame.width}x${frame.height}`);
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * for await (const frame of decoder.frames(input.packets())) {
   *   // Process frame
   *   await filter.process(frame);
   *
   *   // Frame automatically freed
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
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
   * @see {@link decode} For single packet decoding
   * @see {@link MediaInput.packets} For packet source
   * @see {@link framesSync} For sync version
   */
  async *frames(packets: AsyncIterable<Packet>): AsyncGenerator<Frame> {
    for await (using packet of packets) {
      // Only process packets for our stream
      if (packet.streamIndex === this.stream.index) {
        if (this.isClosed) {
          break;
        }

        // Skip 0-sized packets
        if (packet.size === 0) {
          continue;
        }

        // Send packet to decoder
        const sendRet = await this.codecContext.sendPacket(packet);

        // EAGAIN during send_packet is a decoder bug
        // We read all decoded frames with receive() until done, so decoder should never be full
        if (sendRet === AVERROR_EAGAIN) {
          throw new Error('Decoder returned EAGAIN but no frame available');
        }

        if (sendRet < 0 && sendRet !== AVERROR_EOF) {
          if (this.options.exitOnError) {
            FFmpegError.throwIfError(sendRet, 'Failed to send packet');
          }
        }

        // Receive ALL available frames immediately
        // This ensures frames are yielded ASAP without latency
        while (!this.isClosed) {
          const frame = await this.receive();
          if (!frame) break; // EAGAIN or EOF
          yield frame;
        }
      }
    }

    // Flush decoder after all packets
    await this.flush();
    while (!this.isClosed) {
      const remaining = await this.receive();
      if (!remaining) break;
      yield remaining;
    }
  }

  /**
   * Decode packet stream to frame stream synchronously.
   * Synchronous version of frames.
   *
   * High-level sync generator for complete decoding pipeline.
   * Automatically filters packets for this stream, manages memory,
   * and flushes buffered frames at end.
   *
   * @param packets - Iterable of packets
   *
   * @yields {Frame} Decoded frames
   *
   * @throws {Error} If decoder is closed
   *
   * @throws {FFmpegError} If decoding fails
   *
   * @example
   * ```typescript
   * for (const frame of decoder.framesSync(packets)) {
   *   console.log(`Frame: ${frame.width}x${frame.height}`);
   *   // Process frame...
   * }
   * ```
   *
   * @see {@link decodeSync} For single packet decoding
   * @see {@link MediaInput.packetsSync} For packet source
   * @see {@link frames} For async version
   */
  *framesSync(packets: Iterable<Packet>): Generator<Frame> {
    for (using packet of packets) {
      // Only process packets for our stream
      if (packet.streamIndex === this.stream.index) {
        if (this.isClosed) {
          break;
        }

        // Skip 0-sized packets
        if (packet.size === 0) {
          continue;
        }

        // Send packet to decoder
        const sendRet = this.codecContext.sendPacketSync(packet);

        // EAGAIN during send_packet is a decoder bug
        // We read all decoded frames with receive() until done, so decoder should never be full
        if (sendRet === AVERROR_EAGAIN) {
          throw new Error('Decoder returned EAGAIN but no frame available');
        }

        if (sendRet < 0 && sendRet !== AVERROR_EOF) {
          if (this.options.exitOnError) {
            FFmpegError.throwIfError(sendRet, 'Failed to send packet');
          }
        }

        // Receive ALL available frames immediately
        // This ensures frames are yielded ASAP without latency
        while (!this.isClosed) {
          const frame = this.receiveSync();
          if (!frame) break; // EAGAIN or EOF
          yield frame;
        }
      }
    }

    // Flush decoder after all packets
    this.flushSync();
    while (!this.isClosed) {
      const remaining = this.receiveSync();
      if (!remaining) break;
      yield remaining;
    }
  }

  /**
   * Flush decoder and signal end-of-stream.
   *
   * Sends null packet to decoder to signal end-of-stream.
   * Does nothing if decoder is closed.
   * Must use receive() or flushFrames() to get remaining buffered frames.
   *
   * Direct mapping to avcodec_send_packet(NULL).
   *
   * @throws {FFmpegError} If flush fails
   *
   * @example
   * ```typescript
   * // Signal end of stream
   * await decoder.flush();
   *
   * // Then get remaining frames
   * let frame;
   * while ((frame = await decoder.receive()) !== null) {
   *   console.log('Got buffered frame');
   *   frame.free();
   * }
   * ```
   *
   * @see {@link flushFrames} For convenient async iteration
   * @see {@link receive} For getting buffered frames
   * @see {@link flushSync} For synchronous version
   */
  async flush(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    // Send flush packet (null)
    const ret = await this.codecContext.sendPacket(null);
    if (ret < 0 && ret !== AVERROR_EOF) {
      if (ret !== AVERROR_EAGAIN) {
        FFmpegError.throwIfError(ret, 'Failed to flush decoder');
      }
    }
  }

  /**
   * Flush decoder and signal end-of-stream synchronously.
   * Synchronous version of flush.
   *
   * Send null packet to signal end of input stream.
   * Decoder may still have buffered frames.
   * Call receiveSync() repeatedly to get remaining frames.
   *
   * @throws {FFmpegError} If flush fails
   *
   * @example
   * ```typescript
   * decoder.flushSync();
   * // Get remaining frames
   * let frame;
   * while ((frame = decoder.receiveSync()) !== null) {
   *   console.log('Buffered frame');
   * }
   * ```
   *
   * @see {@link flushFramesSync} For convenient sync iteration
   * @see {@link receiveSync} For getting buffered frames
   * @see {@link flush} For async version
   */
  flushSync(): void {
    if (this.isClosed) {
      return;
    }

    // Send flush packet (null)
    const ret = this.codecContext.sendPacketSync(null);
    if (ret < 0 && ret !== AVERROR_EOF) {
      if (ret !== AVERROR_EAGAIN) {
        FFmpegError.throwIfError(ret, 'Failed to flush decoder');
      }
    }
  }

  /**
   * Flush all buffered frames as async generator.
   *
   * Convenient async iteration over remaining frames.
   * Automatically sends flush signal and retrieves buffered frames.
   * Useful for end-of-stream processing.
   *
   * @yields {Frame} Buffered frames
   *
   * @example
   * ```typescript
   * // Flush at end of decoding
   * for await (const frame of decoder.flushFrames()) {
   *   console.log('Processing buffered frame');
   *   await encoder.encode(frame);
   *   frame.free();
   * }
   * ```
   *
   * @see {@link decode} For sending packets and receiving frames
   * @see {@link flush} For signaling end-of-stream
   * @see {@link flushFramesSync} For synchronous version
   */
  async *flushFrames(): AsyncGenerator<Frame> {
    // Send flush signal
    await this.flush();

    while (!this.isClosed) {
      const remaining = await this.receive();
      if (!remaining) break;
      yield remaining;
    }
  }

  /**
   * Flush all buffered frames as generator synchronously.
   * Synchronous version of flushFrames.
   *
   * Convenient sync iteration over remaining frames.
   * Automatically sends flush signal and retrieves buffered frames.
   * Useful for end-of-stream processing.
   *
   * @yields {Frame} Buffered frames
   *
   * @example
   * ```typescript
   * // Flush at end of decoding
   * for (const frame of decoder.flushFramesSync()) {
   *   console.log('Processing buffered frame');
   *   encoder.encodeSync(frame);
   *   frame.free();
   * }
   * ```
   *
   * @see {@link decodeSync} For sending packets and receiving frames
   * @see {@link flushSync} For signaling end-of-stream
   * @see {@link flushFrames} For async version
   */
  *flushFramesSync(): Generator<Frame> {
    // Send flush signal
    this.flushSync();

    while (!this.isClosed) {
      const remaining = this.receiveSync();
      if (!remaining) break;
      yield remaining;
    }
  }

  /**
   * Receive frame from decoder.
   *
   * Gets decoded frames from the codec's internal buffer.
   * Handles frame cloning and error checking.
   * Hardware frames include hw_frames_ctx reference.
   * Call repeatedly until null to drain all buffered frames.
   *
   * Direct mapping to avcodec_receive_frame().
   *
   * @returns Cloned frame or null if no frames available
   *
   * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
   *
   * @example
   * ```typescript
   * const frame = await decoder.receive();
   * if (frame) {
   *   console.log('Got decoded frame');
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Drain all buffered frames
   * let frame;
   * while ((frame = await decoder.receive()) !== null) {
   *   console.log(`Frame PTS: ${frame.pts}`);
   *   frame.free();
   * }
   * ```
   *
   * @see {@link decode} For sending packets and receiving frames
   * @see {@link flush} For signaling end-of-stream
   * @see {@link receiveSync} For synchronous version
   */
  async receive(): Promise<Frame | null> {
    if (this.isClosed) {
      return null;
    }

    // When exitOnError=false, continue on errors until we get a frame or EAGAIN/EOF
    while (!this.isClosed) {
      // Clear previous frame data
      this.frame.unref();

      const ret = await this.codecContext.receiveFrame(this.frame);

      if (ret === 0) {
        // Set frame time_base to decoder's packet timebase
        this.frame.timeBase = this.codecContext.pktTimebase;

        // Check for corrupt frame
        if (this.frame.decodeErrorFlags || this.frame.hasFlags(AV_FRAME_FLAG_CORRUPT)) {
          if (this.options.exitOnError) {
            throw new Error('Corrupt decoded frame detected');
          }
          // exitOnError=false: skip corrupt frame, continue to next
          continue;
        }

        // Handles PTS assignment, duration estimation, and frame tracking
        if (this.codecContext.codecType === AVMEDIA_TYPE_VIDEO) {
          this.processVideoFrame(this.frame);
        }

        // Handles timestamp extrapolation, sample rate changes, and duration calculation
        if (this.codecContext.codecType === AVMEDIA_TYPE_AUDIO) {
          this.processAudioFrame(this.frame);
        }

        // Got a frame, clone it for the user
        return this.frame.clone();
      } else if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
        // Need more data or end of stream
        return null;
      } else {
        // Error during receive
        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Failed to receive frame');
        }
        // exitOnError=false: continue to next frame
        continue;
      }
    }

    return null;
  }

  /**
   * Receive frame from decoder synchronously.
   * Synchronous version of receive.
   *
   * Gets decoded frames from the codec's internal buffer.
   * Handles frame cloning and error checking.
   * Hardware frames include hw_frames_ctx reference.
   * Call repeatedly until null to drain all buffered frames.
   *
   * Direct mapping to avcodec_receive_frame().
   *
   * @returns Cloned frame or null if no frames available
   *
   * @throws {FFmpegError} If receive fails with error other than AVERROR_EAGAIN or AVERROR_EOF
   *
   * @example
   * ```typescript
   * const frame = decoder.receiveSync();
   * if (frame) {
   *   console.log('Got decoded frame');
   *   frame.free();
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Drain all buffered frames
   * let frame;
   * while ((frame = decoder.receiveSync()) !== null) {
   *   console.log(`Frame PTS: ${frame.pts}`);
   *   frame.free();
   * }
   * ```
   *
   * @see {@link decodeSync} For sending packets and receiving frames
   * @see {@link flushSync} For signaling end-of-stream
   * @see {@link receive} For async version
   */
  receiveSync(): Frame | null {
    if (this.isClosed) {
      return null;
    }

    // When exitOnError=false, continue on errors until we get a frame or EAGAIN/EOF
    while (!this.isClosed) {
      // Clear previous frame data
      this.frame.unref();

      const ret = this.codecContext.receiveFrameSync(this.frame);

      if (ret === 0) {
        // Set frame time_base to decoder's packet timebase
        this.frame.timeBase = this.codecContext.pktTimebase;

        // Check for corrupt frame
        if (this.frame.decodeErrorFlags || this.frame.hasFlags(AV_FRAME_FLAG_CORRUPT)) {
          if (this.options.exitOnError) {
            throw new Error('Corrupt decoded frame detected');
          }
          // exitOnError=false: skip corrupt frame, continue to next
          continue;
        }

        // Process video frame
        // Handles PTS assignment, duration estimation, and frame tracking
        if (this.codecContext.codecType === AVMEDIA_TYPE_VIDEO) {
          this.processVideoFrame(this.frame);
        }

        // Process audio frame
        // Handles timestamp extrapolation, sample rate changes, and duration calculation
        if (this.codecContext.codecType === AVMEDIA_TYPE_AUDIO) {
          this.processAudioFrame(this.frame);
        }

        // Got a frame, clone it for the user
        return this.frame.clone();
      } else if (ret === AVERROR_EAGAIN || ret === AVERROR_EOF) {
        // Need more data or end of stream
        return null;
      } else {
        // Error during receive
        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Failed to receive frame');
        }
        // exitOnError=false: continue to next frame
        continue;
      }
    }

    return null;
  }

  /**
   * Close decoder and free resources.
   *
   * Releases codec context and internal frame buffer.
   * Safe to call multiple times.
   * Automatically called by Symbol.dispose.
   *
   * @example
   * ```typescript
   * const decoder = await Decoder.create(stream);
   * try {
   *   // Use decoder
   * } finally {
   *   decoder.close();
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

    this.frame.free();
    this.codecContext.freeContext();

    this.initialized = false;
  }

  /**
   * Get stream object.
   *
   * Returns the underlying stream being decoded.
   * Provides access to stream metadata and parameters.
   *
   * @returns Stream object
   *
   * @internal
   *
   * @see {@link Stream} For stream details
   */
  getStream(): Stream {
    return this.stream;
  }

  /**
   * Get decoder codec.
   *
   * Returns the codec used by this decoder.
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
   * Returns null if decoder is closed.
   *
   * @returns Codec context or null if closed
   *
   * @internal
   *
   * @see {@link CodecContext} For context details
   */
  getCodecContext(): CodecContext | null {
    return !this.isClosed && this.initialized ? this.codecContext : null;
  }

  /**
   * Estimate video frame duration.
   *
   * Implements FFmpeg CLI's video_duration_estimate() logic.
   * Uses multiple heuristics to determine frame duration when not explicitly available:
   * 1. Frame duration from container (if reliable)
   * 2. Duration from codec framerate
   * 3. PTS difference between frames
   * 4. Stream framerate
   * 5. Last frame's estimated duration
   *
   * @param frame - Frame to estimate duration for
   *
   * @returns Estimated duration in frame's timebase units
   *
   * @internal
   */
  private estimateVideoDuration(frame: Frame): bigint {
    // Difference between this and last frame's timestamps
    const tsDiff = frame.pts !== AV_NOPTS_VALUE && this.lastFramePts !== AV_NOPTS_VALUE ? frame.pts - this.lastFramePts : -1n;

    // Frame duration is unreliable (typically guessed by lavf) when it is equal
    // to 1 and the actual duration of the last frame is more than 2x larger
    const durationUnreliable = frame.duration === 1n && tsDiff > 2n * frame.duration;

    // Prefer frame duration for containers with timestamps
    if (frame.duration > 0n && !durationUnreliable) {
      return frame.duration;
    }

    // Calculate codec duration from framerate
    let codecDuration = 0n;
    const framerate = this.codecContext.framerate;
    if (framerate && framerate.den > 0 && framerate.num > 0) {
      const fields = (frame.repeatPict ?? 0) + 2;
      const fieldRate = avMulQ(framerate, { num: 2, den: 1 });
      codecDuration = avRescaleQ(fields, avInvQ(fieldRate), frame.timeBase);
    }

    // When timestamps are available, repeat last frame's actual duration
    if (tsDiff > 0n) {
      return tsDiff;
    }

    // Try frame/codec duration
    if (frame.duration > 0n) {
      return frame.duration;
    }
    if (codecDuration > 0n) {
      return codecDuration;
    }

    // Try stream framerate
    const streamFramerate = this.stream.avgFrameRate ?? this.stream.rFrameRate;
    if (streamFramerate && streamFramerate.num > 0 && streamFramerate.den > 0) {
      const d = avRescaleQ(1, avInvQ(streamFramerate), frame.timeBase);
      if (d > 0n) {
        return d;
      }
    }

    // Last resort is last frame's estimated duration, and 1
    return this.lastFrameDurationEst > 0n ? this.lastFrameDurationEst : 1n;
  }

  /**
   * Process video frame after decoding.
   *
   * Implements FFmpeg CLI's video_frame_process() logic.
   * Handles:
   * - Hardware frame transfer to software format
   * - PTS assignment from best_effort_timestamp
   * - PTS extrapolation when missing
   * - Duration estimation
   * - Frame tracking for next frame
   *
   * @param frame - Decoded frame to process
   *
   * @internal
   */
  private processVideoFrame(frame: Frame): void {
    // Hardware acceleration retrieve
    // If hwaccel_output_format is set and frame is in hardware format, transfer to software format
    if (this.options.hwaccelOutputFormat !== undefined && frame.isHwFrame()) {
      const swFrame = new Frame();
      swFrame.alloc();
      swFrame.format = this.options.hwaccelOutputFormat;

      // Transfer data from hardware to software frame
      const ret = frame.hwframeTransferDataSync(swFrame, 0);
      if (ret < 0) {
        swFrame.free();
        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Failed to transfer hardware frame data');
        }
        return;
      }

      // Copy properties from hw frame to sw frame
      swFrame.copyProps(frame);

      // Replace frame with software version (unref old, move ref)
      frame.unref();
      const refRet = frame.ref(swFrame);
      swFrame.free();

      if (refRet < 0) {
        if (this.options.exitOnError) {
          FFmpegError.throwIfError(refRet, 'Failed to reference software frame');
        }
        return;
      }
    }

    // Set PTS from best_effort_timestamp
    frame.pts = frame.bestEffortTimestamp;

    // DECODER_FLAG_FRAMERATE_FORCED: Ignores all timestamps and generates constant framerate
    if (this.options.forcedFramerate) {
      frame.pts = AV_NOPTS_VALUE;
      frame.duration = 1n;
      const invFramerate = avInvQ(this.options.forcedFramerate);
      frame.timeBase = new Rational(invFramerate.num, invFramerate.den);
    }

    // No timestamp available - extrapolate from previous frame duration
    if (frame.pts === AV_NOPTS_VALUE) {
      frame.pts = this.lastFramePts === AV_NOPTS_VALUE ? 0n : this.lastFramePts + this.lastFrameDurationEst;
    }

    // Update timestamp history
    this.lastFrameDurationEst = this.estimateVideoDuration(frame);
    this.lastFramePts = frame.pts;
    this.lastFrameTb = new Rational(frame.timeBase.num, frame.timeBase.den);

    // SAR override
    if (this.options.sarOverride) {
      frame.sampleAspectRatio = new Rational(this.options.sarOverride.num, this.options.sarOverride.den);
    }

    // Apply cropping
    if (this.options.applyCropping) {
      const ret = frame.applyCropping(1); // AV_FRAME_CROP_UNALIGNED = 1
      if (ret < 0) {
        if (this.options.exitOnError) {
          FFmpegError.throwIfError(ret, 'Error applying decoder cropping');
        }
      }
    }
  }

  /**
   * Audio samplerate update - handles sample rate changes.
   *
   * Based on FFmpeg's audio_samplerate_update().
   *
   * On sample rate change, chooses a new internal timebase that can represent
   * timestamps from all sample rates seen so far. Uses GCD to find minimal
   * common timebase, with fallback to LCM of common sample rates (28224000).
   *
   * Handles:
   * - Sample rate change detection
   * - Timebase calculation via GCD
   * - Overflow detection and fallback
   * - Frame timebase optimization
   * - Rescaling existing timestamps
   *
   * @param frame - Audio frame to process
   *
   * @returns Timebase to use for this frame
   *
   * @internal
   */
  private audioSamplerateUpdate(frame: Frame): IRational {
    const prev = this.lastFrameTb.den;
    const sr = frame.sampleRate;

    // No change - return existing timebase
    if (frame.sampleRate === this.lastFrameSampleRate) {
      return this.lastFrameTb;
    }

    // Calculate GCD to find minimal common timebase
    const gcd = avGcd(prev, sr);

    let tbNew: IRational;

    // Check for overflow
    if (Number(prev) / Number(gcd) >= INT_MAX / sr) {
      // LCM of 192000, 44100 - represents all common sample rates
      tbNew = { num: 1, den: 28224000 };
    } else {
      // Normal case
      tbNew = { num: 1, den: (Number(prev) / Number(gcd)) * sr };
    }

    // Keep frame's timebase if strictly better
    // "Strictly better" means: num=1, den > tbNew.den, and tbNew.den divides den evenly
    if (frame.timeBase.num === 1 && frame.timeBase.den > tbNew.den && frame.timeBase.den % tbNew.den === 0) {
      tbNew = { num: frame.timeBase.num, den: frame.timeBase.den };
    }

    // Rescale existing timestamps to new timebase
    if (this.lastFramePts !== AV_NOPTS_VALUE) {
      this.lastFramePts = avRescaleQ(this.lastFramePts, this.lastFrameTb, tbNew);
    }

    this.lastFrameDurationEst = avRescaleQ(this.lastFrameDurationEst, this.lastFrameTb, tbNew);

    this.lastFrameTb = new Rational(tbNew.num, tbNew.den);
    this.lastFrameSampleRate = frame.sampleRate;

    return this.lastFrameTb;
  }

  /**
   * Audio timestamp processing - handles audio frame timestamps.
   *
   * Based on FFmpeg's audio_ts_process().
   *
   * Processes audio frame timestamps with:
   * - Sample rate change handling via audioSamplerateUpdate()
   * - PTS extrapolation when missing (pts_pred)
   * - Gap detection (resets av_rescale_delta state)
   * - Smooth timestamp conversion via av_rescale_delta
   * - Duration calculation from nb_samples
   * - Conversion to filtering timebase {1, sample_rate}
   *
   * Handles:
   * - Dynamic sample rate changes
   * - Missing timestamps (AV_NOPTS_VALUE)
   * - Timestamp gaps/discontinuities
   * - Sample-accurate timestamp generation
   * - Frame duration calculation
   *
   * @param frame - Decoded audio frame to process
   *
   * @internal
   */
  private processAudioFrame(frame: Frame): void {
    // Filtering timebase is always {1, sample_rate} for audio
    const tbFilter: IRational = { num: 1, den: frame.sampleRate };

    // Handle sample rate change - updates internal timebase
    const tb = this.audioSamplerateUpdate(frame);

    // Predict next PTS based on last frame + duration
    const ptsPred = this.lastFramePts === AV_NOPTS_VALUE ? 0n : this.lastFramePts + this.lastFrameDurationEst;

    // No timestamp - use predicted value
    if (frame.pts === AV_NOPTS_VALUE) {
      frame.pts = ptsPred;
      frame.timeBase = new Rational(tb.num, tb.den);
    } else if (this.lastFramePts !== AV_NOPTS_VALUE) {
      // Detect timestamp gap - compare with predicted timestamp
      const ptsPredInFrameTb = avRescaleQRnd(ptsPred, tb, frame.timeBase, AV_ROUND_UP);
      if (frame.pts > ptsPredInFrameTb) {
        // Gap detected - reset rescale_delta state for smooth conversion
        this.lastFilterInRescaleDelta = AV_NOPTS_VALUE;
      }
    }

    // Smooth timestamp conversion with av_rescale_delta
    // This maintains fractional sample accuracy across timebase conversions
    // avRescaleDelta modifies lastRef in place (simulates C's &last_filter_in_rescale_delta)
    const lastRef = { value: this.lastFilterInRescaleDelta };
    frame.pts = avRescaleDelta(frame.timeBase, frame.pts, tb, frame.nbSamples, lastRef, tb);
    this.lastFilterInRescaleDelta = lastRef.value;

    // Update frame tracking
    this.lastFramePts = frame.pts;
    this.lastFrameDurationEst = avRescaleQ(BigInt(frame.nbSamples), tbFilter, tb);

    // Convert to filtering timebase
    frame.pts = avRescaleQ(frame.pts, tb, tbFilter);
    frame.duration = BigInt(frame.nbSamples);
    frame.timeBase = new Rational(tbFilter.num, tbFilter.den);
  }

  /**
   * Dispose of decoder.
   *
   * Implements Disposable interface for automatic cleanup.
   * Equivalent to calling close().
   *
   * @example
   * ```typescript
   * {
   *   using decoder = await Decoder.create(stream);
   *   // Decode frames...
   * } // Automatically closed
   * ```
   *
   * @see {@link close} For manual cleanup
   */
  [Symbol.dispose](): void {
    this.close();
  }
}
