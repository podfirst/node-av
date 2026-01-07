import { RTCRtpCodecParameters } from 'werift';
import type { AVCodecID } from '../constants/index.js';
import type { RTPStreamOptions } from './rtp-stream.js';
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
    video?: Partial<RTCRtpCodecParameters> & {
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
 * Options for configuring WebRTC session with werift integration.
 */
export interface WebRTCStreamOptions extends Omit<RTPStreamOptions, 'onVideoPacket' | 'onAudioPacket' | 'supportedVideoCodecs' | 'supportedAudioCodecs'> {
    /**
     * ICE servers for NAT traversal and STUN/TURN configuration.
     *
     * @default []
     */
    iceServers?: {
        urls: string;
    }[];
    /**
     * Callback invoked when a new ICE candidate is discovered.
     * Send this candidate to the remote peer via signaling channel.
     *
     * @param candidate - ICE candidate string to send to remote peer
     */
    onIceCandidate?: (candidate: string) => void;
}
/**
 * Complete WebRTC session management with werift integration.
 *
 * Provides end-to-end WebRTC streaming with automatic SDP negotiation,
 * ICE candidate handling, and peer connection management.
 * Built on top of {@link RTPStream} for generic RTP streaming with WebRTC-specific
 * protocol details handled automatically.
 * Integrates with werift library for RTCPeerConnection and media track handling.
 * Ideal for building complete WebRTC streaming applications with minimal code.
 *
 * @example
 * ```typescript
 * import { WebRTCStream } from 'node-av/api';
 *
 * // Create session from media source
 * const session = await WebRTCStream.create('rtsp://camera.local/stream', {
 *   mtu: 1200,
 *   hardware: 'auto',
 *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
 *   onIceCandidate: (candidate) => {
 *     sendToClient({ type: 'candidate', value: candidate });
 *   }
 * });
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
 *     const session = await WebRTCStream.create(msg.url, {
 *       hardware: 'auto',
 *       onIceCandidate: (candidate) => {
 *         ws.send(JSON.stringify({ type: 'candidate', value: candidate }));
 *       }
 *     });
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
 * @see {@link RTPStream} For library-agnostic RTP streaming
 * @see {@link Demuxer} For input media handling
 * @see {@link HardwareContext} For GPU acceleration
 */
export declare class WebRTCStream {
    private stream;
    private pc;
    private videoTrack;
    private audioTrack;
    private options;
    private pendingIceCandidates;
    /**
     * @param options - Session configuration options
     *
     * Use {@link create} factory method
     *
     * @internal
     */
    private constructor();
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
     * @example
     * ```typescript
     * const session = await WebRTCStream.create('rtsp://camera.local/stream', {
     *   mtu: 1200,
     *   hardware: 'auto',
     *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Session from file with hardware acceleration
     * const session = await WebRTCStream.create('video.mp4', {
     *   hardware: {
     *     deviceType: AV_HWDEVICE_TYPE_CUDA
     *   }
     * });
     * ```
     */
    static create(inputUrl: string, options?: WebRTCStreamOptions): WebRTCStream;
    /**
     * Start streaming media to WebRTC peer connection.
     *
     * Begins the media processing pipeline, reading packets from input,
     * transcoding if necessary, and sending RTP packets to media tracks.
     * Note: The stream is automatically started by {@link setOffer}, so calling
     * this method explicitly is optional. This method is provided for cases where
     * you need explicit control over when streaming begins.
     *
     * @returns Promise that resolves when streaming completes
     *
     * @throws {FFmpegError} If transcoding or muxing fails
     *
     * @example
     * ```typescript
     * const session = await WebRTCStream.create('input.mp4');
     * session.onIceCandidate = (c) => sendToRemote(c);
     *
     * const answer = await session.setOffer(remoteOffer);
     * sendToRemote(answer);
     * // Stream is already started by setOffer
     * ```
     */
    start(): Promise<void>;
    /**
     * Stop streaming gracefully and clean up all resources.
     *
     * Stops the stream, closes peer connection, and releases all resources.
     * Safe to call multiple times. After stopping, you can call start() again
     * to restart the session.
     *
     * @example
     * ```typescript
     * const session = await WebRTCStream.create('input.mp4');
     * await session.start();
     *
     * // Stop after 10 seconds
     * setTimeout(async () => await session.stop(), 10000);
     * ```
     */
    stop(): Promise<void>;
    /**
     * Get detected codec information.
     *
     * Returns RTP codec parameters and FFmpeg codec IDs for video and audio.
     * Useful for inspecting what codecs will be used in the WebRTC session.
     * The input is automatically opened during {@link create}, so codecs can be
     * detected immediately after session creation.
     *
     * @returns Codec configuration for video and audio streams
     *
     * @example
     * ```typescript
     * const session = await WebRTCStream.create('input.mp4');
     * const codecs = session.getCodecs();
     *
     * console.log('Video:', codecs.video.mimeType);
     * console.log('Audio:', codecs.audio?.mimeType);
     * ```
     */
    getCodecs(): WebRTCCodecInfo;
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
     * const session = await WebRTCStream.create('input.mp4');
     *
     * // Setup ICE candidate handler first
     * session.onIceCandidate = (candidate) => {
     *   sendToRemote({ type: 'candidate', value: candidate });
     * };
     *
     * // Process offer and send answer
     * const answer = await session.setOffer(remoteOffer);
     * sendToRemote({ type: 'answer', value: answer });
     *
     * // Start streaming
     * await session.start();
     * ```
     */
    setOffer(offerSdp: string): Promise<string>;
    /**
     * Add ICE candidate from remote peer.
     *
     * Processes ICE candidates received from the remote peer via signaling channel.
     * Should be called whenever a new candidate message arrives from remote peer.
     * Can be called multiple times as candidates are discovered.
     *
     * Supports ICE trickling: If called before {@link setOffer}, candidates are buffered
     * and applied automatically once the remote description is set.
     *
     * @param candidate - ICE candidate string from remote peer
     *
     * @example
     * ```typescript
     * // In signaling message handler
     * if (msg.type === 'candidate') {
     *   session.addIceCandidate(msg.value);
     * }
     * ```
     */
    addIceCandidate(candidate: string): void;
    /**
     * Get video codec configuration from input stream.
     *
     * @param codecId - FFmpeg codec ID
     *
     * @returns RTP codec parameters with codec ID or undefined if unsupported
     *
     * @internal
     */
    private getVideoCodecConfig;
    /**
     * Get audio codec configuration from input stream.
     *
     * @param codecId - FFmpeg codec ID
     *
     * @returns RTP codec parameters with codec ID or undefined if unsupported
     *
     * @internal
     */
    private getAudioCodecConfig;
}
