import type { AVError } from '../constants/constants.js';
import type { NativeFFmpegError, NativeWrapper } from './native-types.js';
/**
 * POSIX error names that can be converted to FFmpeg error codes.
 * These are platform-specific and resolved at runtime.
 *
 * @example
 * ```typescript
 * import { PosixError, FFmpegError } from 'node-av';
 *
 * // Get platform-specific error code
 * const errorCode = FFmpegError.AVERROR(PosixError.EAGAIN);
 * console.log(`EAGAIN on this platform: ${errorCode}`);
 * ```
 */
export declare enum PosixError {
    EAGAIN = "EAGAIN",
    ENOMEM = "ENOMEM",
    EINVAL = "EINVAL",
    EIO = "EIO",
    EPIPE = "EPIPE",
    ENOSPC = "ENOSPC",
    ENOENT = "ENOENT",
    EACCES = "EACCES",
    EPERM = "EPERM",
    EEXIST = "EEXIST",
    ENODEV = "ENODEV",
    ENOTDIR = "ENOTDIR",
    EISDIR = "EISDIR",
    EBUSY = "EBUSY",
    EMFILE = "EMFILE",
    ERANGE = "ERANGE"
}
/** FFmpeg error code for EAGAIN (resource temporarily unavailable) */
export declare const AVERROR_EAGAIN: AVError;
/** FFmpeg error code for ENOMEM (out of memory) */
export declare const AVERROR_ENOMEM: AVError;
/** FFmpeg error code for EINVAL (invalid argument) */
export declare const AVERROR_EINVAL: AVError;
/** FFmpeg error code for EIO (I/O error) */
export declare const AVERROR_EIO: AVError;
/** FFmpeg error code for EPIPE (broken pipe) */
export declare const AVERROR_EPIPE: AVError;
/** FFmpeg error code for ENOSPC (no space left on device) */
export declare const AVERROR_ENOSPC: AVError;
/** FFmpeg error code for ENOENT (no such file or directory) */
export declare const AVERROR_ENOENT: AVError;
/** FFmpeg error code for EACCES (permission denied) */
export declare const AVERROR_EACCES: AVError;
/** FFmpeg error code for EPERM (operation not permitted) */
export declare const AVERROR_EPERM: AVError;
/** FFmpeg error code for EEXIST (file exists) */
export declare const AVERROR_EEXIST: AVError;
/** FFmpeg error code for ENODEV (no such device) */
export declare const AVERROR_ENODEV: AVError;
/** FFmpeg error code for ENOTDIR (not a directory) */
export declare const AVERROR_ENOTDIR: AVError;
/** FFmpeg error code for EISDIR (is a directory) */
export declare const AVERROR_EISDIR: AVError;
/** FFmpeg error code for EBUSY (device or resource busy) */
export declare const AVERROR_EBUSY: AVError;
/** FFmpeg error code for EMFILE (too many open files) */
export declare const AVERROR_EMFILE: AVError;
/** FFmpeg error code for ERANGE (result too large) */
export declare const AVERROR_ERANGE: AVError;
/**
 * FFmpeg error handling class.
 *
 * Provides utilities for handling and converting FFmpeg error codes.
 * FFmpeg uses negative values for errors, with both FFmpeg-specific codes
 * and POSIX error codes converted to negative values. This class provides
 * methods to check, convert, and throw errors based on FFmpeg return codes.
 *
 * @example
 * ```typescript
 * import { FFmpegError } from 'node-av';
 * import { AVERROR_EAGAIN, AVERROR_EOF } from 'node-av/constants';
 *
 * // Check and throw errors
 * const ret = await codecContext.sendPacket(packet);
 * FFmpegError.throwIfError(ret, 'sendPacket');
 *
 * // Handle specific errors
 * if (ret === AVERROR_EAGAIN) {
 *   // Need to receive frames first
 * } else if (ret === AVERROR_EOF) {
 *   // End of stream
 * }
 *
 * // Get error description
 * const errorMsg = FFmpegError.strerror(ret);
 * console.error(`Error: ${errorMsg}`);
 * ```
 *
 * @see [av_strerror](https://ffmpeg.org/doxygen/trunk/group__lavu__error.html) - FFmpeg Doxygen
 */
