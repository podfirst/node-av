/**
 * Common TypeScript type definitions
 *
 * Types that are used across multiple modules but are not
 * directly from FFmpeg constants.
 */

import type { AVCodecID, AVLogLevel, AVMediaType, AVPixelFormat, AVSampleFormat } from '../constants/constants.ts';

/**
 * Rational number (fraction) interface
 * Maps to AVRational in FFmpeg
 * Used for time bases, aspect ratios, frame rates
 */
export interface IRational {
  /** Numerator */
  num: number;

  /** Denominator */
  den: number;
}

/**
 * Video dimension interface
 */
export interface IDimension {
  /** Width in pixels */
  width: number;

  /** Height in pixels */
  height: number;
}

/**
 * Audio channel layout description
 * Maps to AVChannelLayout in FFmpeg
 */
export interface ChannelLayout {
  /** Number of channels */
  nbChannels: number;

  /** Channel order (AVChannelOrder) */
  order: number;

  /** Channel mask for native layouts */
  mask: bigint;
}

/**
 * Filter pad information
 */
export interface FilterPad {
  /** Name of the pad (e.g., "in", "out") */
  name: string | null;

  /** Media type of the pad (e.g., "video", "audio") */
  type: AVMediaType;
}

/**
 * Codec profile definition
 */
export interface CodecProfile {
  /** Profile ID (FF_PROFILE_*) */
  profile: number;

  /** Human-readable profile name */
  name?: string;
}

/**
 * Log callback options for performance tuning.
 */
export interface LogOptions {
  /**
   * Maximum log level to capture.
   * Messages above this level are ignored at the C level for maximum performance.
   * Default: AV_LOG_INFO
   */
  maxLevel?: AVLogLevel;
}

/**
 * Image output format
 */
export type ImageOutputFormat = 'nv12' | 'yuv420p' | 'rgb' | 'rgba' | 'gray';

/**
 * Image cropping options
 */
export interface ImageCrop {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Image resizing options
 */
export interface ImageResize {
  width: number;
  height: number;
}

/**
 * Image format conversion options
 */
export interface ImageFormat {
  to: ImageOutputFormat;
}

/**
  Image processing options
 */
export interface ImageOptions {
  format?: ImageFormat;
  crop?: ImageCrop;
  resize?: ImageResize;
}

/**
 * Video Frame
 */
export interface VideoFrame {
  width: number;
  height: number;
  format: AVPixelFormat;
  timeBase?: IRational;
  sampleAspectRatio?: IRational;
  pts?: bigint;
}

/**
 * Audio Frame
 */
export interface AudioFrame {
  nbSamples: number;
  format: AVSampleFormat;
  sampleRate: number;
  channelLayout: ChannelLayout;
  timeBase?: IRational;
  pts?: bigint;
}

/**
 * RTSP stream information interface
 * Maps to RTSPStreamInfo returned by FormatContext.getRTSPStreamInfo()
 */
export interface RTSPStreamInfo {
  streamIndex: number;
  controlUrl: string;
  transport: 'tcp' | 'udp' | 'udp_multicast' | 'unknown';
  payloadType: number;
  codecId: AVCodecID;
  mediaType: 'video' | 'audio' | 'data' | 'subtitle' | 'unknown';
  mimeType: string; // RTP MIME type from SDP (e.g., "H264/90000", "PCMA/8000/1")
  sampleRate?: number; // Only for audio streams
  channels?: number; // Only for audio streams
  direction: 'sendonly' | 'recvonly' | 'sendrecv' | 'inactive';
  fmtp?: string; // FMTP parameters from SDP (e.g., "packetization-mode=1; sprop-parameter-sets=...")
}
