import { AVMEDIA_TYPE_VIDEO } from '../../constants/constants.js';
import { Codec } from '../../lib/codec.js';
import { FormatContext } from '../../lib/format-context.js';
import { Rational } from '../../lib/rational.js';
import { avSdpCreate } from '../../lib/utilities.js';

import type { AVCodecID } from '../../constants/index.js';
import type { MediaOutput } from '../media-output.js';

/**
 * Streaming protocol utilities.
 *
 * Provides static methods for SDP generation, RTP URL building, and
 * network streaming helpers for RTP/RTSP protocols.
 *
 * @example
 * ```typescript
 * import { StreamingUtils, MediaOutput } from 'node-av/api';
 *
 * // Create RTP outputs
 * const videoOutput = await MediaOutput.open('rtp://127.0.0.1:5004');
 * const audioOutput = await MediaOutput.open('rtp://127.0.0.1:5006');
 *
 * // Generate SDP for streaming
 * const sdp = StreamingUtils.createSdp([videoOutput, audioOutput]);
 * if (sdp) {
 *   console.log('SDP for streaming:', sdp);
 *   // Save to .sdp file or serve via RTSP server
 * }
 * ```
 */
export class StreamingUtils {
  /**
   * Create an SDP (Session Description Protocol) string from media inputs/outputs
   *
   * Generates an SDP description for RTP/RTSP streaming from one or more
   * configured media inputs/outputs. The inputs/outputs should be configured with RTP
   * format and have their streams set up before calling this method.
   *
   * @param inouts - Array of MediaInput or MediaOutput objects configured for RTP
   *
   * @returns SDP string if successful, null if failed
   *
   * @example
   * ```typescript
   * // Set up RTP outputs with streams
   * const output1 = await MediaOutput.open('rtp://239.0.0.1:5004');
   * await output1.addStream(encoder1);
   *
   * const output2 = await MediaOutput.open('rtp://239.0.0.1:5006');
   * await output2.addStream(encoder2);
   *
   * // Generate SDP for multicast streaming
   * const sdp = StreamingUtils.createSdp([output1.getFormatContext(), output2.getFormatContext()]);
   * if (sdp) {
   *   // Write to file for VLC or other players
   *   await fs.writeFile('stream.sdp', sdp);
   * }
   * ```
   */
  static createSdp(contexts: FormatContext[]): string | null {
    if (contexts?.length === 0) {
      return null;
    }

    return avSdpCreate(contexts);
  }

