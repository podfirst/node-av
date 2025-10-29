import { AVMEDIA_TYPE_VIDEO } from '../../constants/constants.js';
import { Codec } from '../../lib/codec.js';
import { avSdpCreate } from '../../lib/utilities.js';

import type { AVCodecID } from '../../constants/constants.js';
import type { FormatContext } from '../../lib/format-context.js';
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
 * const videoOutput = await MediaOutput.create('rtp://127.0.0.1:5004');
 * const audioOutput = await MediaOutput.create('rtp://127.0.0.1:5006');
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
   * const output1 = await MediaOutput.create('rtp://239.0.0.1:5004');
   * await output1.addVideoStream(encoder1);
   *
   * const output2 = await MediaOutput.create('rtp://239.0.0.1:5006');
   * await output2.addAudioStream(encoder2);
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
   * Validate if an output is configured for RTP streaming
   *
   * @param output - MediaOutput to check
   * @returns true if configured for RTP
   *
   * @example
   * ```typescript
   * const output = await MediaOutput.create('rtp://127.0.0.1:5004');
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
   * Create SDP for RTP/SRTP input stream(s)
   *
   * Generates SDP content for receiving RTP packets via localhost UDP.
   * Supports single stream or multi-stream (video + audio).
   * Supports optional SRTP encryption via crypto line.
   *
   * @param config - RTP stream configuration array
   *
   * @param sessionName - Optional session name
   *
   * @returns SDP content string
   *
   * @example
   * ```typescript
   * // Multi-stream: Video + Audio
   * const sdp = StreamingUtils.createRTPInputSDP([
   *   {
   *     port: 5006,
   *     codecId: AV_CODEC_ID_H264,
   *     payloadType: 96,
   *     clockRate: 90000,
   *   },
   *   {
   *     port: 5004,
   *     codecId: AV_CODEC_ID_OPUS,
   *     payloadType: 111,
   *     clockRate: 48000,
   *     channels: 2,
   *   }
   * ], 'Video+Audio Stream');
   * ```
   */
  static createRTPInputSDP(
    config: {
      /** UDP port for RTP packets */
      port: number;
      /** Codec ID */
      codecId: AVCodecID;
      /** RTP payload type (e.g., 111 for Opus, 96 for H.264) */
      payloadType: number;
      /** RTP clock rate (e.g., 48000 for audio, 90000 for video) */
      clockRate: number;
      /** Number of audio channels (optional, audio only) */
      channels?: number;
      /** Optional format parameters (fmtp line content) */
      fmtp?: string;
      /** Optional SRTP encryption */
      srtp?: {
        /** SRTP master key (16 bytes for AES-128) */
        key: Buffer;
        /** SRTP salt (14 bytes) */
        salt: Buffer;
        /** Crypto suite (default: AES_CM_128_HMAC_SHA1_80) */
        suite?: 'AES_CM_128_HMAC_SHA1_80' | 'AES_CM_128_HMAC_SHA1_32';
      };
    }[],
    sessionName?: string,
  ): string {
    // Handle array of streams (multi-stream SDP)

    const lines = ['v=0', 'o=- 0 0 IN IP4 127.0.0.1', `s=${sessionName ?? 'node-av'}`, 'c=IN IP4 127.0.0.1', 't=0 0'];

    for (const streamConfig of config) {
      const codec = Codec.findDecoder(streamConfig.codecId);
      if (!codec) {
        continue;
      }

      const isVideo = codec.type === AVMEDIA_TYPE_VIDEO;
      const mediaType = isVideo ? 'video' : 'audio';

      lines.push(`m=${mediaType} ${streamConfig.port} RTP/AVP ${streamConfig.payloadType}`);

      // Add rtpmap
      const rtpmap =
        streamConfig.channels !== undefined
          ? `${streamConfig.payloadType} ${codec.name}/${streamConfig.clockRate}/${streamConfig.channels}`
          : `${streamConfig.payloadType} ${codec.name}/${streamConfig.clockRate}`;
      lines.push(`a=rtpmap:${rtpmap}`);

      // Add fmtp if provided
      if (streamConfig.fmtp) {
        lines.push(`a=fmtp:${streamConfig.payloadType} ${streamConfig.fmtp}`);
      }

      // Add SRTP crypto line if provided
      if (streamConfig.srtp) {
        const suite = streamConfig.srtp.suite ?? 'AES_CM_128_HMAC_SHA1_80';
        const keyMaterial = Buffer.concat([streamConfig.srtp.key, streamConfig.srtp.salt]).toString('base64');
        lines.push(`a=crypto:1 ${suite} inline:${keyMaterial}`);
      }
    }

    return lines.join('\n');
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