export declare class FFmpegError extends Error implements NativeWrapper<NativeFFmpegError> {
    private native;
    constructor(code?: number);
    /**
     * Get human-readable error message for code.
     *
     * Converts an FFmpeg error code to a descriptive string.
     *
     * Direct mapping to av_strerror().
     *
     * @param errnum - FFmpeg error code
     *
     * @returns Error description string
     *
     * @example
     * ```typescript
     * const message = FFmpegError.strerror(-22);
     * console.log(message); // "Invalid argument"
     * ```
     */
    static strerror(errnum: number): string;
    /**
     * Convert POSIX error name to FFmpeg error code.
     *
     * Converts platform-specific POSIX error to FFmpeg's negative error code.
     *
     * Direct mapping to AVERROR() macro.
     *
     * @param errorName - POSIX error name
     *
     * @returns FFmpeg error code
     *
     * @example
     * ```typescript
     * import { PosixError } from 'node-av';
     *
     * const code = FFmpegError.AVERROR(PosixError.ENOMEM);
     * // Returns platform-specific negative error code
     * ```
     *
     * @see {@link PosixError} For available error names
     */
    static AVERROR(errorName: PosixError): AVError;
    /**
     * Check if a code is an FFmpeg error.
     *
     * FFmpeg errors are negative values.
     *
     * @param code - Return code to check
     *
     * @returns True if code is an error
     *
     * @example
     * ```typescript
     * const ret = await formatContext.readFrame(packet);
     * if (FFmpegError.isFFmpegError(ret)) {
     *   console.error('Read failed');
     * }
     * ```
     */
    static isFFmpegError(code: number): boolean;
    /**
     * Create error from code.
     *
     * Creates an FFmpegError instance if the code is an error.
     *
     * @param code - FFmpeg return code
     *
     * @returns Error instance or null if not an error
     *
     * @example
     * ```typescript
     * const error = FFmpegError.fromCode(ret);
     * if (error) {
     *   console.error(`Error: ${error.message}`);
     * }
     * ```
     */
    static fromCode(code: number): FFmpegError | null;
    /**
     * Throw if code indicates an error.
     *
     * Checks if the code is an error and throws an FFmpegError if so.
     * Commonly used pattern for FFmpeg API calls.
     *
     * @param code - FFmpeg return code
     *
     * @param operation - Optional operation name for context
     *
     * @throws {FFmpegError} If code is negative
     *
     * @example
     * ```typescript
     * // Simple error check
     * const ret = codecContext.open(codec);
     * FFmpegError.throwIfError(ret);
     *
     * // With operation context
     * const ret2 = await formatContext.writeHeader();
     * FFmpegError.throwIfError(ret2, 'writeHeader');
     * // Throws: "writeHeader failed: [error message]"
     * ```
     */
    static throwIfError(code: number, operation?: string): void;
    /**
     * Check if code matches specific error.
     *
     * Convenience method to check for specific error codes.
     *
     * @param code - Return code to check
     *
     * @param errorCode - Error code to compare against
     *
     * @returns True if codes match
     *
     * @example
     * ```typescript
     * import { AVERROR_EOF } from 'node-av/constants';
     *
     * if (FFmpegError.is(ret, AVERROR_EOF)) {
     *   console.log('End of file reached');
     * }
     * ```
     */
    static is(code: number, errorCode: number): boolean;
    /**
     * Error code.
     *
     * The FFmpeg error code (negative value).
     */
    get code(): number;
    /**
     * Error message.
     *
     * Human-readable description of the error.
     */
    get message(): string;
    /**
     * Get the underlying native FFmpegError object.
     *
     * @returns The native FFmpegError binding object
     *
     * @internal
     */
    getNative(): NativeFFmpegError;
}
