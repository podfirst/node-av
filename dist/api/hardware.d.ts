import { Codec } from '../lib/codec.js';
import { HardwareDeviceContext } from '../lib/hardware-device-context.js';
import { Stream } from '../lib/stream.js';
import type { AVCodecID, AVHWDeviceType, AVPixelFormat, FFDecoderCodec, FFEncoderCodec, FFHWDeviceType } from '../constants/index.js';
import type { BaseCodecName, HardwareOptions } from './types.js';
/**
 * High-level hardware acceleration management.
 *
 * Provides automatic detection and configuration of hardware acceleration for media processing.
 * Manages device contexts for GPU-accelerated encoding and decoding operations.
 * Supports various hardware types including VideoToolbox, CUDA, VAAPI, D3D11VA, and more.
 * Essential for high-performance video processing with reduced CPU usage.
 *
 * @example
 * ```typescript
 * import { HardwareContext } from 'node-av/api';
 * import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';
 *
 * // Auto-detect best available hardware
 * const hw = HardwareContext.auto();
 * if (hw) {
 *   console.log(`Using hardware: ${hw.deviceTypeName}`);
 *   const decoder = await Decoder.create(stream, { hardware: hw });
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use specific hardware type
 * const hw = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
 * const encoderCodec = hw?.getEncoderCodec('h264') ?? FF_ENCODER_LIBX264;
 * const encoder = await Encoder.create(encoderCodec, { ... });
 * hw.dispose();
 * ```
 *
 * @see {@link Decoder} For hardware-accelerated decoding
 * @see {@link Encoder} For hardware-accelerated encoding
 */
