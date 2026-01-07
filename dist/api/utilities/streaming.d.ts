import { FormatContext } from '../../lib/format-context.js';
import type { AVCodecID } from '../../constants/index.js';
import type { Muxer } from '../muxer.js';
/**
 * Streaming protocol utilities.
 *
 * Provides static methods for SDP generation, RTP URL building, and
 * network streaming helpers for RTP/RTSP protocols.
 *
 * @example
 * ```typescript
 * import { StreamingUtils, Muxer } from 'node-av/api';
 *
 * // Create RTP outputs
 * const videoOutput = await Muxer.open('rtp://127.0.0.1:5004');
 * const audioOutput = await Muxer.open('rtp://127.0.0.1:5006');
 *
 * // Generate SDP for streaming
 * const sdp = StreamingUtils.createSdp([videoOutput, audioOutput]);
 * if (sdp) {
 *   console.log('SDP for streaming:', sdp);
 *   // Save to .sdp file or serve via RTSP server
 * }
 * ```
 */
export declare class StreamingUtils {
    /**
     * Create an SDP (Session Description Protocol) string from demuxer/muxer
     *
     * Generates an SDP description for RTP/RTSP streaming from one or more
     * configured demuxer/muxer. The inputs/outputs should be configured with RTP
     * format and have their streams set up before calling this method.
     *
     * @param contexts - Alternatively, array of FormatContext objects
     *
     * @returns SDP string if successful, null if failed
     *
     * @example
     * ```typescript
     * // Set up RTP outputs with streams
     * const output1 = await Muxer.open('rtp://239.0.0.1:5004');
     * await output1.addStream(encoder1);
     *
     * const output2 = await Muxer.open('rtp://239.0.0.1:5006');
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
    static createSdp(contexts: FormatContext[]): string | null;
    /**
     * Generate SDP for RTP/SRTP input using FFmpeg's native SDP generator
     *
     * Creates an RFC-compliant SDP description using FFmpeg's internal logic.
     * This ensures correct codec names, clock rates, and formatting for all codecs.
     *
     * @param configs - Array of stream configurations
     *
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
    static createInputSDP(configs: {
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
    }[], sessionName?: string): string;
    /**
     * Validate if an output is configured for RTP streaming
     *
     * @param output - Muxer to check
     *
     * @returns true if configured for RTP
     *
     * @example
     * ```typescript
     * const output = await Muxer.open('rtp://127.0.0.1:5004');
     * if (StreamingUtils.isRtpOutput(output)) {
     *   const sdp = StreamingUtils.createSdpForOutput(output);
     * }
     * ```
     */
    static isRtpOutput(output: Muxer): boolean;
    /**
     * Build RTP URL from components
     *
     * Helper to construct RTP URLs with proper formatting.
     *
     * @param host - IP address or hostname
     *
     * @param port - Port number
     *
     * @param options - Additional options
     *
     * @param options.ttl - Time-to-live for multicast
     *
     * @param options.localrtpport - Local RTP port
     *
     * @param options.localrtcpport - Local RTCP port
     *
     * @param options.pkt_size - Packet size
     *
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
    static buildRtpUrl(host: string, port: number, options?: {
        ttl?: number;
        localrtpport?: number;
        localrtcpport?: number;
        pkt_size?: number;
    }): string;
    /**
     * Extract all UDP ports from SDP content
     *
     * @param sdp - SDP content string
     *
     * @returns Array of port numbers (one per stream)
     *
     * @example
     * ```typescript
     * import { StreamingUtils } from 'node-av/api';
     *
     * const sdp = `v=0
     * o=- 0 0 IN IP4 127.0.0.1
     * s=Test Stream
     * c=IN IP4 127.0.0.1
     * t=0 0
     * m=audio 5004 RTP/AVP 111
     * a=rtpmap:111 OPUS/48000/2
     * m=video 5006 RTP/AVP 96
     * a=rtpmap:96 H264/90000`;
     *
     * const ports = StreamingUtils.extractPortsFromSDP(sdp);
     * console.log(ports); // [5004, 5006]
     * ```
     */
    static extractPortsFromSDP(sdp: string): number[];
}
