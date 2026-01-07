import { bindings } from './binding.js';
/**
 * Output format descriptor for muxing media files.
 *
 * Represents a muxer that can write specific media container formats.
 * Each format handles specific file types (e.g., MP4, MKV, AVI) and knows how to
 * combine streams and write them to output. Contains default codec suggestions
 * for audio, video, and subtitles.
 *
 * Direct mapping to FFmpeg's AVOutputFormat.
 *
 * @example
 * ```typescript
 * import { OutputFormat, FormatContext, FFmpegError } from 'node-av';
 * import { AV_CODEC_ID_H264, AV_CODEC_ID_AAC } from 'node-av/constants';
 *
 * // Guess format from filename
 * const format = OutputFormat.guessFormat(null, 'output.mp4', null);
 * if (!format) {
 *   throw new Error('Could not determine output format');
 * }
 *
 * console.log(`Format: ${format.name}`);
 * console.log(`Description: ${format.longName}`);
 * console.log(`Default video codec: ${format.videoCodec}`);
 * console.log(`Default audio codec: ${format.audioCodec}`);
 *
 * // Use specific format
 * const mkvFormat = OutputFormat.guessFormat('matroska', null, null);
 *
 * // Use with format context
 * const formatContext = new FormatContext();
 * formatContext.outputFormat = format;
 * const ret = await formatContext.allocOutputContext('output.mp4');
 * FFmpegError.throwIfError(ret, 'allocOutputContext');
 * ```
 *
 * @see [AVOutputFormat](https://ffmpeg.org/doxygen/trunk/structAVOutputFormat.html) - FFmpeg Doxygen
 * @see {@link FormatContext} For using formats to write files
 * @see {@link InputFormat} For demuxing formats
 */
export class OutputFormat {
    native;
    /**
     * @param native - The native output format instance
     *
     * @internal
     */
    constructor(native) {
        this.native = native;
    }
    /**
     * Guess output format from name, filename, or MIME type.
     *
     * Determines the appropriate output format based on provided hints.
     * At least one parameter should be non-null.
     *
     * Direct mapping to av_guess_format().
     *
     * @param shortName - Format short name (e.g., 'mp4', 'mkv', null to ignore)
     *
     * @param filename - Output filename for extension detection (null to ignore)
     *
     * @param mimeType - MIME type hint (null to ignore)
     *
     * @returns Detected format, or null if not determined
     *
     * @example
     * ```typescript
     * // Guess from filename extension
     * const format1 = OutputFormat.guessFormat(null, 'video.mp4', null);
     * // Returns MP4 format
     *
     * // Use specific format
     * const format2 = OutputFormat.guessFormat('matroska', null, null);
     * // Returns MKV format
     *
     * // Guess from MIME type
     * const format3 = OutputFormat.guessFormat(null, null, 'video/mp4');
     * // Returns MP4 format
     *
     * // Priority: shortName > filename > mimeType
     * const format4 = OutputFormat.guessFormat('mkv', 'video.mp4', null);
     * // Returns MKV format (shortName takes precedence)
     * ```
     */
    static guessFormat(shortName, filename, mimeType) {
        const native = bindings.OutputFormat.guessFormat(shortName, filename, mimeType);
        if (!native) {
            return null;
        }
        return new OutputFormat(native);
    }
    /**
     * Format short name.
     *
     * Short identifier for the format (e.g., 'mp4', 'mkv').
     *
     * Direct mapping to AVOutputFormat->name.
     */
    get name() {
        return this.native.name;
    }
    /**
     * Format long name.
     *
     * Human-readable description of the format.
     *
     * Direct mapping to AVOutputFormat->long_name.
     */
    get longName() {
        return this.native.longName;
    }
    /**
     * File extensions.
     *
     * Comma-separated list of file extensions for this format.
     *
     * Direct mapping to AVOutputFormat->extensions.
     */
    get extensions() {
        return this.native.extensions;
    }
    /**
     * MIME type.
     *
     * MIME type(s) associated with this format.
     *
     * Direct mapping to AVOutputFormat->mime_type.
     */
    get mimeType() {
        return this.native.mimeType;
    }
    /**
     * Default audio codec.
     *
     * Suggested audio codec for this format.
     *
     * Direct mapping to AVOutputFormat->audio_codec.
     */
    get audioCodec() {
        return this.native.audioCodec;
    }
    /**
     * Default video codec.
     *
     * Suggested video codec for this format.
     *
     * Direct mapping to AVOutputFormat->video_codec.
     */
    get videoCodec() {
        return this.native.videoCodec;
    }
    /**
     * Default subtitle codec.
     *
     * Suggested subtitle codec for this format.
     *
     * Direct mapping to AVOutputFormat->subtitle_codec.
     */
    get subtitleCodec() {
        return this.native.subtitleCodec;
    }
    /**
     * Format flags.
     *
     * Combination of AVFMT_* flags indicating format capabilities.
     *
     * Direct mapping to AVOutputFormat->flags.
     */
    get flags() {
        return this.native.flags;
    }
    /**
     * Check if output format has specific flags.
     *
     * Tests whether all specified flags are set using bitwise AND.
     *
     * @param flags - One or more flag values to check
     *
     * @returns true if all specified flags are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AVFMT_GLOBALHEADER } from 'node-av/constants';
     *
     * if (outputFormat.hasFlags(AVFMT_GLOBALHEADER)) {
     *   console.log('This format requires global headers');
     * }
     * ```
     *
     * @see {@link flags} For direct flags access
     */
    hasFlags(...flags) {
        for (const flag of flags) {
            if ((this.native.flags & flag) !== flag) {
                return false;
            }
        }
        return true;
    }
    /**
     * Get the underlying native OutputFormat object.
     *
     * @returns The native OutputFormat binding object
     *
     * @internal
     */
    getNative() {
        return this.native;
    }
}
//# sourceMappingURL=output-format.js.map