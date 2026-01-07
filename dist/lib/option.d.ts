import { Dictionary } from './dictionary.js';
import type { AVOptionFlag, AVOptionSearchFlags, AVOptionType, AVOptionTypeBinary, AVOptionTypeBinaryIntArray, AVOptionTypeBool, AVOptionTypeChLayout, AVOptionTypeColor, AVOptionTypeConst, AVOptionTypeDict, AVOptionTypeDouble, AVOptionTypeDuration, AVOptionTypeFlags, AVOptionTypeFloat, AVOptionTypeImageSize, AVOptionTypeInt, AVOptionTypeInt64, AVOptionTypePixelFmt, AVOptionTypeRational, AVOptionTypeSampleFmt, AVOptionTypeString, AVOptionTypeUint, AVOptionTypeUint64, AVOptionTypeVideoRate, AVPixelFormat, AVSampleFormat } from '../constants/index.js';
import type { OptionCapableObject } from './binding.js';
import type { NativeOption } from './native-types.js';
import type { ChannelLayout, IDimension, IRational } from './types.js';
/**
 * Option information descriptor.
 *
 * Describes a single option available on an FFmpeg object.
 * Contains metadata about the option including name, type, default value,
 * valid range, and documentation. Used to discover and validate options.
 *
 * Direct mapping to FFmpeg's AVOption.
 *
 * @example
 * ```typescript
 * import { Option } from 'node-av';
 *
 * // Get option info
 * const optInfo = Option.find(obj, 'bitrate');
 * if (optInfo) {
 *   console.log(`Option: ${optInfo.name}`);
 *   console.log(`Help: ${optInfo.help}`);
 *   console.log(`Type: ${optInfo.type}`);
 *   console.log(`Default: ${optInfo.defaultValue}`);
 *   console.log(`Range: ${optInfo.min} - ${optInfo.max}`);
 * }
 * ```
 *
 * @see [AVOption](https://ffmpeg.org/doxygen/trunk/structAVOption.html) - FFmpeg Doxygen
 */
export declare class OptionInfo {
    private native;
    /**
     * @param native - The native option instance
     *
     * @internal
     */
    constructor(native: NativeOption);
    /**
     * Option name.
     *
     * The name used to get/set this option.
     *
     * Direct mapping to AVOption->name.
     */
    get name(): string | null;
    /**
     * Option help text.
     *
     * Human-readable description of the option's purpose.
     *
     * Direct mapping to AVOption->help.
     */
    get help(): string | null;
    /**
     * Option type.
     *
     * Data type of the option value (AV_OPT_TYPE_*).
     *
     * Direct mapping to AVOption->type.
     */
    get type(): AVOptionType;
    /**
     * Default value.
     *
     * The default value for this option.
     * Type depends on the option type.
     *
     * Direct mapping to AVOption->default_val.
     */
    get defaultValue(): unknown;
    /**
     * Minimum value.
     *
     * Minimum valid value for numeric options.
     *
     * Direct mapping to AVOption->min.
     */
    get min(): number;
    /**
     * Maximum value.
     *
     * Maximum valid value for numeric options.
     *
     * Direct mapping to AVOption->max.
     */
    get max(): number;
    /**
     * Option flags.
     *
     * Combination of AV_OPT_FLAG_* indicating option properties.
     *
     * Direct mapping to AVOption->flags.
     */
    get flags(): AVOptionFlag;
    /**
     * Check if option has specific flags.
     *
     * Tests whether all specified flags are set using bitwise AND.
     *
     * @param flags - One or more flag values to check
     *
     * @returns true if all specified flags are set, false otherwise
     *
     * @example
     * ```typescript
     * import { AV_OPT_FLAG_ENCODING_PARAM } from 'node-av/constants';
     *
     * if (option.hasFlags(AV_OPT_FLAG_ENCODING_PARAM)) {
     *   console.log('This option is used for encoding');
     * }
     * ```
     *
     * @see {@link flags} For direct flags access
     */
    hasFlags(...flags: AVOptionFlag[]): boolean;
    /**
     * Option unit.
     *
     * Unit string for grouping related options.
     *
     * Direct mapping to AVOption->unit.
     */
    get unit(): string | null;
    /**
     * Get the underlying native Option object.
     *
     * @returns The native Option binding object
     *
     * @internal
     */
    getNative(): NativeOption;
}
/**
 * FFmpeg option management utilities.
 *
 * Provides static methods for getting, setting, and querying options
 * on FFmpeg objects that support the AVOption API. Handles type conversion
 * and validation for various option types including strings, numbers,
 * rationals, pixel formats, and more.
 *
 * Direct mapping to FFmpeg's AVOption API.
 *
 * @example
 * ```typescript
 * import { Option, FFmpegError } from 'node-av';
 * import { AV_OPT_SEARCH_CHILDREN, AV_PIX_FMT_YUV420P } from 'node-av/constants';
 *
 * // Set various option types
 * let ret = Option.set(obj, 'preset', 'fast');
 * FFmpegError.throwIfError(ret, 'set preset');
 *
 * ret = Option.setInt(obj, 'bitrate', 2000000);
 * FFmpegError.throwIfError(ret, 'set bitrate');
 *
 * ret = Option.setRational(obj, 'framerate', { num: 30, den: 1 });
 * FFmpegError.throwIfError(ret, 'set framerate');
 *
 * // Get option values
 * const preset = Option.get(obj, 'preset');
 * const bitrate = Option.getInt(obj, 'bitrate');
 * const framerate = Option.getRational(obj, 'framerate');
 *
 * // List all options
 * let opt = null;
 * while ((opt = Option.next(obj, opt))) {
 *   console.log(`${opt.name}: ${opt.help}`);
 * }
 * ```
 *
 * @see [AVOption API](https://ffmpeg.org/doxygen/trunk/group__avoptions.html) - FFmpeg Doxygen
 * @see {@link OptionMember} For inherited option support
 */
