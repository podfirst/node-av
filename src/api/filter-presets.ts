import {
  AV_HWDEVICE_TYPE_CUDA,
  AV_HWDEVICE_TYPE_D3D11VA,
  AV_HWDEVICE_TYPE_D3D12VA,
  AV_HWDEVICE_TYPE_DRM,
  AV_HWDEVICE_TYPE_DXVA2,
  AV_HWDEVICE_TYPE_MEDIACODEC,
  AV_HWDEVICE_TYPE_OPENCL,
  AV_HWDEVICE_TYPE_QSV,
  AV_HWDEVICE_TYPE_RKMPP,
  AV_HWDEVICE_TYPE_VAAPI,
  AV_HWDEVICE_TYPE_VDPAU,
  AV_HWDEVICE_TYPE_VIDEOTOOLBOX,
  AV_HWDEVICE_TYPE_VULKAN,
  AVFILTER_FLAG_HWDEVICE,
} from '../constants/constants.js';
import { Filter } from '../lib/filter.js';
import { avGetPixFmtName, avGetSampleFmtName } from '../lib/utilities.js';

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
  stack: boolean; // hstack, vstack, xstack
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
export class FilterPreset {
  private filters: string[] = [];
  private support: FilterSupport;

  private constructor(private hardware?: HardwareContext | null) {
    this.support = this.getSupport();
  }

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
  static isHardwareFilter(filterName: string): boolean {
    const filter = Filter.getByName(filterName);
    if (!filter) {
      return false;
    }

    return filter.hasFlags(AVFILTER_FLAG_HWDEVICE);
  }

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
  static chain(hardware?: HardwareContext | null): FilterPreset {
    const preset = new FilterPreset(hardware);
    return preset;
  }

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
  custom(filter?: string): this {
    if (!filter) {
      return this;
    }

    return this.add(filter);
  }

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
  build(separator = ','): string {
    return this.filters.join(separator);
  }

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
  toArray(): string[] {
    return [...this.filters];
  }

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
  scale(width: number, height: number, options?: Record<string, any>): FilterPreset {
    if (!this.support.scale) {
      return this;
    }

    if (this.hardware) {
      // Special handling for different hardware scalers
      let filterName: string;
      let filter: string;

      if (this.hardware.deviceType === AV_HWDEVICE_TYPE_RKMPP) {
        filterName = 'scale_rkrga'; // RKMPP uses RGA for scaling
        filter = `${filterName}=${width}:${height}`;
      } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VIDEOTOOLBOX) {
        filterName = 'scale_vt'; // VideoToolbox uses scale_vt
        filter = `${filterName}=${width}:${height}`;
      } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_QSV) {
        filterName = 'vpp_qsv'; // QSV uses vpp_qsv for scaling with w= and h= parameters
        filter = `${filterName}=w=${width}:h=${height}`;
      } else {
        filterName = `scale_${this.hardware.deviceTypeName}`;
        filter = `${filterName}=${width}:${height}`;
      }

      if (options) {
        for (const [key, value] of Object.entries(options)) {
          filter += `:${key}=${value}`;
        }
      }