  /**
   * Generate SDP for RTP/SRTP input using FFmpeg's native SDP generator
   *
   * Creates an RFC-compliant SDP description using FFmpeg's internal logic.
   * This ensures correct codec names, clock rates, and formatting for all codecs.
   *
   * @param configs - Array of stream configurations
   * @param sessionName - Optional session name for the SDP (default: 'RTP Stream')
   *
   * @returns SDP string with proper rtpmap and optional crypto attributes
   *
   * @example
   * ```typescript
   * import { StreamingUtils } from 'node-av/api';
   * import { AV_CODEC_ID_OPUS, AV_CODEC_ID_H264 } from 'node-av/constants';
   *
   * // Single audio stream with SRTP
   * const sdp = StreamingUtils.createInputSDP([{
   *   port: 5004,
   *   codecId: AV_CODEC_ID_OPUS,
   *   payloadType: 111,
   *   clockRate: 48000,
   *   channels: 2,
   *   srtp: {
   *     key: Buffer.alloc(16, 0x12),
   *     salt: Buffer.alloc(14, 0x34)
   *   }
   * }]);
   *
   * // Multi-stream (video + audio)
   * const sdp = StreamingUtils.createInputSDP([
   *   { port: 5006, codecId: AV_CODEC_ID_H264, payloadType: 96, clockRate: 90000 },
   *   { port: 5004, codecId: AV_CODEC_ID_OPUS, payloadType: 111, clockRate: 48000, channels: 2 }
   * ], 'My Stream');
   * ```
   */
  static createInputSDP(
    configs: {
      port: number;
      codecId: AVCodecID;
      payloadType: number;
      clockRate: number;
      channels?: number;
      fmtp?: string;
      srtp?: {
        key: Buffer;
        salt: Buffer;
        suite?: 'AES_CM_128_HMAC_SHA1_80' | 'AES_CM_256_HMAC_SHA1_80';
      };
    }[],
    sessionName = 'RTP Stream',
  ): string {
    const contexts: FormatContext[] = [];

    try {
      // Create one FormatContext per stream with individual URL (port)
      for (const streamConfig of configs) {
        const codec = Codec.findDecoder(streamConfig.codecId);
        if (!codec) {
          throw new Error(`Codec not found for codec ID: ${streamConfig.codecId}`);
        }

        // Create format context with URL containing the port
        const ctx = new FormatContext();
        ctx.allocContext();
        ctx.url = `rtp://127.0.0.1:${streamConfig.port}`;

        // Create stream with codec parameters
        const stream = ctx.newStream(null);
        stream.codecpar.codecId = streamConfig.codecId;
        stream.codecpar.codecType = codec.type;

        // Set audio-specific parameters
        if (codec.type !== AVMEDIA_TYPE_VIDEO) {
          if (streamConfig.clockRate) {
            stream.codecpar.sampleRate = streamConfig.clockRate;
          }
          if (streamConfig.channels) {
            stream.codecpar.channels = streamConfig.channels;
          }
        }

        // Set time base (required for SDP generation)
        stream.timeBase = new Rational(1, streamConfig.clockRate);

        contexts.push(ctx);
      }

      // Generate SDP using FFmpeg's native generator
      // FFmpeg will automatically use the port from each context's URL and generate RFC-compliant codec names
      let sdp = avSdpCreate(contexts);

      if (!sdp) {
        throw new Error('Failed to generate SDP');
      }

      // Post-process: Replace session name if provided
      if (sessionName !== 'RTP Stream') {
        sdp = sdp.replace(/^s=.*$/m, `s=${sessionName}`);
      }

      // Post-process: Replace payload types, add SRTP crypto lines, and/or custom fmtp
      // Note: We always need to process because FFmpeg assigns payload types automatically
      const sdpLines = sdp.split('\n');
      const newLines: string[] = [];
      let streamIndex = -1;

      for (let i = 0; i < sdpLines.length; i++) {
        const line = sdpLines[i];

        if (line.startsWith('m=')) {
          // New media section
          streamIndex++;
          const streamCfg = configs[streamIndex];

          // Replace FFmpeg's auto-assigned payload type with user-specified one
          const replaced = line.replace(/RTP\/AVP\s+(\d+)/, `RTP/AVP ${streamCfg.payloadType}`);
          newLines.push(replaced);

          // Add SRTP crypto line right after m= line if configured
          if (streamCfg?.srtp) {
            const suite = streamCfg.srtp.suite ?? 'AES_CM_128_HMAC_SHA1_80';
            const keyMaterial = Buffer.concat([streamCfg.srtp.key, streamCfg.srtp.salt]).toString('base64');
            newLines.push(`a=crypto:1 ${suite} inline:${keyMaterial}`);
          }
        } else if (line.startsWith('a=rtpmap:')) {
          // Replace payload type in rtpmap line
          const streamCfg = configs[streamIndex];
          const replaced = line.replace(/^a=rtpmap:(\d+)/, `a=rtpmap:${streamCfg.payloadType}`);
          newLines.push(replaced);

          // If custom fmtp is provided but FFmpeg didn't generate one, add it
          if (streamCfg?.fmtp && !sdpLines[i + 1]?.startsWith('a=fmtp:')) {
            newLines.push(`a=fmtp:${streamCfg.payloadType} ${streamCfg.fmtp}`);
          }
        } else if (line.startsWith('a=fmtp:')) {
          // Replace payload type in fmtp line and optionally replace content
          const streamCfg = configs[streamIndex];
          if (streamCfg?.fmtp) {
            newLines.push(`a=fmtp:${streamCfg.payloadType} ${streamCfg.fmtp}`);
          } else {
            const replaced = line.replace(/^a=fmtp:(\d+)/, `a=fmtp:${streamCfg.payloadType}`);
            newLines.push(replaced);
          }
        } else {
          newLines.push(line);
        }
      }

      return newLines.join('\n');
    } finally {
      // Cleanup all contexts
      for (const ctx of contexts) {
        ctx.freeContext();
      }
    }
  }

  /**
   * Validate if an output is configured for RTP streaming
   *
   * @param output - MediaOutput to check
   * @returns true if configured for RTP
   *
   * @example
   * ```typescript
   * const output = await MediaOutput.open('rtp://127.0.0.1:5004');
   * if (StreamingUtils.isRtpOutput(output)) {
   *   const sdp = StreamingUtils.createSdpForOutput(output);
   * }
   * ```
   */
  static isRtpOutput(output: MediaOutput): boolean {
    // Check if the output format is RTP
    const formatContext = output.getFormatContext();
    const oformat = formatContext?.oformat;
    if (oformat) {
      const name = oformat.name;
      return name === 'rtp' || name === 'rtp_mpegts';
    }
    return false;
  }

  /**
   * Build RTP URL from components
   *
   * Helper to construct RTP URLs with proper formatting.
   *
   * @param host - IP address or hostname
   * @param port - Port number
   * @param options - Additional options
   * @returns Formatted RTP URL
   *
   * @example
   * ```typescript
   * // Unicast
   * const url1 = StreamingUtils.buildRtpUrl('127.0.0.1', 5004);
   * // 'rtp://127.0.0.1:5004'
   *
   * // Multicast
   * const url2 = StreamingUtils.buildRtpUrl('239.0.0.1', 5004, { ttl: 64 });
   * // 'rtp://239.0.0.1:5004?ttl=64'
   * ```
   */
  static buildRtpUrl(
    host: string,
    port: number,
    options?: {
      ttl?: number; // Time-to-live for multicast
      localrtpport?: number; // Local RTP port
      localrtcpport?: number; // Local RTCP port
      pkt_size?: number; // Packet size
    },
  ): string {
    let url = `rtp://${host}:${port}`;

    if (options && Object.keys(options).length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    return url;
  }

  /**
   * Extract all UDP ports from SDP content
   *
   * @param sdp - SDP content string
   *
   * @returns Array of port numbers (one per stream)
   */
  static extractPortsFromSDP(sdp: string): number[] {
    const ports: number[] = [];
    const lines = sdp.split('\n');

    for (const line of lines) {
      if (line.startsWith('m=')) {
        // m=audio 5004 RTP/AVP 111
        // m=video 5006 RTP/AVP 96
        const match = /m=\w+\s+(\d+)/.exec(line);
        if (match) {
          ports.push(parseInt(match[1], 10));
        }
      }
    }

    return ports;
  }
}
