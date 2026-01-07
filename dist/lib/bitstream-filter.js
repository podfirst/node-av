import { bindings } from './binding.js';
/**
 * Bitstream filter descriptor.
 *
 * Provides access to bitstream filter properties and codec compatibility information.
 * Bitstream filters are used to modify or analyze compressed bitstreams without
 * full decoding/encoding. Common uses include H.264/HEVC parameter set extraction,
 * VP9 superframe splitting, and adding/removing codec-specific headers.
 *
 * Direct mapping to FFmpeg's AVBitStreamFilter.
 *
 * @example
 * ```typescript
 * import { BitStreamFilter } from 'node-av';
 *
 * // Get a specific bitstream filter
 * const h264Filter = BitStreamFilter.getByName('h264_mp4toannexb');
 * if (h264Filter) {
 *   console.log(`Filter: ${h264Filter.name}`);
 *   console.log(`Supported codecs: ${h264Filter.codecIds}`);
 * }
 *
 * // List all available bitstream filters
 * const filters = BitStreamFilter.iterate();
 * for (const filter of filters) {
 *   console.log(`- ${filter.name}`);
 * }
 * ```
 *
 * @see [AVBitStreamFilter](https://ffmpeg.org/doxygen/trunk/structAVBitStreamFilter.html) - FFmpeg Doxygen
 */
export class BitStreamFilter {
    native;
    /**
     * @param native The native bitstream filter instance
     *
     * @internal
     */
    constructor(native) {
        this.native = native;
    }
    /**
     * Get a bitstream filter by name.
     *
     * Retrieves a specific bitstream filter descriptor by its name.
     * Common filter names include 'h264_mp4toannexb', 'hevc_mp4toannexb',
     * 'extract_extradata', 'vp9_superframe', etc.
     *
     * Direct mapping to av_bsf_get_by_name().
     *
     * @param name - Name of the bitstream filter
     *
     * @returns BitStreamFilter instance if found, null otherwise
     *
     * @example
     * ```typescript
     * // Get H.264 stream format converter
     * const h264Filter = BitStreamFilter.getByName('h264_mp4toannexb');
     * if (!h264Filter) {
     *   throw new Error('H.264 bitstream filter not available');
     * }
     *
     * // Get HEVC metadata extractor
     * const hevcFilter = BitStreamFilter.getByName('hevc_metadata');
     * ```
     *
     * @see {@link iterate} To list all available filters
     * @see {@link BitStreamFilterContext.alloc} To use the filter
     */
    static getByName(name) {
        const native = bindings.BitStreamFilter.getByName(name);
        return native ? new BitStreamFilter(native) : null;
    }
    /**
     * Iterate over all available bitstream filters.
     *
     * Returns an array of all registered bitstream filters in FFmpeg.
     * Useful for discovering available filters or building filter lists.
     *
     * Direct mapping to av_bsf_iterate().
     *
     * @returns Array of all available bitstream filters
     *
     * @example
     * ```typescript
     * import { BitStreamFilter } from 'node-av';
     * import { AV_CODEC_ID_H264 } from 'node-av/constants';
     *
     * // List all available filters
     * const filters = BitStreamFilter.iterate();
     * console.log(`Found ${filters.length} bitstream filters`);
     *
     * // Find filters that support H.264
     * const h264Filters = filters.filter(f =>
     *   f.codecIds?.includes(AV_CODEC_ID_H264)
     * );
     * console.log('H.264 compatible filters:');
     * for (const filter of h264Filters) {
     *   console.log(`- ${filter.name}`);
     * }
     * ```
     *
     * @see {@link getByName} To get a specific filter
     */
    static iterate() {
        const natives = bindings.BitStreamFilter.iterate();
        return natives.map((native) => new BitStreamFilter(native));
    }
    /**
     * Name of the bitstream filter.
     *
     * Human-readable name identifying the filter (e.g., 'h264_mp4toannexb').
     *
     * Direct mapping to AVBitStreamFilter->name.
     */
    get name() {
        return this.native.name;
    }
    /**
     * List of supported codec IDs.
     *
     * Array of codec IDs that this filter can process.
     * If null, the filter supports all codecs.
     *
     * Direct mapping to AVBitStreamFilter->codec_ids.
     *
     * @example
     * ```typescript
     * import { AV_CODEC_ID_H264, AV_CODEC_ID_HEVC } from 'node-av/constants';
     *
     * const filter = BitStreamFilter.getByName('extract_extradata');
     * if (filter?.codecIds) {
     *   const supportsH264 = filter.codecIds.includes(AV_CODEC_ID_H264);
     *   const supportsHEVC = filter.codecIds.includes(AV_CODEC_ID_HEVC);
     *   console.log(`H.264 support: ${supportsH264}`);
     *   console.log(`HEVC support: ${supportsHEVC}`);
     * }
     * ```
     */
    get codecIds() {
        return this.native.codecIds;
    }
    /**
     * Get the underlying native BitStreamFilter object.
     *
     * @returns The native BitStreamFilter binding object
     *
     * @internal
     */
    getNative() {
        return this.native;
    }
}
//# sourceMappingURL=bitstream-filter.js.map