      this.add(filter);
    } else {
      const flags = options?.flags;
      const base = `scale=${width}:${height}`;
      const result = flags ? `${base}:flags=${flags}` : base;
      this.add(result);
    }

    return this;
  }

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
  scaleFormat(format: string | AVPixelFormat): FilterPreset {
    if (!this.hardware) {
      return this;
    }

    // Special handling for different hardware scalers
    let filterName: string;
    if (this.hardware.deviceType === AV_HWDEVICE_TYPE_RKMPP) {
      filterName = 'scale_rkrga';
    } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VIDEOTOOLBOX) {
      filterName = 'scale_vt';
    } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_QSV) {
      filterName = 'vpp_qsv';
    } else {
      filterName = `scale_${this.hardware.deviceTypeName}`;
    }

    if (typeof format !== 'string') {
      format = avGetPixFmtName(format) ?? 'nv12';
    }

    this.add(`${filterName}=format=${format}`);
    return this;
  }

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
  crop(width: number, height: number, x = 0, y = 0): FilterPreset {
    if (this.hardware?.deviceType === AV_HWDEVICE_TYPE_OPENCL) {
      this.add(`scale_opencl=cw=${width}:ch=${height}:cx=${x}:cy=${y}`);
    } else {
      this.add(`crop=${width}:${height}:${x}:${y}`, true);
    }

    return this;
  }

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
  blur(type: 'avg' | 'gaussian' | 'box' = 'avg', radius?: number): FilterPreset {
    if (!this.support.blur) {
      return this;
    }

    if (this.hardware) {
      let filter: string | null = null;

      switch (this.hardware.deviceType) {
        case AV_HWDEVICE_TYPE_CUDA:
          filter = radius ? `bilateral_cuda=sigmaS=${radius}` : 'bilateral_cuda';
          break;
        case AV_HWDEVICE_TYPE_VULKAN:
          filter = type === 'gaussian' ? (radius ? `gblur_vulkan=sigma=${radius}` : 'gblur_vulkan') : radius ? `avgblur_vulkan=sizeX=${radius}` : 'avgblur_vulkan';
          break;
        case AV_HWDEVICE_TYPE_OPENCL:
          filter = type === 'box' ? (radius ? `boxblur_opencl=luma_radius=${radius}` : 'boxblur_opencl') : radius ? `avgblur_opencl=sizeX=${radius}` : 'avgblur_opencl';
          break;
        default:
          filter = null;
      }

      if (filter) {
        this.add(filter);
      }
    } else {
      const filter = type === 'gaussian' ? (radius ? `gblur=sigma=${radius}` : 'gblur') : radius ? `avgblur=sizeX=${radius}` : 'avgblur';
      this.add(filter);
    }

    return this;
  }

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
  sharpen(amount?: number): FilterPreset {
    if (!this.support.sharpen) {
      return this;
    }

    if (this.hardware) {
      let filter: string | null = null;

      switch (this.hardware.deviceType) {
        case AV_HWDEVICE_TYPE_VAAPI:
          filter = amount ? `sharpness_vaapi=sharpness=${amount}` : 'sharpness_vaapi';
          break;
        case AV_HWDEVICE_TYPE_OPENCL:
          filter = amount ? `unsharp_opencl=amount=${amount}` : 'unsharp_opencl';
          break;
        case AV_HWDEVICE_TYPE_QSV:
          // vpp_qsv detail parameter: enhancement level [0-100]
          const detail = amount ? Math.min(100, Math.max(0, Math.round(amount * 10))) : 50;
          filter = `vpp_qsv=detail=${detail}`;
          break;
        case AV_HWDEVICE_TYPE_VULKAN:
          // libplacebo contrast parameter (>1 increases sharpness, no native sharpen_vulkan available)
          const contrast = amount ? Math.max(1, 1 + amount) : 1.5;
          filter = `libplacebo=contrast=${contrast}`;
          break;
        case AV_HWDEVICE_TYPE_CUDA:
          // CUDA sharpening not available (NPP not included)
          filter = null;
          break;
        default:
          filter = null;
      }

      if (filter) {
        this.add(filter);
      }
    } else {
      const filter = amount ? `unsharp=amount=${amount}` : 'unsharp';
      this.add(filter);
    }

    return this;
  }

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
  sobel(planes?: number, scale?: number): FilterPreset {
    if (this.hardware) {
      let filter: string | null = null;

      switch (this.hardware.deviceType) {
        case AV_HWDEVICE_TYPE_OPENCL:
          if (planes !== undefined || scale !== undefined) {
            const params: string[] = [];
            if (planes !== undefined) params.push(`planes=${planes}`);
            if (scale !== undefined) params.push(`scale=${scale}`);
            filter = `sobel_opencl=${params.join(':')}`;
          } else {
            filter = 'sobel_opencl';
          }
          break;
      }

      if (filter) {
        this.add(filter);
      }
    } else {
      // Software Sobel filter
      if (planes !== undefined || scale !== undefined) {
        const params: string[] = [];
        if (planes !== undefined) params.push(`planes=${planes}`);
        if (scale !== undefined) params.push(`scale=${scale}`);
        this.add(`sobel=${params.join(':')}`);
      } else {
        this.add('sobel');
      }
    }

    return this;
  }

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
  fps(fps: number): FilterPreset {
    if (fps <= 0) {
      return this;
    }

    this.add(`fps=fps=${fps}`);
    return this;
  }

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
  format(pixelFormat: AVPixelFormat | AVPixelFormat[]): FilterPreset {
    if (Array.isArray(pixelFormat)) {
      if (pixelFormat.length === 0) {
        return this;
      }

      // Create a chain of format filters
      const formats = pixelFormat.map((fmt) => {
        const formatName = typeof fmt === 'string' ? fmt : (avGetPixFmtName(fmt) ?? 'yuv420p');
        return `format=${formatName}`;
      });
      this.add(formats.join(','));
    } else {
      const formatName = typeof pixelFormat === 'string' ? pixelFormat : (avGetPixFmtName(pixelFormat) ?? 'yuv420p');
      this.add(`format=${formatName}`);
    }

    return this;
  }

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
  rotate(angle: number): FilterPreset {
    this.add(`rotate=${angle}*PI/180`);
    return this;
  }

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
  flip(direction: 'h' | 'v'): FilterPreset {
    if (!this.support.flip) {
      return this;
    }

    if (this.hardware) {
      if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VULKAN) {
        // Use native Vulkan flip filters
        if (direction === 'v') {
          this.add('vflip_vulkan');
        } else {
          this.add('hflip_vulkan');
        }
      } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_QSV) {
        // vpp_qsv uses transpose option for flip
        if (direction === 'v') {
          this.add('vpp_qsv=transpose=vflip');
        } else {
          this.add('vpp_qsv=transpose=hflip');
        }
      }
    } else {
      if (direction === 'v') {
        this.add('vflip');
      } else {
        this.add('hflip');
      }
    }

    return this;
  }

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
  stack(type: 'h' | 'v' | 'x', inputs = 2): FilterPreset {
    if (!this.support.stack) {
      return this;
    }

    if (this.hardware) {
      if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VAAPI || this.hardware.deviceType === AV_HWDEVICE_TYPE_QSV) {
        const filter = `${type}stack_${this.hardware.deviceTypeName}=inputs=${inputs}`;
        this.add(filter);
      }
    } else {
      const filter = type === 'h' ? `hstack=inputs=${inputs}` : type === 'v' ? `vstack=inputs=${inputs}` : `xstack=inputs=${inputs}`;
      this.add(filter);
    }

    return this;
  }

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
  tonemap(alg: string, options: Record<string, string | number>): FilterPreset {
    if (!this.support.tonemap) {
      return this;
    }

    if (this.hardware) {
      // Vulkan uses libplacebo for comprehensive HDR tone-mapping (no native tonemap_vulkan available)
      if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VULKAN) {
        let filter = `libplacebo=tonemapping=${alg}`;

        if (options) {
          const opts = Object.entries(options)
            .map(([k, v]) => `${k}=${v}`)
            .join(':');
          filter += `:${opts}`;
        }

        this.add(filter);
      } else {
        // VideoToolbox uses different filter name
        const filterName = this.hardware.deviceType === AV_HWDEVICE_TYPE_VIDEOTOOLBOX ? 'tonemap_videotoolbox' : `tonemap_${this.hardware.deviceTypeName}`;

        let filter = `${filterName}=${alg}`;

        if (options) {
          const opts = Object.entries(options)
            .map(([k, v]) => `${k}=${v}`)
            .join(':');
          filter += `=${opts}`;
        }

        this.add(filter);
      }
    } else {
      let filter = `tonemap=${alg}`;

      if (options) {
        const opts = Object.entries(options)
          .map(([k, v]) => `${k}=${v}`)
          .join(':');
        filter += `=${opts}`;
      }

      this.add(filter);
    }

    return this;
  }

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
  fade(type: 'in' | 'out', start: number, duration: number): FilterPreset {
    this.add(`fade=t=${type}:st=${start}:d=${duration}`);
    return this;
  }

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
  overlay(x = 0, y = 0, options?: Record<string, string>): FilterPreset {
    if (!this.support.overlay) {
      return this;
    }

    if (this.hardware) {
      // Special handling for RKMPP which uses RGA
      const filterName = this.hardware.deviceType === AV_HWDEVICE_TYPE_RKMPP ? 'overlay_rkrga' : `overlay_${this.hardware.deviceTypeName}`;

      let filter = `${filterName}=${x}:${y}`;

      if (options) {
        for (const [key, value] of Object.entries(options)) {
          filter += `:${key}=${value}`;
        }
      }

      this.add(filter);
    } else {
      let filter = `overlay=${x}:${y}`;
      if (options) {
        for (const [key, value] of Object.entries(options)) {
          filter += `:${key}=${value}`;
        }
      }
      this.add(filter);
    }

    return this;
  }

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
  volume(factor: number): FilterPreset {
    this.add(`volume=${factor}`);
    return this;
  }

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
  aformat(sampleFormat: AVSampleFormat | AVSampleFormat[], sampleRate?: number, channelLayout?: string): FilterPreset {
    let sampleFormats = '';
    if (!Array.isArray(sampleFormat)) {
      sampleFormat = [sampleFormat];
    }
    sampleFormats = sampleFormat.map((fmt) => (typeof fmt === 'string' ? fmt : (avGetSampleFmtName(fmt) ?? 's16'))).join('|');
    let filter = `aformat=sample_fmts=${sampleFormats}`;
    if (sampleRate) filter += `:sample_rates=${sampleRate}`;
    if (channelLayout) filter += `:channel_layouts=${channelLayout}`;
    this.add(filter);
    return this;
  }

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
  asetnsamples(samples: number, padding = true): FilterPreset {
    const p = padding ? 1 : 0;
    this.add(`asetnsamples=n=${samples}:p=${p}`);
    return this;
  }

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
  aresample(rate: number, format?: AVSampleFormat | string, channelLayout?: string): FilterPreset {
    const params: string[] = [`${rate}`];

    if (format !== undefined) {
      const formatStr = typeof format === 'number' ? `${format}` : format;
      params.push(`osf=${formatStr}`);
    }

    if (channelLayout !== undefined) {
      params.push(`ochl=${channelLayout}`);
    }

    this.add(`aresample=${params.join(':')}`);
    return this;
  }

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
  atempo(factor: number): FilterPreset {
    this.add(`atempo=${factor}`);
    return this;
  }

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
  afade(type: 'in' | 'out', start: number, duration: number): FilterPreset {
    this.add(`afade=t=${type}:st=${start}:d=${duration}`);
    return this;
  }

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
  amix(inputs = 2, duration: 'first' | 'longest' | 'shortest' = 'longest'): FilterPreset {
    this.add(`amix=inputs=${inputs}:duration=${duration}`);
    return this;
  }

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
  pad(width: string | number, height: string | number, x?: string, y?: string, color = 'black'): FilterPreset {
    if (this.hardware?.deviceType === AV_HWDEVICE_TYPE_VULKAN) {
      // Vulkan uses libplacebo (no native pad_vulkan available)
      let filter = `libplacebo=w=${width}:h=${height}`;
      if (x !== undefined) filter += `:pos_x=${x}`;
      if (y !== undefined) filter += `:pos_y=${y}`;
      filter += `:fillcolor=${color}`;
      this.add(filter);
    } else {
      let filter = `pad=${width}:${height}`;
      if (x !== undefined) filter += `:${x}`;
      if (y !== undefined) filter += `:${y}`;
      filter += `:${color}`;
      this.add(filter);
    }
    return this;
  }

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
  trim(start: number, end?: number, duration?: number): FilterPreset {
    let filter = `trim=start=${start}`;
    if (end !== undefined) filter += `:end=${end}`;
    if (duration !== undefined) filter += `:duration=${duration}`;
    this.add(filter);
    return this;
  }

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
  setpts(expression: string): FilterPreset {
    this.add(`setpts=${expression}`);
    return this;
  }

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
  asetpts(expression: string): FilterPreset {
    this.add(`asetpts=${expression}`);
    return this;
  }

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
  transpose(mode: number | 'clock' | 'cclock' | 'clock_flip' | 'cclock_flip'): FilterPreset {
    if (!this.support.transpose) {
      return this;
    }

    if (this.hardware) {
      // Convert string modes to numbers
      let dir: number;
      if (typeof mode === 'string') {
        switch (mode) {
          case 'clock':
            dir = 1;
            break;
          case 'cclock':
            dir = 2;
            break;
          case 'clock_flip':
            dir = 3;
            break;
          case 'cclock_flip':
            dir = 0;
            break;
          default:
            dir = 0;
        }
      } else {
        dir = mode;
      }

      // Special handling for different hardware transpose implementations
      let filter: string;
      if (this.hardware.deviceType === AV_HWDEVICE_TYPE_CUDA) {
        filter = `transpose_cuda=dir=${dir}`; // Uses custom CUDA kernel (patch 0054)
      } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_VIDEOTOOLBOX) {
        filter = `transpose_vt=dir=${dir}`; // CoreImage-based transpose
      } else if (this.hardware.deviceType === AV_HWDEVICE_TYPE_QSV) {
        // vpp_qsv transpose parameter maps: clock=1, cclock=2, cclock_hflip=0, clock_hflip=3, reversal=4, hflip=5, vflip=6
        filter = `vpp_qsv=transpose=${dir}`;
      } else {
        filter = `transpose_${this.hardware.deviceTypeName}=dir=${dir}`;
      }

      this.add(filter);
    } else {
      this.add(`transpose=${mode}`);
    }

    return this;
  }

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
  setsar(ratio: string | number): FilterPreset {
    this.add(`setsar=${ratio}`);
    return this;
  }

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
  setdar(ratio: string | number): FilterPreset {
    this.add(`setdar=${ratio}`);
    return this;
  }

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
  apad(wholeDuration?: number, padDuration?: number): FilterPreset {
    if (!wholeDuration && !padDuration) return this;
    let filter = 'apad';
    if (wholeDuration) filter += `=whole_dur=${wholeDuration}`;
    if (padDuration) filter += wholeDuration ? `:pad_dur=${padDuration}` : `=pad_dur=${padDuration}`;
    this.add(filter);
    return this;
  }

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
  deinterlace(mode: 'yadif' | 'bwdif' | 'w3fdif' = 'yadif', options?: Record<string, any>): FilterPreset {
    if (!this.support.deinterlace) {
      return this;
    }

    if (this.hardware) {
      let filter: string | null = null;

      switch (this.hardware.deviceType) {
        case AV_HWDEVICE_TYPE_CUDA:
          filter = mode ? `yadif_cuda=mode=${mode}` : 'yadif_cuda';
          break;
        case AV_HWDEVICE_TYPE_VAAPI:
          filter = mode ? `deinterlace_vaapi=mode=${mode}` : 'deinterlace_vaapi';
          break;
        case AV_HWDEVICE_TYPE_QSV:
          // vpp_qsv deinterlace: 0=off, 1=bob, 2=advanced
          // Map yadif/bwdif mode to vpp_qsv: default to bob(1)
          filter = mode ? 'vpp_qsv=deinterlace=1' : 'vpp_qsv=deinterlace=1';
          break;
        case AV_HWDEVICE_TYPE_VULKAN:
          filter = mode ? `bwdif_vulkan=mode=${mode}` : 'bwdif_vulkan';
          break;
        case AV_HWDEVICE_TYPE_VIDEOTOOLBOX:
          filter = mode ? `yadif_videotoolbox=mode=${mode}` : 'yadif_videotoolbox';
          break;
        default:
          filter = null;
      }

      if (filter) {
        if (options) {
          const params: string[] = [];
          for (const [key, value] of Object.entries(options)) {
            params.push(`${key}=${value}`);
          }
          filter += '=' + params.join(':');
        }

        this.add(filter);
      }
    } else {
      let filter = mode;

      if (options) {
        const params: string[] = [];
        for (const [key, value] of Object.entries(options)) {
          params.push(`${key}=${value}`);
        }
        filter += '=' + params.join(':');
      }

      this.add(filter);
    }

    return this;
  }

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
  select(expression: string): FilterPreset {
    this.add(`select='${expression}'`);
    return this;
  }

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
  aselect(expression: string): FilterPreset {
    this.add(`aselect='${expression}'`);
    return this;
  }

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
  concat(n: number, v = 1, a = 1): FilterPreset {
    this.add(`concat=n=${n}:v=${v}:a=${a}`);
    return this;
  }

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
  amerge(inputs = 2): FilterPreset {
    this.add(`amerge=inputs=${inputs}`);
    return this;
  }

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
  channelmap(map: string): FilterPreset {
    this.add(`channelmap=${map}`);
    return this;
  }

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
  channelsplit(channelLayout?: string): FilterPreset {
    this.add(channelLayout ? `channelsplit=channel_layout=${channelLayout}` : 'channelsplit');
    return this;
  }

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
  loudnorm(I = -24, TP = -2, LRA = 7): FilterPreset {
    this.add(`loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`);
    return this;
  }

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
  compand(attacks: string, decays: string, points: string, gain?: number): FilterPreset {
    let filter = `compand=attacks=${attacks}:decays=${decays}:points=${points}`;
    if (gain !== undefined) filter += `:gain=${gain}`;
    this.add(filter);
    return this;
  }

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
  drawtext(text: string, options: Record<string, any>): FilterPreset {
    let filter = `drawtext=text='${text.replace(/'/g, "\\'").replace(/"/g, '\\"')}'`;
    for (const [key, value] of Object.entries(options)) {
      if (key === 'fontfile' && typeof value === 'string') {
        filter += `:${key}='${value}'`;
      } else {
        filter += `:${key}=${value}`;
      }
    }
    this.add(filter);
    return this;
  }

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
  split(outputs = 2): FilterPreset {
    this.add(`split=${outputs}`);
    return this;
  }

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
  asplit(outputs = 2): FilterPreset {
    this.add(`asplit=${outputs}`);
    return this;
  }

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
  adelay(delays: number | number[]): FilterPreset {
    const delayStr = Array.isArray(delays) ? delays.join('|') : delays.toString();
    this.add(`adelay=${delayStr}`);
    return this;
  }

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
  aecho(in_gain: number, out_gain: number, delays: number, decays: number): FilterPreset {
    this.add(`aecho=${in_gain}:${out_gain}:${delays}:${decays}`);
    return this;
  }

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
  highpass(frequency: number, options?: Record<string, any>): FilterPreset {
    let filter = `highpass=f=${frequency}`;
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        filter += `:${key}=${value}`;
      }
    }
    this.add(filter);
    return this;
  }

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
  lowpass(frequency: number, options?: Record<string, any>): FilterPreset {
    let filter = `lowpass=f=${frequency}`;
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        filter += `:${key}=${value}`;
      }
    }
    this.add(filter);
    return this;
  }

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
  bandpass(frequency: number, options?: Record<string, any>): FilterPreset {
    let filter = `bandpass=f=${frequency}`;
    if (options) {
      for (const [key, value] of Object.entries(options)) {
        filter += `:${key}=${value}`;
      }
    }
    this.add(filter);
    return this;
  }

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
  equalizer(frequency: number, width: number, gain: number, width_type?: string): FilterPreset {
    let filter = `equalizer=f=${frequency}`;
    if (width_type) {
      filter += `:width_type=${width_type}`;
    }
    filter += `:width=${width}:gain=${gain}`;
    this.add(filter);
    return this;
  }

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
  compressor(options?: Record<string, any>): FilterPreset {
    if (!options || Object.keys(options).length === 0) {
      this.add('acompressor');
    } else {
      let filter = 'acompressor';
      const params: string[] = [];
      for (const [key, value] of Object.entries(options)) {
        params.push(`${key}=${value}`);
      }
      filter += '=' + params.join(':');
      this.add(filter);
    }
    return this;
  }

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
  atrim(start: number, end?: number, duration?: number): FilterPreset {
    let filter = `atrim=start=${start}`;
    if (end !== undefined) filter += `:end=${end}`;
    if (duration !== undefined) filter += `:duration=${duration}`;
    this.add(filter);
    return this;
  }

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
  }): FilterPreset {
    const params: string[] = [`model='${options.model}'`];

    if (options.language !== undefined) {
      params.push(`language=${options.language}`);
    }

    if (options.queue !== undefined) {
      params.push(`queue=${options.queue}`);
    }

    if (options.useGpu !== undefined) {
      params.push(`use_gpu=${options.useGpu ? 1 : 0}`);
    }

    if (options.gpuDevice !== undefined) {
      params.push(`gpu_device=${options.gpuDevice}`);
    }

    if (options.destination !== undefined) {
      params.push(`destination='${options.destination}'`);
    }

    if (options.format !== undefined) {
      params.push(`format=${options.format}`);
    }

    if (options.vadModel !== undefined) {
      params.push(`vad_model='${options.vadModel}'`);
    }

    if (options.vadThreshold !== undefined) {
      params.push(`vad_threshold=${options.vadThreshold}`);
    }

    if (options.vadMinSpeechDuration !== undefined) {
      params.push(`vad_min_speech_duration=${options.vadMinSpeechDuration}`);
    }

    if (options.vadMinSilenceDuration !== undefined) {
      params.push(`vad_min_silence_duration=${options.vadMinSilenceDuration}`);
    }

    this.add(`whisper=${params.join(':')}`);
    return this;
  }

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
  hwupload(): FilterPreset {
    if (!this.hardware) {
      return this;
    }

    if (this.hardware.deviceType === AV_HWDEVICE_TYPE_CUDA) {
      this.add('hwupload_cuda');
    } else {
      this.add('hwupload');
    }
    return this;
  }

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
  hwdownload(): FilterPreset {
    if (!this.hardware) {
      return this;
    }

    this.add('hwdownload');
    return this;
  }

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
  hwmap(derive?: string): FilterPreset {
    this.add(derive ? `hwmap=derive_device=${derive}` : 'hwmap');
    return this;
  }

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
  private add(filter: string | null | undefined, unshift?: boolean): this {
    if (filter) {
      if (unshift) {
        this.filters.unshift(filter);
      } else {
        this.filters.push(filter);
      }
    }
    return this;
  }

  /**
   * Determines filter support for the hardware type.
   *
   * @returns Hardware filter support configuration
   *
   * @internal
   */
  private getSupport(): FilterSupport {
    if (!this.hardware) {
      // Software-only - all filters supported
      return {
        scale: true,
        overlay: true,
        transpose: true,
        tonemap: true,
        deinterlace: true,
        denoise: true,
        flip: true,
        blur: true,
        sharpen: true,
        sobel: true,
        chromakey: true,
        colorspace: true,
        pad: true,
        stack: true,
      };
    }

    switch (this.hardware.deviceType) {
      case AV_HWDEVICE_TYPE_CUDA:
        return {
          scale: true, // scale_cuda with crop support (patch 1002)
          overlay: true, // overlay_cuda
          transpose: true, // transpose_cuda (patch 0054)
          tonemap: true, // tonemap_cuda (patch 0004)
          deinterlace: true, // bwdif_cuda, yadif_cuda
          denoise: false,
          flip: false,
          blur: true, // bilateral_cuda
          sharpen: false, // Not available (NPP not included in build)
          sobel: false,
          chromakey: true, // chromakey_cuda
          colorspace: true, // colorspace_cuda
          pad: false,
          stack: false,
        };

      case AV_HWDEVICE_TYPE_VAAPI:
        return {
          scale: true, // scale_vaapi
          overlay: true, // overlay_vaapi
          transpose: true, // transpose_vaapi
          tonemap: true, // tonemap_vaapi
          deinterlace: true, // deinterlace_vaapi
          denoise: true, // denoise_vaapi
          flip: false,
          blur: false,
          sharpen: true, // sharpness_vaapi
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: true, // pad_vaapi
          stack: true, // hstack_vaapi, vstack_vaapi, xstack_vaapi
        };

      case AV_HWDEVICE_TYPE_QSV:
        return {
          scale: true, // vpp_qsv (w/h params) with crop support (cw/ch/cx/cy)
          overlay: true, // overlay_qsv
          transpose: true, // vpp_qsv transpose option
          tonemap: true, // vpp_qsv tonemap option
          deinterlace: true, // vpp_qsv deinterlace option (bob, advanced)
          denoise: true, // vpp_qsv denoise option [0-100]
          flip: true, // vpp_qsv transpose=hflip/vflip
          blur: false,
          sharpen: true, // vpp_qsv detail option [0-100]
          sobel: false,
          chromakey: false,
          colorspace: true, // vpp_qsv out_color_matrix/primaries/transfer
          pad: false,
          stack: true, // hstack_qsv, vstack_qsv, xstack_qsv
        };

      case AV_HWDEVICE_TYPE_VULKAN:
        return {
          scale: true, // scale_vulkan (native Vulkan scaler)
          overlay: true, // overlay_vulkan (native Vulkan overlay)
          transpose: true, // transpose_vulkan (native Vulkan transpose)
          tonemap: true, // libplacebo (comprehensive HDR tone-mapping, no native alternative)
          deinterlace: true, // bwdif_vulkan (native Vulkan deinterlacer)
          denoise: true, // nlmeans_vulkan (native Vulkan denoiser)
          flip: true, // hflip_vulkan/vflip_vulkan (native Vulkan flip)
          blur: true, // avgblur_vulkan/gblur_vulkan (native Vulkan blur)
          sharpen: true, // libplacebo (contrast/sharpness adjustments, no native alternative)
          sobel: false, // Not available
          chromakey: false, // chromaber_vulkan exists but different purpose (chromatic aberration)
          colorspace: true, // libplacebo (comprehensive color management, no native alternative)
          pad: true, // libplacebo (via pos_x/y/w/h and fillcolor, no native alternative)
          stack: false, // Not available
        };

      case AV_HWDEVICE_TYPE_OPENCL:
        return {
          scale: true, // scale_opencl with crop support (patches 0006, 1004)
          overlay: true, // overlay_opencl (+ PGS support patch 0008)
          transpose: true, // transpose_opencl
          tonemap: true, // tonemap_opencl (enhanced in patch 0007)
          deinterlace: false,
          denoise: false,
          flip: false,
          blur: true, // avgblur_opencl, boxblur_opencl
          sharpen: true, // unsharp_opencl
          sobel: true, // sobel_opencl
          chromakey: true, // colorkey_opencl
          colorspace: false,
          pad: true, // pad_opencl
          stack: false,
        };

      case AV_HWDEVICE_TYPE_VIDEOTOOLBOX:
        return {
          scale: true, // scale_vt with crop support (patches 0047, 1001)
          overlay: true, // overlay_videotoolbox (patch 0048)
          transpose: true, // transpose_vt (patch 0049, CoreImage based)
          tonemap: true, // tonemap_videotoolbox (patch 0050)
          deinterlace: true, // yadif_videotoolbox
          denoise: false,
          flip: false,
          blur: false,
          sharpen: false,
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: false,
          stack: false,
        };

      case AV_HWDEVICE_TYPE_MEDIACODEC:
        // MediaCodec is Android's hardware acceleration - mainly for decode/encode
        return {
          scale: false,
          overlay: false,
          transpose: false,
          tonemap: false,
          deinterlace: false,
          denoise: false,
          flip: false,
          blur: false,
          sharpen: false,
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: false,
          stack: false,
        };

      case AV_HWDEVICE_TYPE_RKMPP: // Rockchip - has RGA filters via patch 0046
        // Note: RKMPP uses separate RKRGA (Rockchip 2D Raster Graphic Acceleration)
        // for filtering operations, configured with --enable-rkrga
        return {
          scale: true, // scale_rkrga (patch 0046)
          overlay: true, // overlay_rkrga (patch 0046)
          transpose: false,
          tonemap: false,
          deinterlace: false,
          denoise: false,
          flip: false,
          blur: false,
          sharpen: false,
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: false,
          stack: false,
        };

      // These hardware types don't have dedicated filters - they're mainly for decode/encode
      case AV_HWDEVICE_TYPE_VDPAU: // Decode-only, deprecated in favor of VAAPI
      case AV_HWDEVICE_TYPE_DXVA2: // Windows decode-only
      case AV_HWDEVICE_TYPE_D3D11VA: // Windows decode-only
      case AV_HWDEVICE_TYPE_D3D12VA: // Has HEVC encoder but no filters
      case AV_HWDEVICE_TYPE_DRM: // Linux DRM buffer sharing, not processing
        return {
          scale: false,
          overlay: false,
          transpose: false,
          tonemap: false,
          deinterlace: false,
          denoise: false,
          flip: false,
          blur: false,
          sharpen: false,
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: false,
          stack: false,
        };

      default:
        // Unknown hardware - no filter support
        return {
          scale: false,
          overlay: false,
          transpose: false,
          tonemap: false,
          deinterlace: false,
          denoise: false,
          flip: false,
          blur: false,
          sharpen: false,
          sobel: false,
          chromakey: false,
          colorspace: false,
          pad: false,
          stack: false,
        };
    }
  }
}
