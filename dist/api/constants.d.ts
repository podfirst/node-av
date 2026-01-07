/**
 * Input/Output buffer size for I/O operations.
 */
export declare const IO_BUFFER_SIZE = 32768;
/**
 * Frame buffer size
 */
export declare const FRAME_THREAD_QUEUE_SIZE = 2;
/**
 * Packet buffer size
 */
export declare const PACKET_THREAD_QUEUE_SIZE = 8;
/**
 * Maximum input queue size before packets are dropped.
 */
export declare const MAX_INPUT_QUEUE_SIZE = 100;
/**
 * Maximum packet size for reading from streams.
 */
export declare const MAX_PACKET_SIZE = 1200;
/**
 * Threshold in seconds for delta between DTS and expected DTS
 * to consider a timestamp discontinuity.
 */
export declare const DELTA_THRESHOLD = 10;
/**
 * DTS error threshold in seconds to trigger a reset of
 * timestamp calculations (seconds).
 */
export declare const DTS_ERROR_THRESHOLD = 108000;
/**
 * Maximum size of the muxing queue before data is dropped.
 */
export declare const MAX_MUXING_QUEUE_SIZE = 128;
/**
 * Data threshold in bytes for the muxing queue to trigger
 * a warning or action.
 */
export declare const MUXING_QUEUE_DATA_THRESHOLD: number;
/**
 * Duration in seconds for which to buffer data in the sync queue
 * for packet interleaving across multiple streams.
 */
export declare const SYNC_BUFFER_DURATION = 10;
