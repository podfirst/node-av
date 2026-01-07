import { CodecParameters } from './codec-parameters.js';
import { CodecParser } from './codec-parser.js';
import { Dictionary } from './dictionary.js';
import { Rational } from './rational.js';
/**
 * Media stream within a format context.
 *
 * Represents a single stream (video, audio, subtitle, etc.) within a media container.
 * Contains stream-specific information including codec parameters, timing information,
 * metadata, and disposition flags. Each stream in a file has a unique index and may
 * contain packets of compressed data.
 *
 * Direct mapping to FFmpeg's AVStream.
 *
 * @example
 * ```typescript
 * import { FormatContext, FFmpegError } from 'node-av';
 * import { AVMEDIA_TYPE_VIDEO, AVMEDIA_TYPE_AUDIO } from 'node-av/constants';
 *
 * // Access streams from format context
 * const formatContext = new FormatContext();
 * await formatContext.openInput('video.mp4');
 *
 * // Iterate through streams
 * for (let i = 0; i < formatContext.nbStreams; i++) {
 *   const stream = formatContext.streams[i];
 *   const codecpar = stream.codecpar;
 *
 *   if (codecpar.codecType === AVMEDIA_TYPE_VIDEO) {
 *     console.log(`Video stream ${stream.index}:`);
 *     console.log(`  Codec: ${codecpar.codecId}`);
 *     console.log(`  Resolution: ${codecpar.width}x${codecpar.height}`);
 *     console.log(`  Frame rate: ${stream.avgFrameRate.num}/${stream.avgFrameRate.den}`);
 *   } else if (codecpar.codecType === AVMEDIA_TYPE_AUDIO) {
 *     console.log(`Audio stream ${stream.index}:`);
 *     console.log(`  Sample rate: ${codecpar.sampleRate} Hz`);
 *     console.log(`  Channels: ${codecpar.channels}`);
 *   }
 * }
 * ```
 *
 * @see [AVStream](https://ffmpeg.org/doxygen/trunk/structAVStream.html) - FFmpeg Doxygen
 * @see {@link FormatContext} For container operations
 * @see {@link CodecParameters} For codec configuration
 */