export declare class Option {
    /**
     * Iterate to next option.
     *
     * Iterates through available options on an object.
     *
     * Direct mapping to av_opt_next().
     *
     * @param obj - Object with options
     *
     * @param prev - Previous option (null to get first)
     *
     * @returns Next option, or null if no more
     *
     * @example
     * ```typescript
     * let opt = null;
     * while ((opt = Option.next(obj, opt))) {
     *   console.log(`Option: ${opt.name}`);
     * }
     * ```
     */
    static next(obj: OptionCapableObject, prev?: OptionInfo | null): OptionInfo | null;
    /**
     * Find option by name.
     *
     * Searches for an option with the specified name.
     *
     * Direct mapping to av_opt_find().
     *
     * @param obj - Object to search
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Option info if found, null otherwise
     *
     * @example
     * ```typescript
     * const opt = Option.find(obj, 'bitrate');
     * if (opt) {
     *   console.log(`Found: ${opt.name}, Type: ${opt.type}`);
     * }
     * ```
     */
    static find(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): OptionInfo | null;
    /**
     * Find option with target info.
     *
     * Like find() but also indicates if option was found on different target.
     *
     * Direct mapping to av_opt_find2().
     *
     * @param obj - Object to search
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Object with option and target info
     *
     * @example
     * ```typescript
     * const result = Option.find2(obj, 'bitrate', AV_OPT_SEARCH_CHILDREN);
     * if (result?.option) {
     *   console.log(`Found on ${result.isDifferentTarget ? 'child' : 'object'}`);
     * }
     * ```
     */
    static find2(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): {
        option: OptionInfo | null;
        isDifferentTarget: boolean;
    } | null;
    /**
     * Get string option value.
     *
     * Direct mapping to av_opt_get().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Option value as string, or null
     *
     * @example
     * ```typescript
     * // Get codec preset option
     * const preset = Option.get(codecContext, 'preset', AV_OPT_SEARCH_CHILDREN);
     * console.log('Codec preset:', preset); // 'medium', 'fast', etc.
     * ```
     */
    static get(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): string | null;
    /**
     * Get integer option value.
     *
     * Direct mapping to av_opt_get_int().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Option value as integer, or null
     *
     * @example
     * ```typescript
     * // Get codec GOP size
     * const gopSize = Option.getInt(codecContext, 'g', AV_OPT_SEARCH_CHILDREN);
     * console.log('GOP size:', gopSize); // 60, 120, etc.
     * ```
     */
    static getInt(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): number | null;
    /**
     * Get double option value.
     *
     * Direct mapping to av_opt_get_double().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Option value as double, or null
     *
     * @example
     * ```typescript
     * // Get codec quality scale
     * const crf = Option.getDouble(codecContext, 'crf', AV_OPT_SEARCH_CHILDREN);
     * console.log('CRF value:', crf); // 23.0, 18.0, etc.
     * ```
     */
    static getDouble(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): number | null;
    /**
     * Get rational option value.
     *
     * Direct mapping to av_opt_get_q().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Option value as rational, or null
     *
     * @example
     * ```typescript
     * // Get codec time base
     * const timeBase = Option.getRational(codecContext, 'time_base', AV_OPT_SEARCH_CHILDREN);
     * console.log('Time base:', timeBase); // { num: 1, den: 30 }
     * ```
     */
    static getRational(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): IRational | null;
    /**
     * Get pixel format option value.
     *
     * Direct mapping to av_opt_get_pixel_fmt().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Pixel format value, or null
     *
     * @example
     * ```typescript
     * // Get filter pixel format
     * const pixFmt = Option.getPixelFormat(filterContext, 'pix_fmt', AV_OPT_SEARCH_CHILDREN);
     * console.log('Pixel format:', pixFmt); // AV_PIX_FMT_YUV420P, etc.
     * ```
     */
    static getPixelFormat(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): AVPixelFormat | null;
    /**
     * Get sample format option value.
     *
     * Direct mapping to av_opt_get_sample_fmt().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Sample format value, or null
     *
     * @example
     * ```typescript
     * // Get audio codec sample format
     * const sampleFmt = Option.getSampleFormat(codecContext, 'sample_fmt', AV_OPT_SEARCH_CHILDREN);
     * console.log('Sample format:', sampleFmt); // AV_SAMPLE_FMT_FLTP, etc.
     * ```
     */
    static getSampleFormat(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): AVSampleFormat | null;
    /**
     * Get image size option value.
     *
     * Direct mapping to av_opt_get_image_size().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Width and height, or null
     *
     * @example
     * ```typescript
     * // Get filter output size
     * const size = Option.getImageSize(filterContext, 'size', AV_OPT_SEARCH_CHILDREN);
     * console.log('Output size:', size); // { width: 1920, height: 1080 }
     * ```
     */
    static getImageSize(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): IDimension | null;
    /**
     * Get channel layout option value.
     *
     * Direct mapping to av_opt_get_chlayout().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Channel layout, or null
     *
     * @example
     * ```typescript
     * // Get audio channel layout
     * const layout = Option.getChannelLayout(codecContext, 'channel_layout', AV_OPT_SEARCH_CHILDREN);
     * console.log('Channel layout:', layout); // stereo, 5.1, etc.
     * ```
     */
    static getChannelLayout(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): ChannelLayout | null;
    /**
     * Get dictionary option value.
     *
     * Direct mapping to av_opt_get_dict_val().
     *
     * @param obj - Object to query
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns Dictionary value, or null
     *
     * @example
     * ```typescript
     * // Get metadata dictionary
     * const metadata = Option.getDict(formatContext, 'metadata', AV_OPT_SEARCH_CHILDREN);
     * console.log('Metadata:', metadata?.get('title'));
     * ```
     */
    static getDict(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): Dictionary | null;
    /**
     * Set string option value.
     *
     * Direct mapping to av_opt_set().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - String value
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set codec preset
     * const ret = Option.set(codecContext, 'preset', 'fast', AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set preset');
     * ```
     */
    static set(obj: OptionCapableObject, name: string, value: string, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set integer option value.
     *
     * Direct mapping to av_opt_set_int().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Integer value
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set codec bitrate
     * const ret = Option.setInt(codecContext, 'b', 2000000, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set bitrate');
     * ```
     */
    static setInt(obj: OptionCapableObject, name: string, value: number | bigint, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set double option value.
     *
     * Direct mapping to av_opt_set_double().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Double value
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set codec CRF value
     * const ret = Option.setDouble(codecContext, 'crf', 23.0, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set CRF');
     * ```
     */
    static setDouble(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set rational option value.
     *
     * Direct mapping to av_opt_set_q().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Rational value
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set codec frame rate
     * const ret = Option.setRational(codecContext, 'framerate', { num: 30, den: 1 }, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set framerate');
     * ```
     */
    static setRational(obj: OptionCapableObject, name: string, value: IRational, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set pixel format option value.
     *
     * Direct mapping to av_opt_set_pixel_fmt().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Pixel format
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set filter pixel format
     * const ret = Option.setPixelFormat(filterContext, 'pix_fmt', AV_PIX_FMT_YUV420P, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set pixel format');
     * ```
     */
    static setPixelFormat(obj: OptionCapableObject, name: string, value: AVPixelFormat, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set sample format option value.
     *
     * Direct mapping to av_opt_set_sample_fmt().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Sample format
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set audio codec sample format
     * const ret = Option.setSampleFormat(codecContext, 'sample_fmt', AV_SAMPLE_FMT_FLTP, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set sample format');
     * ```
     */
    static setSampleFormat(obj: OptionCapableObject, name: string, value: AVSampleFormat, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set image size option value.
     *
     * Direct mapping to av_opt_set_image_size().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param width - Image width
     *
     * @param height - Image height
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set filter output size
     * const ret = Option.setImageSize(filterContext, 'size', 1920, 1080, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set image size');
     * ```
     */
    static setImageSize(obj: OptionCapableObject, name: string, width: number, height: number, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set channel layout option value.
     *
     * Direct mapping to av_opt_set_chlayout().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Channel layout
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set audio channel layout to stereo
     * const ret = Option.setChannelLayout(codecContext, 'channel_layout', AV_CHANNEL_LAYOUT_STEREO, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set channel layout');
     * ```
     */
    static setChannelLayout(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set dictionary option value.
     *
     * Direct mapping to av_opt_set_dict_val().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Dictionary value
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set metadata dictionary
     * const dict = new Dictionary();
     * dict.set('title', 'My Video');
     * const ret = Option.setDict(formatContext, 'metadata', dict, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set metadata');
     * ```
     */
    static setDict(obj: OptionCapableObject, name: string, value: Dictionary, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set binary option value.
     *
     * Direct mapping to av_opt_set_bin().
     *
     * @param obj - Object to modify
     *
     * @param name - Option name
     *
     * @param value - Binary data
     *
     * @param searchFlags - Search flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Set binary extradata
     * const extradata = Buffer.from([0x00, 0x01, 0x02, 0x03]);
     * const ret = Option.setBin(codecContext, 'extradata', extradata, AV_OPT_SEARCH_CHILDREN);
     * FFmpegError.throwIfError(ret, 'Failed to set extradata');
     * ```
     */
    static setBin(obj: OptionCapableObject, name: string, value: Buffer, searchFlags?: AVOptionSearchFlags): number;
    /**
     * Set defaults on object.
     *
     * Sets all options to their default values.
     *
     * Direct mapping to av_opt_set_defaults().
     *
     * @param obj - Object to reset
     *
     * @example
     * ```typescript
     * // Reset all codec options to defaults
     * Option.setDefaults(codecContext);
     * ```
     */
    static setDefaults(obj: OptionCapableObject): void;
    /**
     * Copy options between objects.
     *
     * Copies option values from source to destination.
     *
     * Direct mapping to av_opt_copy().
     *
     * @param dest - Destination object
     *
     * @param src - Source object
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Copy options from one codec context to another
     * const ret = Option.copy(destCodecContext, srcCodecContext);
     * FFmpegError.throwIfError(ret, 'Failed to copy options');
     * ```
     */
    static copy(dest: OptionCapableObject, src: OptionCapableObject): number;
    /**
     * Check if option is set to default.
     *
     * Direct mapping to av_opt_is_set_to_default().
     *
     * @param obj - Object to check
     *
     * @param name - Option name
     *
     * @param searchFlags - Search flags
     *
     * @returns True if default, false if modified, null if not found
     *
     * @example
     * ```typescript
     * // Check if bitrate is at default value
     * const isDefault = Option.isSetToDefault(codecContext, 'b', AV_OPT_SEARCH_CHILDREN);
     * console.log('Bitrate is default:', isDefault);
     * ```
     */
    static isSetToDefault(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): boolean | null;
    /**
     * Serialize options to string.
     *
     * Direct mapping to av_opt_serialize().
     *
     * @param obj - Object to serialize
     *
     * @param optFlags - Option flags filter
     *
     * @param flags - Serialization flags
     *
     * @param keyValSep - Key-value separator
     *
     * @param pairsSep - Pairs separator
     *
     * @returns Serialized string, or null on error
     *
     * @example
     * ```typescript
     * // Serialize codec options to string
     * const serialized = Option.serialize(codecContext, 0, 0, '=', ':');
     * console.log('Options:', serialized); // 'bitrate=2000000:preset=fast'
     * ```
     */
    static serialize(obj: OptionCapableObject, optFlags?: number, flags?: number, keyValSep?: string, pairsSep?: string): string | null;
    /**
     * Free option resources.
     *
     * Direct mapping to av_opt_free().
     *
     * @param obj - Object to free options from
     *
     * @example
     * ```typescript
     * // Free codec context options
     * Option.free(codecContext);
     * ```
     */
    static free(obj: OptionCapableObject): void;
    /**
     * Show options for debugging.
     *
     * Direct mapping to av_opt_show2().
     *
     * @param obj - Object to show options for
     *
     * @param reqFlags - Required flags
     *
     * @param rejFlags - Rejected flags
     *
     * @returns 0 on success, negative AVERROR on error
     *
     * @example
     * ```typescript
     * // Show all codec options for debugging
     * const ret = Option.show(codecContext, 0, 0);
     * FFmpegError.throwIfError(ret, 'Failed to show options');
     * ```
     */
    static show(obj: OptionCapableObject, reqFlags?: number, rejFlags?: number): number;
}
/**
 * Base class for FFmpeg objects that support AVOptions.
 *
 * Provides a common interface for getting, setting, and listing options
 * on FFmpeg objects that have an AVClass structure. This includes codecs,
 * formats, filters, and various processing contexts.
 *
 * Classes that support AVOptions should extend this class to inherit
 * the option management functionality.
 *
 * @template T - The native FFmpeg object type that supports AVOptions
 *
 * @example
 * ```typescript
 * import { OptionMember, FFmpegError } from 'node-av';
 * import { AV_OPT_TYPE_INT, AV_OPT_TYPE_STRING, AV_OPT_TYPE_RATIONAL } from 'node-av/constants';
 *
 * class CodecContext extends OptionMember<NativeCodecContext> {
 *   constructor(native: NativeCodecContext) {
 *     super(native);
 *   }
 * }
 *
 * // Use inherited methods
 * const codec = new CodecContext(native);
 *
 * // Set options with automatic type handling
 * let ret = codec.setOption('preset', 'fast');
 * FFmpegError.throwIfError(ret, 'set preset');
 *
 * ret = codec.setOption('bitrate', 2000000, AV_OPT_TYPE_INT);
 * FFmpegError.throwIfError(ret, 'set bitrate');
 *
 * ret = codec.setOption('framerate', { num: 30, den: 1 }, AV_OPT_TYPE_RATIONAL);
 * FFmpegError.throwIfError(ret, 'set framerate');
 *
 * // Get typed options
 * const preset = codec.getOption('preset');
 * const bitrate = codec.getOption('bitrate', AV_OPT_TYPE_INT);
 * const framerate = codec.getOption('framerate', AV_OPT_TYPE_RATIONAL);
 *
 * // List all available options
 * const options = codec.listOptions();
 * for (const opt of options) {
 *   console.log(`${opt.name}: ${opt.help}`);
 * }
 * ```
 *
 * @see {@link Option} For static option methods
 * @see {@link OptionInfo} For option metadata
 */
export declare class OptionMember<T extends OptionCapableObject> {
    protected native: T;
    constructor(native: T);
    setOption(name: string, value: string | number | boolean | bigint | null | undefined): number;
    setOption(name: string, value: string, type: AVOptionTypeString, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: string, type: AVOptionTypeColor, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeInt, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: bigint, type: AVOptionTypeInt64, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeUint, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: bigint, type: AVOptionTypeUint64, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeFlags, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: boolean, type: AVOptionTypeBool, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeDuration, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeConst, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeDouble, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number, type: AVOptionTypeFloat, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: IRational, type: AVOptionTypeRational, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: IRational, type: AVOptionTypeVideoRate, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: AVPixelFormat, type: AVOptionTypePixelFmt, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: AVSampleFormat, type: AVOptionTypeSampleFmt, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: IDimension, type: AVOptionTypeImageSize, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number | bigint, type: AVOptionTypeChLayout, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: Buffer, type: AVOptionTypeBinary, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: number[], type: AVOptionTypeBinaryIntArray, searchFlags?: AVOptionSearchFlags): number;
    setOption(name: string, value: Dictionary, type: AVOptionTypeDict, searchFlags?: AVOptionSearchFlags): number;
    getOption(name: string, type?: AVOptionTypeString, searchFlags?: AVOptionSearchFlags): string | null;
    getOption(name: string, type: AVOptionTypeColor, searchFlags?: AVOptionSearchFlags): string | null;
    getOption(name: string, type: AVOptionTypeInt, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeInt64, searchFlags?: AVOptionSearchFlags): bigint | null;
    getOption(name: string, type: AVOptionTypeUint, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeUint64, searchFlags?: AVOptionSearchFlags): bigint | null;
    getOption(name: string, type: AVOptionTypeFlags, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeBool, searchFlags?: AVOptionSearchFlags): boolean | null;
    getOption(name: string, type: AVOptionTypeDuration, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeConst, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeDouble, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeFloat, searchFlags?: AVOptionSearchFlags): number | null;
    getOption(name: string, type: AVOptionTypeRational, searchFlags?: AVOptionSearchFlags): IRational | null;
    getOption(name: string, type: AVOptionTypeVideoRate, searchFlags?: AVOptionSearchFlags): IRational | null;
    getOption(name: string, type: AVOptionTypePixelFmt, searchFlags?: AVOptionSearchFlags): AVPixelFormat | null;
    getOption(name: string, type: AVOptionTypeSampleFmt, searchFlags?: AVOptionSearchFlags): AVSampleFormat | null;
    getOption(name: string, type: AVOptionTypeImageSize, searchFlags?: AVOptionSearchFlags): IDimension | null;
    getOption(name: string, type: AVOptionTypeChLayout, searchFlags?: AVOptionSearchFlags): ChannelLayout | null;
    getOption(name: string, type: AVOptionTypeDict, searchFlags?: AVOptionSearchFlags): Dictionary | null;
    getOption(name: string, type: AVOptionTypeBinary, searchFlags?: AVOptionSearchFlags): string | null;
    /**
     * List all available options for this object.
     *
     * Uses the AVOption API to enumerate all options.
     * Useful for discovering available settings and their types.
     *
     * Direct mapping to av_opt_next() iteration.
     *
     * @returns Array of option information objects
     *
     * @example
     * ```typescript
     * const options = obj.listOptions();
     * for (const opt of options) {
     *   console.log(`${opt.name}: ${opt.help}`);
     *   console.log(`  Type: ${opt.type}, Default: ${opt.defaultValue}`);
     *   console.log(`  Range: ${opt.min} - ${opt.max}`);
     * }
     * ```
     *
     * @see {@link OptionInfo} For option metadata structure
     */
    listOptions(): OptionInfo[];
    /**
     * Intelligently set a format option based on its FFmpeg type.
     *
     * Queries the option type using av_opt_find() and calls the appropriate
     * typed setOption() overload. Handles automatic type conversion from
     * JavaScript types to FFmpeg option types.
     *
     * @param name - Option name
     *
     * @param value - Option value (null/undefined are skipped)
     *
     * @returns 0 on success, negative on error
     *
     * @internal
     */
    private setUnknownOption;
}