export declare class HardwareContext implements Disposable {
    private _deviceContext;
    private _deviceType;
    private _deviceTypeName;
    private _devicePixelFormat;
    private _isDisposed;
    /**
     * @param deviceContext - Initialized hardware device context
     *
     * @param deviceType - Hardware device type enum
     *
     * @param deviceTypeName - Human-readable device type name
     *
     * @internal
     */
    private constructor();
    /**
     * Auto-detect and create the best available hardware context.
     *
     * Tries hardware types in order of preference based on platform.
     * Returns null if no hardware acceleration is available.
     * Platform-specific preference order ensures optimal performance.
     *
     * @param options - Optional hardware configuration
     *
     * @returns Hardware context or null if unavailable
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * if (hw) {
     *   console.log(`Auto-detected: ${hw.deviceTypeName}`);
     *   // Use for decoder/encoder
     * }
     * ```
     *
     * @example
     * ```typescript
     * // With specific device
     * const hw = HardwareContext.auto({
     *   deviceName: '/dev/dri/renderD128'
     * });
     * ```
     *
     * @see {@link create} For specific hardware type
     * @see {@link listAvailable} To check available types
     */
    static auto(options?: HardwareOptions): HardwareContext | null;
    /**
     * Create a hardware context for a specific device type.
     *
     * Creates and initializes a hardware device context.
     * Throws if the device type is not supported or initialization fails.
     *
     * Direct mapping to av_hwdevice_ctx_create().
     *
     * @param deviceType - Hardware device type from AVHWDeviceType
     *
     * @param device - Optional device specifier (e.g., GPU index, device path)
     *
     * @param options - Optional device initialization options
     *
     * @returns Initialized hardware context or null if HardwareContext could not be created
     *
     * @example
     * ```typescript
     * import { AV_HWDEVICE_TYPE_CUDA } from 'node-av/constants';
     *
     * // CUDA with specific GPU
     * const cuda = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA, '0');
     * ```
     *
     * @example
     * ```typescript
     * import { AV_HWDEVICE_TYPE_VAAPI } from 'node-av/constants';
     *
     * // VAAPI with render device
     * const vaapi = HardwareContext.create(
     *   AV_HWDEVICE_TYPE_VAAPI,
     *   '/dev/dri/renderD128'
     * );
     * ```
     *
     * @see {@link auto} For automatic detection
     * @see {@link HardwareDeviceContext} For low-level API
     */
    static create(deviceType: AVHWDeviceType | FFHWDeviceType, device?: string, options?: Record<string, string>): HardwareContext | null;
    /**
     * Create a derived hardware device context.
     *
     * Creates a new hardware context derived from an existing one.
     * Allows creating contexts on different device types that can share
     * memory or resources with the source device. Useful for cross-device
     * pipelines (e.g., VAAPI → OpenCL, CUDA → Vulkan).
     *
     * Direct mapping to av_hwdevice_ctx_create_derived().
     *
     * @param source - Source hardware context to derive from
     *
     * @param targetType - Target device type to create
     *
     * @returns New hardware context or null if derivation fails
     *
     * @example
     * ```typescript
     * import { AV_HWDEVICE_TYPE_VAAPI, AV_HWDEVICE_TYPE_OPENCL } from 'node-av/constants';
     *
     * // Create VAAPI device for decoding
     * const vaapi = HardwareContext.create(AV_HWDEVICE_TYPE_VAAPI);
     *
     * // Derive OpenCL device for filtering (shares memory with VAAPI)
     * const opencl = HardwareContext.derive(vaapi, AV_HWDEVICE_TYPE_OPENCL);
     *
     * if (opencl) {
     *   // Decode with VAAPI
     *   const decoder = await Decoder.create(stream, { hardware: vaapi });
     *
     *   // Filter with OpenCL (overrides frame's VAAPI context)
     *   const filter = FilterAPI.create('program_opencl=...', { hardware: opencl });
     *
     *   for await (const frame of decoder.frames()) {
     *     // frame has VAAPI context, but filter uses OpenCL
     *     const filtered = await filter.apply(frame);
     *   }
     * }
     * ```
     *
     * @example
     * ```typescript
     * // CUDA → Vulkan derivation
     * const cuda = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
     * const vulkan = HardwareContext.derive(cuda, AV_HWDEVICE_TYPE_VULKAN);
     * ```
     *
     * @see {@link create} For creating independent device
     */
    static derive(source: HardwareContext, targetType: AVHWDeviceType | FFHWDeviceType): HardwareContext | null;
    /**
     * List all available hardware device types.
     *
     * Enumerates all hardware types supported by the FFmpeg build.
     * Useful for checking hardware capabilities at runtime.
     *
     * Direct mapping to av_hwdevice_iterate_types().
     *
     * @returns Array of available device type names
     *
     * @example
     * ```typescript
     * const available = HardwareContext.listAvailable();
     * console.log('Available hardware:', available.join(', '));
     * // Output: "cuda, vaapi, videotoolbox"
     * ```
     *
     * @see {@link auto} For automatic selection
     */
    static listAvailable(): string[];
    /**
     * Get the hardware device context.
     *
     * Used internally by encoders and decoders for hardware acceleration.
     * Can be assigned to CodecContext.hwDeviceCtx.
     *
     * @example
     * ```typescript
     * codecContext.hwDeviceCtx = hw.deviceContext;
     * ```
     */
    get deviceContext(): HardwareDeviceContext;
    /**
     * Get the device type enum value.
     *
     * @example
     * ```typescript
     * if (hw.deviceType === AV_HWDEVICE_TYPE_CUDA) {
     *   console.log('Using NVIDIA GPU');
     * }
     * ```
     */
    get deviceType(): AVHWDeviceType;
    /**
     * Get the hardware device type name.
     *
     * Human-readable device type string.
     *
     * @example
     * ```typescript
     * console.log(`Hardware type: ${hw.deviceTypeName}`);
     * // Output: "cuda" or "videotoolbox" etc.
     * ```
     */
    get deviceTypeName(): FFHWDeviceType;
    /**
     * Get the device pixel format.
     *
     * Hardware-specific pixel format for frame allocation.
     *
     * @example
     * ```typescript
     * frame.format = hw.devicePixelFormat;
     * ```
     */
    get devicePixelFormat(): AVPixelFormat;
    /**
     * Check if this hardware context has been disposed.
     *
     * @example
     * ```typescript
     * if (!hw.isDisposed) {
     *   hw.dispose();
     * }
     * ```
     */
    get isDisposed(): boolean;
    /**
     * Get hardware frame constraints.
     *
     * Returns the resolution limits and supported pixel formats for this hardware device.
     * Essential for validating encoder/decoder parameters before initialization.
     *
     * Direct mapping to av_hwdevice_get_hwframe_constraints().
     *
     * @param hwconfig - Optional hardware configuration pointer
     *
     * @returns Constraints object with resolution limits and formats, or null if not available
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * if (hw) {
     *   const constraints = hw.getFrameConstraints();
     *   if (constraints) {
     *     console.log(`Resolution: ${constraints.minWidth}x${constraints.minHeight} to ${constraints.maxWidth}x${constraints.maxHeight}`);
     *     console.log('Hardware formats:', constraints.validHwFormats);
     *     console.log('Software formats:', constraints.validSwFormats);
     *   }
     * }
     * ```
     *
     * @example
     * ```typescript
     * import { AV_HWDEVICE_TYPE_VIDEOTOOLBOX } from 'node-av/constants';
     *
     * // VideoToolbox has resolution limits
     * const hw = HardwareContext.create(AV_HWDEVICE_TYPE_VIDEOTOOLBOX);
     * const constraints = hw?.getFrameConstraints();
     * if (constraints && (width > constraints.maxWidth || height > constraints.maxHeight)) {
     *   console.log('Resolution exceeds hardware limits, falling back to software encoder');
     * }
     * ```
     *
     * @see {@link HardwareDeviceContext.getHwframeConstraints} For low-level API
     */
    getFrameConstraints(hwconfig?: bigint): {
        validHwFormats?: number[];
        validSwFormats?: number[];
        minWidth: number;
        minHeight: number;
        maxWidth: number;
        maxHeight: number;
    } | null;
    /**
     * Check if this hardware type supports a specific codec.
     *
     * Queries FFmpeg's codec configurations to verify hardware support.
     * Checks both decoder and encoder support based on parameters.
     *
     * Direct mapping to avcodec_get_hw_config().
     *
     * @param codecId - Codec ID from AVCodecID enum
     *
     * @param isEncoder - Check for encoder support (default: decoder)
     *
     * @returns true if codec is supported
     *
     * @example
     * ```typescript
     * import { AV_CODEC_ID_H264 } from 'node-av/constants';
     *
     * if (hw.supportsCodec(AV_CODEC_ID_H264, true)) {
     *   // Can use hardware H.264 encoder
     * }
     * ```
     *
     * @see {@link findSupportedCodecs} For all supported codecs
     */
    supportsCodec(codecId: AVCodecID, isEncoder?: boolean): boolean;
    /**
     * Check if this hardware supports a specific pixel format for a codec.
     *
     * Verifies pixel format compatibility with hardware codec.
     * Important for ensuring format compatibility in pipelines.
     *
     * @param codecId - Codec ID from AVCodecID enum
     *
     * @param pixelFormat - Pixel format to check
     *
     * @param isEncoder - Check for encoder (default: decoder)
     *
     * @returns true if pixel format is supported
     *
     * @example
     * ```typescript
     * import { AV_CODEC_ID_H264, AV_PIX_FMT_NV12 } from 'node-av/constants';
     *
     * if (hw.supportsPixelFormat(AV_CODEC_ID_H264, AV_PIX_FMT_NV12)) {
     *   // Can use NV12 format with H.264
     * }
     * ```
     *
     * @see {@link supportsCodec} For basic codec support
     */
    supportsPixelFormat(codecId: AVCodecID, pixelFormat: AVPixelFormat, isEncoder?: boolean): boolean;
    /**
     * Get the appropriate encoder codec for a given base codec name.
     *
     * Maps generic codec names to hardware-specific encoder implementations.
     * Returns null if no hardware encoder is available for the codec.
     * Automatically tests encoder viability before returning.
     *
     * @param codecOrStream - Generic codec name (e.g., 'h264', 'hevc', 'av1'), AVCodecID or Stream
     *
     * @param validate - Whether to validate encoder by testing (default: false)
     *
     * @returns Hardware encoder codec or null if unsupported
     *
     * @example
     * ```typescript
     * const encoderCodec = hw.getEncoderCodec('h264');
     * if (encoderCodec) {
     *   console.log(`Using encoder: ${encoderCodec.name}`);
     *   // e.g., "h264_nvenc" for CUDA
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Use with Encoder.create
     * const codec = hw.getEncoderCodec('hevc');
     * if (codec) {
     *   const encoder = await Encoder.create(codec, { ... });
     * }
     * ```
     *
     * @see {@link Encoder.create} For using the codec
     */
    getEncoderCodec(codecOrStream: BaseCodecName | AVCodecID | Stream, validate?: boolean): Codec | null;
    /**
     * Get the appropriate decoder codec for a given base codec name.
     *
     * Maps generic codec names to hardware-specific decoder implementations.
     * Returns null if no hardware decoder is available for the codec.
     * Automatically searches for decoders that support this hardware device type.
     *
     * @param codec - Generic codec name (e.g., 'h264', 'hevc', 'av1') or AVCodecID
     *
     * @returns Hardware decoder codec or null if unsupported
     *
     * @example
     * ```typescript
     * const decoderCodec = hw.getDecoderCodec('hevc');
     * if (decoderCodec) {
     *   console.log(`Using decoder: ${decoderCodec.name}`);
     *   // e.g., "hevc_qsv" for QSV
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Use with Decoder.create
     * const codec = hw.getDecoderCodec(AV_CODEC_ID_H264);
     * if (codec) {
     *   const decoder = await Decoder.create(stream, { hardware: hw });
     * }
     * ```
     *
     * @see {@link Decoder.create} For using the codec
     * @see {@link getEncoderCodec} For hardware encoders
     */
    getDecoderCodec(codec: BaseCodecName | AVCodecID): Codec | null;
    /**
     * Test if hardware acceleration is working by decoding a test frame.
     *
     * Creates a simple decoder and attempts to decode with hardware acceleration.
     * Returns true if hardware decoding succeeds, false otherwise.
     * Useful for validating hardware setup before processing.
     *
     * @param codecId - Codec ID to test (default: H.264)
     *
     * @returns Promise that resolves to true if hardware works
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * if (hw && await hw.testDecoder()) {
     *   console.log('Hardware acceleration working!');
     *   // Proceed with hardware decoding/encoding
     * } else {
     *   console.log('Hardware acceleration not available');
     *   // Fall back to software
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Test specific hardware
     * const cuda = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
     * if (cuda && await cuda.testDecoder()) {
     *   console.log('CUDA acceleration works');
     * }
     * ```
     *
     * @see {@link supportsCodec} For checking codec support
     */
    testDecoder(codecId?: AVCodecID): boolean;
    /**
     * Test if hardware encoding works with a specific codec pair.
     *
     * Attempts to decode and re-encode a test frame using hardware acceleration.
     * Validates both decoding and encoding paths for the given codecs.
     *
     * @param decoderCodec - Codec name, ID, or instance to use for decoding
     *
     * @param encoderCodec - Codec name or instance to use for encoding
     *
     * @returns true if both decoding and encoding succeed
     *
     * @example
     * ```typescript
     * import { AV_CODEC_ID_H264 } from 'node-av/constants';
     *
     * const hw = HardwareContext.auto();
     * if (hw && hw.testEncoder(AV_CODEC_ID_H264, AV_CODEC_ID_H264)) {
     *   console.log('Hardware H.264 encoding works!');
     * }
     * ```
     *
     * @see {@link getEncoderCodec} For obtaining hardware encoder codec
     */
    testEncoder(decoderCodec: FFDecoderCodec | Codec | AVCodecID, encoderCodec: FFEncoderCodec | Codec): boolean;
    /**
     * Find all codecs that support this hardware device.
     *
     * Iterates through all available codecs and checks hardware compatibility.
     * Useful for discovering available hardware acceleration options.
     *
     * Direct mapping to av_codec_iterate() with hardware config checks.
     *
     * @param isEncoder - Find encoders (true) or decoders (false)
     *
     * @returns Array of codec names that support this hardware
     *
     * @example
     * ```typescript
     * const decoders = hw.findSupportedCodecs(false);
     * console.log('Hardware decoders:', decoders);
     * // ["h264_cuvid", "hevc_cuvid", ...]
     *
     * const encoders = hw.findSupportedCodecs(true);
     * console.log('Hardware encoders:', encoders);
     * // ["h264_nvenc", "hevc_nvenc", ...]
     * ```
     *
     * @see {@link supportsCodec} For checking specific codec
     */
    findSupportedCodecs(isEncoder?: boolean): string[];
    /**
     * Clean up and free hardware resources.
     *
     * Releases the hardware device context.
     * Safe to call multiple times.
     * Automatically called by Symbol.dispose.
     *
     * @example
     * ```typescript
     * const hw = HardwareContext.auto();
     * try {
     *   // Use hardware
     * } finally {
     *   hw?.dispose();
     * }
     * ```
     *
     * @see {@link Symbol.dispose} For automatic cleanup
     */
    dispose(): void;
    /**
     * Test hardware decoding with a specific codec.
     *
     * @param decoderCodec - Decoder codec name, ID, or instance to test
     *
     * @param encoderCodec - Optional encoder codec name or instance to test
     *
     * @returns true if decoding succeeds
     *
     * @internal
     */
    private testCodec;
    /**
     * Map AVCodecID to base codec name for hardware encoder lookup.
     *
     * Converts codec IDs to generic codec names used for encoder naming.
     * Used internally to find hardware-specific encoder implementations.
     *
     * @param codecId - AVCodecID enum value
     *
     * @returns Base codec name or null if unsupported
     *
     * @internal
     */
    private getBaseCodecName;
    /**
     * Map base codec name to AVCodecID for internal use.
     *
     * Converts generic codec names to AVCodecID enum values.
     * Used internally for codec testing and validation.
     *
     * @param codecBaseName - Base codec name string
     *
     * @returns Corresponding AVCodecID or null if unsupported
     *
     * @internal
     */
    private getCodecIDFromBaseName;
    /**
     * Get the hardware decoder pixel format for this device type.
     *
     * Maps device types to their corresponding pixel formats.
     * Used internally for frame format configuration.
     *
     * @returns Hardware-specific pixel format
     *
     * @internal
     */
    private getHardwareDecoderPixelFormat;
    /**
     * Create hardware context from device type.
     *
     * Internal factory method using av_hwdevice_ctx_create().
     *
     * @param deviceType - AVHWDeviceType enum value
     *
     * @param device - Optional device specifier
     *
     * @param options - Optional device options
     *
     * @returns Hardware context or null if creation fails
     *
     * @internal
     */
    private static createFromType;
    /**
     * Get platform-specific preference order for hardware types.
     *
     * Returns available hardware types sorted by platform preference.
     * Ensures optimal hardware selection for each platform.
     *
     * @returns Array of AVHWDeviceType values in preference order
     *
     * @internal
     */
    private static getPreferenceOrder;
    /**
     * Dispose of hardware context.
     *
     * Implements Disposable interface for automatic cleanup.
     * Equivalent to calling dispose().
     *
     * @example
     * ```typescript
     * {
     *   using hw = HardwareContext.auto();
     *   // Use hardware context...
     * } // Automatically disposed
     * ```
     *
     * @see {@link dispose} For manual cleanup
     */
    [Symbol.dispose](): void;
}