export class Stream {
    native;
    _metadata; // Cache for metadata wrapper
    _codecpar; // Cache the wrapped codecpar
    _parser; // Cache the wrapped parser
    /**
     * @param native - The native stream instance
     *
     * @internal
     */
    constructor(native) {
        this.native = native;
    }
    /**
     * Stream index.
     *
     * Zero-based index of this stream in the format context.
     * Used to identify packets belonging to this stream.
     *
     * Direct mapping to AVStream->index.
     */
    get index() {
        return this.native.index;
    }
    /**
     * Stream ID.
     *
     * Format-specific stream identifier.
     * May be used by some formats for internal stream identification.
     *
     * Direct mapping to AVStream->id.
     */
    get id() {
        return this.native.id;
    }
    set id(value) {
        this.native.id = value;
    }
    /**
     * Codec parameters.
     *
     * Contains essential codec configuration for this stream.
     * Used to initialize decoders and describe stream properties.
     *
     * Direct mapping to AVStream->codecpar.
     */
    get codecpar() {
        // Return cached wrapper if we already have one
        if (this._codecpar) {
            return this._codecpar;
        }
        // Create and cache the wrapper
        const params = Object.create(CodecParameters.prototype);
        params.native = this.native.codecpar;
        this._codecpar = params;
        return params;
    }
    set codecpar(value) {
        // Copy codec parameters to the stream
        // The native binding handles the copying
        this.native.codecpar = value.getNative();
        // Clear the cache as the underlying parameters have changed
        this._codecpar = undefined;
    }
    /**
     * Stream time base.
     *
     * Unit of time for timestamps in this stream.
     * All timestamps (PTS/DTS) are in units of this time base.
     *
     * Direct mapping to AVStream->time_base.
     */
    get timeBase() {
        const tb = this.native.timeBase;
        return new Rational(tb.num, tb.den);
    }
    set timeBase(value) {
        this.native.timeBase = { num: value.num, den: value.den };
    }
    /**
     * Start time.
     *
     * First timestamp of the stream in stream time base units.
     * AV_NOPTS_VALUE if unknown.
     *
     * Direct mapping to AVStream->start_time.
     */
    get startTime() {
        return this.native.startTime;
    }
    set startTime(value) {
        this.native.startTime = value;
    }
    /**
     * Stream duration.
     *
     * Total duration in stream time base units.
     * AV_NOPTS_VALUE if unknown.
     *
     * Direct mapping to AVStream->duration.
     */
    get duration() {
        return this.native.duration;
    }
    set duration(value) {
        this.native.duration = value;
    }
    /**
     * Number of frames.
     *
     * Total number of frames in this stream.
     * 0 if unknown.
     *
     * Direct mapping to AVStream->nb_frames.
     */
    get nbFrames() {
        return this.native.nbFrames;
    }
    set nbFrames(value) {
        this.native.nbFrames = value;
    }
    /**
     * Stream disposition flags.
     *
     * Combination of AV_DISPOSITION_* flags indicating stream properties
     * (e.g., default, forced subtitles, visual impaired, etc.).
     *
     * Direct mapping to AVStream->disposition.
     */
    get disposition() {
        return this.native.disposition;
    }
    set disposition(value) {
        this.native.disposition = value;
    }
    /**
     * Discard setting.
     *
     * Indicates which packets can be discarded during demuxing.
     * Used to skip non-essential packets for performance.
     *
     * Direct mapping to AVStream->discard.
     */
    get discard() {
        return this.native.discard;
    }
    set discard(value) {
        this.native.discard = value;
    }
    /**
     * Sample aspect ratio.
     *
     * Pixel aspect ratio for video streams.
     * 0/1 if unknown or not applicable.
     *
     * Direct mapping to AVStream->sample_aspect_ratio.
     */
    get sampleAspectRatio() {
        const sar = this.native.sampleAspectRatio;
        return new Rational(sar.num || 0, sar.den || 1);
    }
    set sampleAspectRatio(value) {
        this.native.sampleAspectRatio = { num: value.num, den: value.den };
    }
    /**
     * Average frame rate.
     *
     * Average framerate of the stream.
     * 0/1 if unknown or variable frame rate.
     *
     * Direct mapping to AVStream->avg_frame_rate.
     */
    get avgFrameRate() {
        const fr = this.native.avgFrameRate;
        // Handle 0/0 case (unknown frame rate in FFmpeg)
        if (fr.den === 0) {
            return new Rational(0, 1);
        }
        return new Rational(fr.num, fr.den);
    }
    set avgFrameRate(value) {
        this.native.avgFrameRate = { num: value.num, den: value.den };
    }
    /**
     * Real frame rate.
     *
     * Real base frame rate of the stream.
     * This is the lowest common multiple of all frame rates in the stream.
     *
     * Direct mapping to AVStream->r_frame_rate.
     */
    get rFrameRate() {
        const fr = this.native.rFrameRate;
        // Handle 0/0 case (unknown frame rate in FFmpeg)
        if (fr.den === 0) {
            return new Rational(0, 1);
        }
        return new Rational(fr.num, fr.den);
    }
    set rFrameRate(value) {
        this.native.rFrameRate = { num: value.num, den: value.den };
    }
    /**
     * Number of bits for PTS wrap-around detection.
     *
     * Used for timestamp wrap-around correction in formats with limited timestamp bits.
     * Common values: 33 (MPEG-TS), 31 (DVB), 64 (no wrapping).
     *
     * Direct mapping to AVStream->pts_wrap_bits.
     */
    get ptsWrapBits() {
        return this.native.ptsWrapBits;
    }
    set ptsWrapBits(value) {
        this.native.ptsWrapBits = value;
    }
    /**
     * Stream metadata.
     *
     * Dictionary containing stream-specific metadata
     * (e.g., language, title, encoder settings).
     *
     * Direct mapping to AVStream->metadata.
     */
    get metadata() {
        const native = this.native.metadata;
        if (!native) {
            // Clear cache if native is null
            this._metadata = undefined;
            return null;
        }
        // Return cached wrapper if available and still valid
        if (this._metadata && this._metadata.native === native) {
            return this._metadata;
        }
        // Create and cache new wrapper
        const device = Object.create(Dictionary.prototype);
        device.native = native;
        this._metadata = device;
        return device;
    }
    set metadata(value) {
        this.native.metadata = value?.getNative() ?? null;
        this._metadata = undefined;
    }
    /**
     * Attached picture.
     *
     * For streams with AV_DISPOSITION_ATTACHED_PIC set,
     * contains the attached picture (e.g., album art).
     *
     * Direct mapping to AVStream->attached_pic.
     */
    get attachedPic() {
        return this.native.attachedPic;
    }
    /**
     * Event flags.
     *
     * Flags indicating events that happened to the stream.
     * Used for signaling format changes.
     *
     * Direct mapping to AVStream->event_flags.
     */
    get eventFlags() {
        return this.native.eventFlags;
    }
    set eventFlags(value) {
        this.native.eventFlags = value;
    }
    /**
     * Get the codec parser attached to this stream.
     *
     * Returns the parser context if the stream has an active parser, null otherwise.
     * Parsers are automatically created by FFmpeg for certain formats and codecs.
     * Useful for accessing parser state like repeat_pict for interlaced video.
     *
     * Direct mapping to av_stream_get_parser().
     *
     * @returns Parser context or null if no parser attached
     *
     * @example
     * ```typescript
     * const parser = stream.parser;
     * if (parser) {
     *   const fields = 1 + parser.repeatPict;
     *   console.log(`Frame uses ${fields} fields`);
     * }
     * ```
     *
     * @see {@link CodecParser} For parser details
     */
    get parser() {
        const native = this.native.parser;
        if (!native) {
            // Clear cache if native is null
            this._parser = undefined;
            return null;
        }
        // Return cached wrapper if available and still valid
        if (this._parser && this._parser.native === native) {
            return this._parser;
        }
        // Create and cache new wrapper
        const parser = Object.create(CodecParser.prototype);
        parser.native = native;
        this._parser = parser;
        return parser;
    }
    /**
     * Set stream event flags.
     *
     * Sets one or more event flags using bitwise OR. Allows setting multiple flags
     * without manually performing bitwise operations.
     *
     * @param flags - One or more event flag values to set
     *
     * @example
     * ```typescript
     * import { AVSTREAM_EVENT_FLAG_METADATA_UPDATED, AVSTREAM_EVENT_FLAG_NEW_PACKETS } from 'node-av/constants';
     *
     * // Set multiple event flags at once
     * stream.setEventFlags(AVSTREAM_EVENT_FLAG_METADATA_UPDATED, AVSTREAM_EVENT_FLAG_NEW_PACKETS);
     * ```
     *
     * @see {@link clearEventFlags} To unset event flags
     * @see {@link hasEventFlags} To check event flags
     * @see {@link eventFlags} For direct event flag access
     */
    setEventFlags(...flags) {
        for (const flag of flags) {
            this.native.eventFlags = (this.native.eventFlags | flag);
        }
    }
    /**
     * Clear stream event flags.
     *
     * Clears one or more event flags using bitwise AND NOT. Allows clearing multiple
     * flags without manually performing bitwise operations.
     *
     * @param flags - One or more event flag values to clear
     *
     * @example
     * ```typescript
     * import { AVSTREAM_EVENT_FLAG_METADATA_UPDATED } from 'node-av/constants';
     *
     * // Clear specific event flag
     * stream.clearEventFlags(AVSTREAM_EVENT_FLAG_METADATA_UPDATED);
     * ```
     *
     * @see {@link setEventFlags} To set event flags
     * @see {@link hasEventFlags} To check event flags
     * @see {@link eventFlags} For direct event flag access
     */
    clearEventFlags(...flags) {
        for (const flag of flags) {
            this.native.eventFlags = (this.native.eventFlags & ~flag);
        }
    }
    /**
     * Check if stream has specific event flags.
     *
     * Tests whether all specified event flags are set using bitwise AND.
     *
     * @param flags - One or more event flag values to check
     *
     * @returns true if all specified event flags are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AVSTREAM_EVENT_FLAG_METADATA_UPDATED } from 'node-av/constants';
     *
     * if (stream.hasEventFlags(AVSTREAM_EVENT_FLAG_METADATA_UPDATED)) {
     *   console.log('Stream metadata was updated');
     * }
     * ```
     *
     * @see {@link setEventFlags} To set event flags
     * @see {@link clearEventFlags} To unset event flags
     * @see {@link eventFlags} For direct event flag access
     */
    hasEventFlags(...flags) {
        for (const flag of flags) {
            if ((this.native.eventFlags & flag) !== flag) {
                return false;
            }
        }
        return true;
    }
    /**
     * Set stream disposition flags.
     *
     * Sets one or more disposition flags using bitwise OR. Allows setting multiple flags
     * without manually performing bitwise operations.
     *
     * @param flags - One or more disposition flag values to set
     *
     * @example
     * ```typescript
     * import { AV_DISPOSITION_DEFAULT, AV_DISPOSITION_FORCED } from 'node-av/constants';
     *
     * // Set multiple disposition flags at once
     * stream.setDisposition(AV_DISPOSITION_DEFAULT, AV_DISPOSITION_FORCED);
     * ```
     *
     * @see {@link clearDisposition} To unset disposition flags
     * @see {@link hasDisposition} To check disposition flags
     * @see {@link disposition} For direct disposition flag access
     */
    setDisposition(...flags) {
        for (const flag of flags) {
            this.native.disposition = (this.native.disposition | flag);
        }
    }
    /**
     * Clear stream disposition flags.
     *
     * Clears one or more disposition flags using bitwise AND NOT. Allows clearing multiple
     * flags without manually performing bitwise operations.
     *
     * @param flags - One or more disposition flag values to clear
     *
     * @example
     * ```typescript
     * import { AV_DISPOSITION_FORCED } from 'node-av/constants';
     *
     * // Clear specific disposition flag
     * stream.clearDisposition(AV_DISPOSITION_FORCED);
     * ```
     *
     * @see {@link setDisposition} To set disposition flags
     * @see {@link hasDisposition} To check disposition flags
     * @see {@link disposition} For direct disposition flag access
     */
    clearDisposition(...flags) {
        for (const flag of flags) {
            this.native.disposition = (this.native.disposition & ~flag);
        }
    }
    /**
     * Check if stream has specific disposition flags.
     *
     * Tests whether all specified disposition flags are set using bitwise AND.
     *
     * @param flags - One or more disposition flag values to check
     *
     * @returns true if all specified disposition flags are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AV_DISPOSITION_DEFAULT } from 'node-av/constants';
     *
     * if (stream.hasDisposition(AV_DISPOSITION_DEFAULT)) {
     *   console.log('Stream is marked as default');
     * }
     * ```
     *
     * @see {@link setDisposition} To set disposition flags
     * @see {@link clearDisposition} To unset disposition flags
     * @see {@link disposition} For direct disposition flag access
     */
    hasDisposition(...flags) {
        for (const flag of flags) {
            if ((this.native.disposition & flag) !== flag) {
                return false;
            }
        }
        return true;
    }
    /**
     * Get the underlying native Stream object.
     *
     * @returns The native Stream binding object
     *
     * @internal
     */
    getNative() {
        return this.native;
    }
}
//# sourceMappingURL=stream.js.map