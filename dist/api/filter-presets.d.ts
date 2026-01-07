import type { AVPixelFormat, AVSampleFormat } from '../constants/index.js';
import type { HardwareContext } from './hardware.js';
/**
 * Hardware filter capabilities for different platforms.
 * Maps hardware types to their supported filter operations.
 * Each capability indicates whether a specific filter operation is supported
 * by the hardware acceleration type.
 *
 * Support varies significantly between hardware types:
 * - CUDA: Comprehensive filter support with custom kernels
 * - VAAPI: Good Linux support with Intel/AMD GPUs
 * - QSV: Intel Quick Sync with basic filtering
 * - VideoToolbox: macOS/iOS with CoreImage filters
 * - Vulkan: Cross-platform with growing filter support
 * - OpenCL: Cross-platform compute-based filtering
 */
export interface FilterSupport {
    scale: boolean;
    overlay: boolean;
    transpose: boolean;
    tonemap: boolean;
    deinterlace: boolean;
    denoise: boolean;
    flip: boolean;
    blur: boolean;
    sharpen: boolean;
    sobel: boolean;
    chromakey: boolean;
    colorspace: boolean;
    pad: boolean;
    stack: boolean;
}
/**
 * Filter preset builder for composing filter chains.
 * Supports both software and hardware-accelerated filters.
 * Automatically selects appropriate filter implementations based on hardware context.
 * Uses fluent interface pattern for chaining multiple filters.
 *
 * @example
 * ```typescript
 * // Software filter chain
 * const filter = FilterPreset.chain()
 *   .scale(1920, 1080)
 *   .fps(30)
 *   .fade('in', 0, 2)
 *   .build();
 *
 * // Hardware-accelerated filter chain
 * const hw = HardwareContext.auto();
 * const hwFilter = FilterPreset.chain(hw)
 *   .scale(1920, 1080)
 *   .blur('gaussian', 5)
 *   .build();
 * ```
 */
