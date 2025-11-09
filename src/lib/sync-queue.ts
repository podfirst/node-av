import { bindings } from './binding.js';

import type { NativeSyncQueue, NativeWrapper } from './native-types.js';
import type { Packet } from './packet.js';

/**
 * Sync Queue Type
 *
 * Determines the sync queue behavior for different media types.
 */
export enum SyncQueueType {
  /**
   * Buffer packets based on their duration in time base units.
   * Used for audio and video streams.
   */
  PACKETS = 0,

  /**
   * Buffer frames based on their sample count.
   * Used for audio frames where synchronization is sample-based.
   */
  FRAMES = 1,
}

/**
 * Sync Queue for packet synchronization
 *
 * FFmpeg's native sync_queue from fftools that synchronizes packets from multiple
 * streams before muxing. Prevents streams from getting ahead of each other and
 * ensures proper interleaving for containers with strict timing requirements.
 *
 * This is the same synchronization mechanism used by FFmpeg CLI (fftools).
 *
 * Direct mapping to FFmpeg's SyncQueue from fftools/sync_queue.h.
 *
 * @example
 * ```typescript
 * import { SyncQueue, SyncQueueType } from 'node-av';
 *
 * // Create sync queue with 1 second buffer
 * const sq = SyncQueue.create(SyncQueueType.PACKETS, 1000000);
 *
 * // Add streams
 * const videoIdx = sq.addStream(1);  // 1 = limiting stream
 * const audioIdx = sq.addStream(1);
 *
 * // Send packets to queue
 * sq.send(videoIdx, videoPacket);
 * sq.send(audioIdx, audioPacket);
 *
 * // Receive synchronized packets
 * const result = sq.receive(-1);  // -1 = any stream
 * if (result.error === 0) {
 *   console.log(`Stream ${result.streamIdx}: ${result.packet}`);
 *   // Write packet to muxer...
 * }
 *
 * // Cleanup
 * sq.free();
 * ```
 *
 * @see [sync_queue.h](https://github.com/FFmpeg/FFmpeg/blob/master/fftools/sync_queue.h) - FFmpeg source
 */
export class SyncQueue implements Disposable, NativeWrapper<NativeSyncQueue> {
  /** @internal */
  public native: NativeSyncQueue;

  private constructor(native: NativeSyncQueue) {
    this.native = native;
  }

  /**
   * Create a new sync queue.
   *
   * @param type - Queue type (PACKETS or FRAMES)
   *
   * @param bufferSizeUs - Buffer size in microseconds (default: 100ms)
   *
   * @returns New SyncQueue instance
   *
   * @example
   * ```typescript
   * // 500ms buffer for RTSP streams
   * const sq = SyncQueue.create(SyncQueueType.PACKETS, 500000);
   * ```
   */
  static create(type: SyncQueueType = SyncQueueType.PACKETS, bufferSizeUs = 100000): SyncQueue {
    const native = bindings.SyncQueue.create(type, bufferSizeUs);
    return new SyncQueue(native);
  }

  /**
   * Add a stream to the sync queue.
   *
   * @param limiting - Whether this stream should limit other streams (1 = yes, 0 = no).
   *                   Limiting streams control the head position - other streams cannot get ahead.
   *
   * @returns Stream index in the sync queue
   *
   * @example
   * ```typescript
   * const videoIdx = sq.addStream(1);  // Video limits timing
   * const audioIdx = sq.addStream(1);  // Audio limits timing
   * const subtitleIdx = sq.addStream(0);  // Subtitles don't limit
   * ```
   */
  addStream(limiting = 1): number {
    return this.native.addStream(limiting);
  }

  /**
   * Send a packet to the sync queue.
   *
   * The packet is cloned internally, so the original can be reused/freed.
   *
   * To signal EOF for a stream, pass null as the packet.
   * This tells the sync queue that no more packets will be sent for this stream.
   *
   * @param streamIdx - Stream index returned from addStream()
   *
   * @param packet - Packet to send, or null to signal EOF
   *
   * @returns 0 on success, AVERROR_EOF if EOF, negative on error
   *
   * @example
   * ```typescript
   * // Send normal packet
   * const ret = sq.send(videoIdx, packet);
   * if (ret === AVERROR_EOF) {
   *   console.log('Stream finished');
   * }
   *
   * // Signal EOF for stream
   * sq.send(videoIdx, null);
   * ```
   */
  send(streamIdx: number, packet: Packet | null): number {
    return this.native.send(streamIdx, packet?.getNative() ?? null);
  }

  /**
   * Receive a packet from the sync queue.
   *
   * This will receive the next packet that should be written to maintain
   * proper synchronization between streams. The packet parameter is filled
   * with the received data.
   *
   * @param streamIdx - Stream index to receive from, or -1 for any stream
   *
   * @param packet - Packet to fill with received data (output parameter)
   *
   * @returns Stream index (>= 0) on success, or negative error code:
   *          - >= 0: Stream index that the packet belongs to
   *          - AVERROR(EAGAIN): No packets ready yet, more frames needed
   *          - AVERROR_EOF: All streams finished
   *
   * @example
   * ```typescript
   * import { AVERROR } from 'node-av';
   *
   * // Receive from any stream (FFmpeg mux pattern)
   * const packet = new Packet();
   * while (true) {
   *   const ret = sq.receive(-1, packet);
   *   if (ret === AVERROR('EAGAIN')) {
   *     break;  // No packets ready
   *   }
   *   if (ret === AVERROR_EOF) {
   *     break;  // All streams finished
   *   }
   *   if (ret >= 0) {
   *     // ret is the stream index
   *     await muxer.interleavedWriteFrame(packet);
   *   }
   * }
   * ```
   */
  receive(streamIdx: number, packet: Packet): number {
    return this.native.receive(streamIdx, packet.getNative());
  }

  /**
   * Free the sync queue and all buffered packets.
   * After calling this, the queue cannot be used anymore.
   *
   * @example
   * ```typescript
   * sq.free();
   * ```
   */
  free(): void {
    this.native.free();
  }

  /**
   * Get the underlying native SyncQueue object.
   *
   * @returns The native SyncQueue binding object
   *
   * @internal
   */
  getNative(): NativeSyncQueue {
    return this.native;
  }

  [Symbol.dispose](): void {
    this.free();
  }
}
