/**
 * Parse bitrate string to bigint.
 *
 * Supports suffixes: K (kilo), M (mega), G (giga).
 *
 * Converts human-readable bitrate strings to numeric values.
 *
 * @param str - Bitrate string (e.g., '5M', '192k')
 *
 * @returns Bitrate as bigint
 *
 * @example
 * ```typescript
 * parseBitrate('5M')   // 5000000n
 * parseBitrate('192k') // 192000n
 * parseBitrate('1.5G') // 1500000000n
 * ```
 */
export declare function parseBitrate(str: string): bigint;