export declare class FilterPreset {
    private hardware?;
    private filters;
    private support;
    private constructor();
    /**
     * Checks if a filter is hardware-accelerated.
     *
     * @param filterName - Name of the filter to check
     *
     * @returns True if the filter uses hardware acceleration
     *
     * @example
     * ```typescript
     * if (FilterPreset.isHardwareFilter('scale_cuda')) {
     *   console.log('Hardware accelerated scaling');
     * }
     * ```
     */
    static isHardwareFilter(filterName: string): boolean;
    /**
     * Creates a new filter chain builder.
     *
     * @param hardware - Optional hardware context for hardware-accelerated filters
     *
     * @returns A new FilterPreset instance for chaining
     *
     * @example
     * ```typescript
     * // Software filter chain
     * const filter = FilterPreset.chain()
     *   .scale(1280, 720)
     *   .fps(30)
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * // Hardware filter chain
     * const hw = HardwareContext.auto();
     * const filter = FilterPreset.chain(hw)
     *   .scale(1280, 720)
     *   .deinterlace()
     *   .build();
     * ```
     */
    static chain(hardware?: HardwareContext | null): FilterPreset;
    /**
     * Adds a custom filter string to the chain.
     *
     * @param filter - Custom filter string
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.custom('myfilter=param1:param2')
     * ```
     */
    custom(filter?: string): this;
    /**
     * Builds the final filter string.
     *
     * @param separator - Separator between filters (default: ',')
     *
     * @returns Combined filter string
     *
     * @example
     * ```typescript
     * const filterString = chain.build()  // "scale=1920:1080,fps=30"
     * ```
     */
    build(separator?: string): string;
    /**
     * Returns the filters as an array.
     *
     * @returns Array of filter strings
     *
     * @example
     * ```typescript
     * const filters = chain.toArray()  // ["scale=1920:1080", "fps=30"]
     * ```
     */
    toArray(): string[];
    /**
     * Adds a scale filter to the chain.
     * Automatically selects hardware-specific scaler if hardware context is set.
     *
     * @param width - Target width in pixels
     *
     * @param height - Target height in pixels
     *
     * @param options - Additional scaling options (e.g., flags for algorithm)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.scale(1920, 1080)  // Scale to Full HD
     * chain.scale(640, 480, { flags: 'lanczos' })  // With specific algorithm
     * ```
     *
     * @example
     * ```typescript
     * // Hardware crop + scale (VAAPI, CUDA, QSV, VideoToolbox)
     * chain.crop(100, 100, 50, 50)  // Sets AVFrame crop fields
     *   .scale(1920, 1080)          // Hardware scaler reads crop fields
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#scale | FFmpeg scale filter}
     */
    scale(width: number, height: number, options?: Record<string, any>): FilterPreset;
    /**
     * Adds a GPU format conversion filter without scaling.
     * Only available for hardware contexts. Uses hardware-specific scale filter with format parameter.
     *
     * @param format - Target pixel format (e.g., 'nv12', 'p010')
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * // Convert to NV12 on GPU without scaling
     * chain.scaleFormat('nv12')
     * // Generates: scale_vt=format=nv12 (VideoToolbox)
     * //         or: scale_cuda=format=nv12 (CUDA)
     * //         or: scale_opencl=format=nv12 (OpenCL)
     * ```
     *
     * @example
     * ```typescript
     * // Convert P010 → NV12 on GPU
     * const hw = await HardwareContext.auto();
     * const filter = FilterPreset.chain(hw)
     *   .scaleFormat('nv12')
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * // Scale then convert format (two separate GPU operations)
     * chain.scale(1920, 1080)
     *   .scaleFormat('p010')
     * // Generates: scale_vt=1920:1080,scale_vt=format=p010
     * ```
     */
    scaleFormat(format: string | AVPixelFormat): FilterPreset;
    /**
     * Adds a crop filter to the chain.
     *
     * @param width - Width of the cropped area
     *
     * @param height - Height of the cropped area
     *
     * @param x - X coordinate of top-left corner (default: 0)
     *
     * @param y - Y coordinate of top-left corner (default: 0)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.crop(640, 480, 100, 100)  // Crop 640x480 area starting at (100,100)
     * chain.crop(1280, 720)  // Crop from top-left corner
     * ```
     *
     * @example
     * ```typescript
     * // Hardware crop + scale
     * chain.crop(100, 100, 50, 50)
     *   .scale(1920, 1080)
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#crop | FFmpeg crop filter}
     */
    crop(width: number, height: number, x?: number, y?: number): FilterPreset;
    /**
     * Adds a blur filter to the chain (hardware-specific).
     * Only available for hardware presets that support blur
     *
     * @param type - Blur type (default: 'avg')
     *
     * @param radius - Blur radius (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .blur('gaussian', 5)
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .blur('box')
     *   .build();
     * ```
     */
    blur(type?: 'avg' | 'gaussian' | 'box', radius?: number): FilterPreset;
    /**
     * Adds a sharpen filter to the chain (hardware-specific).
     * Only available for hardware presets that support sharpening
     *
     * @param amount - Sharpen amount (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .sharpen(1.5)
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .sharpen()
     *   .build();
     * ```
     */
    sharpen(amount?: number): FilterPreset;
    /**
     * Adds a Sobel edge detection filter.
     *
     * Applies Sobel operator to detect edges in images.
     * Supports hardware acceleration with OpenCL.
     * Useful for computer vision and artistic effects.
     *
     * @param planes - Planes to process (1-15, default: 15 for all)
     *
     * @param scale - Scale factor for result (default: 1.0)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .sobel()
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .sobel(15, 2.0)  // All planes, 2x scale
     *   .build();
     * ```
     */
    sobel(planes?: number, scale?: number): FilterPreset;
    /**
     * Adds an FPS filter to change frame rate.
     *
     * @param fps - Target frames per second
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.fps(30)  // Convert to 30 FPS
     * chain.fps(23.976)  // Film frame rate
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#fps | FFmpeg fps filter}
     */
    fps(fps: number): FilterPreset;
    /**
     * Adds a format filter to convert pixel format.
     *
     * @param pixelFormat - Target pixel format(s) - AVPixelFormat enum, or array
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * // Single format
     * chain.format(AV_PIX_FMT_YUV420P);
     *
     * // Multiple formats (tries formats in order)
     * chain.format([AV_PIX_FMT_YUV420P, AV_PIX_FMT_RGB24]);
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#format | FFmpeg format filter}
     */
    format(pixelFormat: AVPixelFormat | AVPixelFormat[]): FilterPreset;
    /**
     * Adds a rotate filter to the chain.
     *
     * @param angle - Rotation angle in degrees
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.rotate(90)  // Rotate 90 degrees clockwise
     * chain.rotate(-45)  // Rotate 45 degrees counter-clockwise
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#rotate | FFmpeg rotate filter}
     */
    rotate(angle: number): FilterPreset;
    /**
     * Adds a flip filter to the chain (hardware-specific).
     * Falls back to hflip/vflip if hardware flip not available
     *
     * @param direction - Flip direction ('h' or 'v')
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .flip('h')
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .flip('v')
     *   .build();
     * ```
     */
    flip(direction: 'h' | 'v'): FilterPreset;
    /**
     * Adds a stack filter to the chain (hardware-specific).
     * Only available for hardware presets that support stacking
     *
     * @param type - Stack type ('h' for horizontal, 'v' for vertical, 'x' for grid)
     *
     * @param inputs - Number of inputs (default: 2)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .stack('h', 2)
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .stack('x', 4)
     *   .build();
     * ```
     */
    stack(type: 'h' | 'v' | 'x', inputs?: number): FilterPreset;
    /**
     * Creates a tonemap filter.
     * Used for HDR to SDR conversion with hardware acceleration.
     *
     * @param alg - Tonemapping algorithm (e.g., 'hable', 'reinhard', 'mobius', etc.)
     *
     * @param options - Tonemapping options
     *
     * @returns Hardware tonemap filter string or null if not supported
     *
     * @example
     * ```typescript
     * const filter = hwPresets.tonemap();
     * ```
     *
     * @example
     * ```typescript
     * const filter = hwPresets.tonemap({ tonemap: 'hable', desat: '0' });
     * ```
     */
    tonemap(alg: string, options: Record<string, string | number>): FilterPreset;
    /**
     * Creates a fade filter string for video.
     *
     * @param type - Fade type ('in' or 'out')
     *
     * @param start - Start time in seconds
     *
     * @param duration - Fade duration in seconds
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.fade('in', 0, 2)  // 2-second fade in from start
     * presets.fade('out', 10, 1)  // 1-second fade out at 10 seconds
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#fade | FFmpeg fade filter}
     */
    fade(type: 'in' | 'out', start: number, duration: number): FilterPreset;
    /**
     * Creates an overlay filter string to composite two video streams.
     *
     * @param x - X position for overlay (default: 0)
     *
     * @param y - Y position for overlay (default: 0)
     *
     * @param options - Additional overlay options
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * // Basic overlay at position
     * presets.overlay(100, 50);
     *
     * // With additional options
     * presets.overlay(0, 0, { format: 'yuv420' });
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#overlay | FFmpeg overlay filter}
     */
    overlay(x?: number, y?: number, options?: Record<string, string>): FilterPreset;
    /**
     * Creates a volume filter string for audio.
     *
     * @param factor - Volume multiplication factor (1.0 = unchanged, 2.0 = double)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.volume(0.5)  // Reduce volume by 50%
     * presets.volume(1.5)  // Increase volume by 50%
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#volume | FFmpeg volume filter}
     */
    volume(factor: number): FilterPreset;
    /**
     * Creates an audio format filter string.
     *
     * @param sampleFormat - Target sample format (e.g., 's16', 'fltp')
     *
     * @param sampleRate - Target sample rate in Hz (optional)
     *
     * @param channelLayout - Target channel layout (optional)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * // Change sample format only
     * presets.aformat('s16');
     *
     * // Change format and sample rate
     * presets.aformat('fltp', 48000);
     *
     * // Full conversion
     * presets.aformat('s16', 44100, 'stereo');
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#aformat | FFmpeg aformat filter}
     */
    aformat(sampleFormat: AVSampleFormat | AVSampleFormat[], sampleRate?: number, channelLayout?: string): FilterPreset;
    /**
     * Adds an asetnsamples filter to set the number of samples per frame.
     * This is crucial for encoders like Opus that require specific frame sizes.
     *
     * @param samples - Number of samples per frame
     *
     * @param padding - Whether to pad or drop samples (default: true)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * // For Opus encoder (requires 960 samples)
     * chain.asetnsamples(960);
     *
     * // Drop samples instead of padding
     * chain.asetnsamples(1024, false);
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#asetnsamples | FFmpeg asetnsamples filter}
     */
    asetnsamples(samples: number, padding?: boolean): FilterPreset;
    /**
     * Adds an aresample filter to change audio sample rate, format, and channel layout.
     *
     * Uses libswresample for high-quality audio resampling and format conversion.
     * Can also perform timestamp compensation (stretch/squeeze/fill/trim).
     *
     * @param rate - Target sample rate in Hz
     *
     * @param format - Optional target sample format (e.g., 's16', 'flt', 'fltp')
     *
     * @param channelLayout - Optional target channel layout (e.g., 'mono', 'stereo')
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.aresample(44100)  // Convert to 44.1 kHz only
     * chain.aresample(48000, 's16', 'stereo')  // Full conversion
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#aresample | FFmpeg aresample filter}
     */
    aresample(rate: number, format?: AVSampleFormat | string, channelLayout?: string): FilterPreset;
    /**
     * Adds an atempo filter to change audio playback speed.
     * Factor must be between 0.5 and 2.0. For larger changes, chain multiple atempo filters.
     *
     * @param factor - Tempo factor (0.5 = half speed, 2.0 = double speed)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.atempo(1.5)  // 1.5x speed
     * chain.atempo(0.8)  // Slow down to 80% speed
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#atempo | FFmpeg atempo filter}
     */
    atempo(factor: number): FilterPreset;
    /**
     * Adds an audio fade filter.
     *
     * @param type - Fade type ('in' or 'out')
     *
     * @param start - Start time in seconds
     *
     * @param duration - Fade duration in seconds
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.afade('in', 0, 3)  // 3-second audio fade in
     * chain.afade('out', 20, 2)  // 2-second fade out at 20s
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#afade | FFmpeg afade filter}
     */
    afade(type: 'in' | 'out', start: number, duration: number): FilterPreset;
    /**
     * Adds an amix filter to mix multiple audio streams.
     *
     * @param inputs - Number of input streams to mix (default: 2)
     *
     * @param duration - How to determine output duration (default: 'longest')
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.amix(3, 'longest')  // Mix 3 audio streams
     * chain.amix(2, 'first')  // Mix 2 streams, use first's duration
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#amix | FFmpeg amix filter}
     */
    amix(inputs?: number, duration?: 'first' | 'longest' | 'shortest'): FilterPreset;
    /**
     * Adds a pad filter to add padding to video.
     * Essential for aspect ratio adjustments and letterboxing.
     *
     * @param width - Output width (can use expressions like 'iw+100')
     *
     * @param height - Output height (can use expressions like 'ih+100')
     *
     * @param x - X position of input video (default: '(ow-iw)/2' for center)
     *
     * @param y - Y position of input video (default: '(oh-ih)/2' for center)
     *
     * @param color - Padding color (default: 'black')
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * // Add black bars for 16:9 aspect ratio
     * chain.pad('iw', 'iw*9/16');
     *
     * // Add 50px padding on all sides
     * chain.pad('iw+100', 'ih+100');
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#pad | FFmpeg pad filter}
     */
    pad(width: string | number, height: string | number, x?: string, y?: string, color?: string): FilterPreset;
    /**
     * Adds a trim filter to cut a portion of the stream.
     * Crucial for cutting segments from media.
     *
     * @param start - Start time in seconds
     *
     * @param end - End time in seconds (optional)
     *
     * @param duration - Duration in seconds (optional, alternative to end)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.trim(10, 30)  // Extract from 10s to 30s
     * chain.trim(5, undefined, 10)  // Extract 10s starting at 5s
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#trim | FFmpeg trim filter}
     */
    trim(start: number, end?: number, duration?: number): FilterPreset;
    /**
     * Creates a setpts filter string to change presentation timestamps.
     * Essential for speed changes and timestamp manipulation.
     *
     * @param expression - PTS expression (e.g., 'PTS*2' for half speed, 'PTS/2' for double speed)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * // Double speed
     * presets.setpts('PTS/2');
     *
     * // Half speed
     * presets.setpts('PTS*2');
     *
     * // Reset timestamps
     * presets.setpts('PTS-STARTPTS');
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#setpts | FFmpeg setpts filter}
     */
    setpts(expression: string): FilterPreset;
    /**
     * Creates an asetpts filter string for audio timestamp manipulation.
     *
     * @param expression - PTS expression
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.asetpts('PTS-STARTPTS')  // Reset timestamps to start from 0
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#asetpts | FFmpeg asetpts filter}
     */
    asetpts(expression: string): FilterPreset;
    /**
     * Creates a transpose filter string for rotation/flipping.
     * More efficient than rotate for 90-degree rotations.
     *
     * @param mode - Transpose mode (0-3, or named constants)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.transpose(1)  // Rotate 90 degrees clockwise
     * presets.transpose('cclock')  // Rotate 90 degrees counter-clockwise
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#transpose | FFmpeg transpose filter}
     */
    transpose(mode: number | 'clock' | 'cclock' | 'clock_flip' | 'cclock_flip'): FilterPreset;
    /**
     * Creates a setsar filter string to set sample aspect ratio.
     * Important for correcting aspect ratio issues.
     *
     * @param ratio - Aspect ratio (e.g., '1:1', '16:9', or number)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.setsar('1:1')  // Square pixels
     * presets.setsar(1.333)  // 4:3 aspect ratio
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#setsar | FFmpeg setsar/setdar filter}
     */
    setsar(ratio: string | number): FilterPreset;
    /**
     * Creates a setdar filter string to set display aspect ratio.
     *
     * @param ratio - Aspect ratio (e.g., '16:9', '4:3')
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.setdar('16:9')  // Widescreen
     * presets.setdar('4:3')  // Traditional TV aspect
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#setsar | FFmpeg setsar/setdar filter}
     */
    setdar(ratio: string | number): FilterPreset;
    /**
     * Adds an apad filter to add audio padding.
     * Useful for ensuring minimum audio duration.
     *
     * @param wholeDuration - Minimum duration in seconds (optional)
     *
     * @param padDuration - Amount of padding to add in seconds (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.apad(30)  // Ensure at least 30 seconds total
     * chain.apad(undefined, 5)  // Add 5 seconds of padding
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#apad | FFmpeg apad filter}
     */
    apad(wholeDuration?: number, padDuration?: number): FilterPreset;
    /**
     * Creates a deinterlace filter string.
     * Essential for processing interlaced content.
     *
     * @param mode - Deinterlace mode (default: 'yadif')
     *
     * @param options - Additional options for the filter
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.deinterlace('yadif')  // Standard deinterlacing
     * presets.deinterlace('bwdif')  // Bob Weaver deinterlacing
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#yadif | FFmpeg yadif filter}
     */
    deinterlace(mode?: 'yadif' | 'bwdif' | 'w3fdif', options?: Record<string, any>): FilterPreset;
    /**
     * Creates a select filter string to select specific frames.
     * Powerful for extracting keyframes, specific frame types, etc.
     *
     * @param expression - Selection expression
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.select('eq(pict_type,I)')  // Select only keyframes
     * presets.select('not(mod(n,10))')  // Select every 10th frame
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#select | FFmpeg select filter}
     */
    select(expression: string): FilterPreset;
    /**
     * Creates an aselect filter string for audio selection.
     *
     * @param expression - Selection expression
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.aselect('between(t,10,20)')  // Select audio between 10-20 seconds
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#aselect | FFmpeg aselect filter}
     */
    aselect(expression: string): FilterPreset;
    /**
     * Creates a concat filter string to concatenate multiple inputs.
     * Essential for joining multiple video/audio segments.
     *
     * @param n - Number of input segments
     *
     * @param v - Number of output video streams (0 or 1)
     *
     * @param a - Number of output audio streams (0 or 1)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.concat(3, 1, 1)  // Join 3 segments with video and audio
     * presets.concat(2, 1, 0)  // Join 2 video-only segments
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#concat | FFmpeg concat filter}
     */
    concat(n: number, v?: number, a?: number): FilterPreset;
    /**
     * Creates an amerge filter string to merge multiple audio streams into one.
     * Different from amix - this creates multi-channel output.
     *
     * @param inputs - Number of input streams
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.amerge(2)  // Merge 2 mono streams to stereo
     * presets.amerge(6)  // Merge 6 channels for 5.1 surround
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#amerge | FFmpeg amerge filter}
     */
    amerge(inputs?: number): FilterPreset;
    /**
     * Creates a channelmap filter string to remap audio channels.
     * Critical for audio channel manipulation.
     *
     * @param map - Channel mapping (e.g., '0-0|1-1' or 'FL-FR|FR-FL' to swap stereo)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.channelmap('FL-FR|FR-FL')  // Swap left and right channels
     * presets.channelmap('0-0|0-1')  // Duplicate mono to stereo
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#channelmap | FFmpeg channelmap filter}
     */
    channelmap(map: string): FilterPreset;
    /**
     * Creates a channelsplit filter string to split audio channels.
     *
     * @param channelLayout - Channel layout to split (optional)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.channelsplit('stereo')  // Split stereo to 2 mono
     * presets.channelsplit('5.1')  // Split 5.1 to individual channels
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#channelsplit | FFmpeg channelsplit filter}
     */
    channelsplit(channelLayout?: string): FilterPreset;
    /**
     * Creates a loudnorm filter string for loudness normalization.
     * Essential for broadcast compliance and consistent audio levels.
     *
     * @param I - Integrated loudness target (default: -24 LUFS)
     *
     * @param TP - True peak (default: -2 dBTP)
     *
     * @param LRA - Loudness range (default: 7 LU)
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.loudnorm(-23, -1, 7)  // EBU R128 broadcast standard
     * presets.loudnorm(-16, -1.5, 11)  // Streaming platforms standard
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#loudnorm | FFmpeg loudnorm filter}
     */
    loudnorm(I?: number, TP?: number, LRA?: number): FilterPreset;
    /**
     * Creates a compand filter string for audio compression/expansion.
     * Important for dynamic range control.
     *
     * @param attacks - Attack times
     *
     * @param decays - Decay times
     *
     * @param points - Transfer function points
     *
     * @param gain - Output gain
     *
     * @returns Filter string or null if not supported
     *
     * @example
     * ```typescript
     * presets.compand('0.3|0.3', '1|1', '-90/-60|-60/-40|-40/-30|-20/-20', 6)
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#compand | FFmpeg compand filter}
     */
    compand(attacks: string, decays: string, points: string, gain?: number): FilterPreset;
    /**
     * Adds a drawtext filter to overlay text on video.
     *
     * @param text - Text to display
     *
     * @param options - Text rendering options
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.drawtext('Hello World', { x: 10, y: 10, fontsize: 24 })
     * chain.drawtext('Timestamp', {
     *   x: 10,
     *   y: 10,
     *   fontsize: 24,
     *   fontcolor: 'white',
     *   fontfile: '/path/to/font.ttf'
     * })
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#drawtext | FFmpeg drawtext filter}
     */
    drawtext(text: string, options: Record<string, any>): FilterPreset;
    /**
     * Adds a split filter to duplicate a video stream.
     *
     * @param outputs - Number of output streams (default: 2)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.split()    // Split into 2 outputs
     * chain.split(3)   // Split into 3 outputs
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#split | FFmpeg split filter}
     */
    split(outputs?: number): FilterPreset;
    /**
     * Adds an asplit filter to duplicate an audio stream.
     *
     * @param outputs - Number of output streams (default: 2)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.asplit()   // Split into 2 outputs
     * chain.asplit(3)  // Split into 3 outputs
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#asplit | FFmpeg asplit filter}
     */
    asplit(outputs?: number): FilterPreset;
    /**
     * Adds an adelay filter to delay audio by specified milliseconds.
     *
     * @param delays - Delay in milliseconds (single value or array for multiple channels)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.adelay(100)        // Delay all channels by 100ms
     * chain.adelay([100, 200]) // Delay first channel by 100ms, second by 200ms
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#adelay | FFmpeg adelay filter}
     */
    adelay(delays: number | number[]): FilterPreset;
    /**
     * Adds an aecho filter for audio echo effect.
     *
     * @param in_gain - Input gain (0-1)
     *
     * @param out_gain - Output gain (0-1)
     *
     * @param delays - Delay in milliseconds
     *
     * @param decays - Decay factor (0-1)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.aecho(0.8, 0.9, 1000, 0.3)  // Echo with 1 second delay
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#aecho | FFmpeg aecho filter}
     */
    aecho(in_gain: number, out_gain: number, delays: number, decays: number): FilterPreset;
    /**
     * Adds a highpass filter to remove low frequencies.
     *
     * @param frequency - Cutoff frequency in Hz
     *
     * @param options - Additional filter options
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.highpass(200)  // Remove frequencies below 200Hz
     * chain.highpass(200, { width_type: 'q', width: 1 })
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#highpass | FFmpeg highpass filter}
     */
    highpass(frequency: number, options?: Record<string, any>): FilterPreset;
    /**
     * Adds a lowpass filter to remove high frequencies.
     *
     * @param frequency - Cutoff frequency in Hz
     *
     * @param options - Additional filter options
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.lowpass(5000)  // Remove frequencies above 5000Hz
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#lowpass | FFmpeg lowpass filter}
     */
    lowpass(frequency: number, options?: Record<string, any>): FilterPreset;
    /**
     * Adds a bandpass filter to keep only a frequency band.
     *
     * @param frequency - Center frequency in Hz
     *
     * @param options - Additional filter options
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.bandpass(1000)  // Keep frequencies around 1000Hz
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#bandpass | FFmpeg bandpass filter}
     */
    bandpass(frequency: number, options?: Record<string, any>): FilterPreset;
    /**
     * Adds an equalizer filter for frequency band adjustment.
     *
     * @param frequency - Center frequency in Hz
     *
     * @param width - Band width
     *
     * @param gain - Gain in dB
     *
     * @param width_type - Width type (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.equalizer(1000, 2, 5)        // Boost 1000Hz by 5dB
     * chain.equalizer(1000, 2, 5, 'q')   // Use Q factor for width
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#equalizer | FFmpeg equalizer filter}
     */
    equalizer(frequency: number, width: number, gain: number, width_type?: string): FilterPreset;
    /**
     * Adds a compressor filter for dynamic range compression.
     *
     * @param options - Compressor parameters
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.compressor()  // Default compression
     * chain.compressor({
     *   threshold: 0.5,
     *   ratio: 4,
     *   attack: 5,
     *   release: 50
     * })
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#acompressor | FFmpeg acompressor filter}
     */
    compressor(options?: Record<string, any>): FilterPreset;
    /**
     * Adds an atrim filter to trim audio.
     *
     * @param start - Start time in seconds
     *
     * @param end - End time in seconds (optional)
     *
     * @param duration - Duration in seconds (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.atrim(10, 20)  // Extract audio from 10s to 20s
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#atrim | FFmpeg atrim filter}
     */
    atrim(start: number, end?: number, duration?: number): FilterPreset;
    /**
     * Adds a whisper filter for audio transcription using whisper.cpp.
     * Transcribes audio and adds metadata to frames (lavfi.whisper.text, lavfi.whisper.duration).
     *
     * @param options - Whisper transcription options
     *
     * @param options.model - Path to whisper.cpp model file
     *
     * @param options.language - Language for transcription (default: 'auto')
     *
     * @param options.queue - Audio queue size in seconds (default: 3)
     *
     * @param options.useGpu - Use GPU for processing (default: true)
     *
     * @param options.gpuDevice - GPU device to use (default: 0)
     *
     * @param options.destination - Output destination for transcripts
     *
     * @param options.format - Output format: text|srt|json (default: 'text')
     *
     * @param options.vadModel - Path to VAD model file (optional)
     *
     * @param options.vadThreshold - VAD threshold 0.0-1.0 (default: 0.5)
     *
     * @param options.vadMinSpeechDuration - Minimum speech duration for VAD in seconds (default: 0.1)
     *
     * @param options.vadMinSilenceDuration - Minimum silence duration for VAD in seconds (default: 0.5)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * // Basic transcription
     * chain.whisper({
     *   model: '/path/to/ggml-base.bin'
     * });
     *
     * // With language and output
     * chain.whisper({
     *   model: '/path/to/ggml-base.bin',
     *   language: 'en',
     *   destination: 'output.srt',
     *   format: 'srt'
     * });
     *
     * // With VAD model
     * chain.whisper({
     *   model: '/path/to/ggml-base.bin',
     *   vadModel: '/path/to/ggml-silero-v5.1.2.bin',
     *   vadThreshold: 0.5
     * });
     * ```
     *
     * @see {@link https://ffmpeg.org/ffmpeg-filters.html#whisper | FFmpeg whisper filter}
     */
    whisper(options: {
        model: string;
        language?: string;
        queue?: number;
        useGpu?: boolean;
        gpuDevice?: number;
        destination?: string;
        format?: 'text' | 'srt' | 'json';
        vadModel?: string;
        vadThreshold?: number;
        vadMinSpeechDuration?: number;
        vadMinSilenceDuration?: number;
    }): FilterPreset;
    /**
     * Adds a hwupload filter to upload frames to hardware.
     * Only applied if hardware acceleration is configured.
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .hwupload()
     *   .scale(1920, 1080)
     *   .build();
     * ```
     */
    hwupload(): FilterPreset;
    /**
     * Adds a hwdownload filter to download frames from hardware.
     * Only applied if hardware acceleration is configured.
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .scale(1920, 1080)
     *   .hwdownload()
     *   .build();
     * ```
     */
    hwdownload(): FilterPreset;
    /**
     * Adds a hwmap filter to map frames between hardware devices.
     *
     * @param derive - Device to derive from (optional)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .hwmap('cuda')
     *   .build();
     * ```
     *
     * @example
     * ```typescript
     * const chain = FilterPresets.chain()
     *   .hwmap()
     *   .build();
     * ```
     */
    hwmap(derive?: string): FilterPreset;
    /**
     * Adds a filter to the chain.
     *
     * @param filter - Filter string to add (ignored if null/undefined)
     *
     * @param unshift - If true, adds to the start instead of the end (default: false)
     *
     * @returns This instance for chaining
     *
     * @example
     * ```typescript
     * chain.add('scale=1920:1080')
     * ```
     *
     * @internal
     */
    private add;
    /**
     * Determines filter support for the hardware type.
     *
     * @returns Hardware filter support configuration
     *
     * @internal
     */
    private getSupport;
}
