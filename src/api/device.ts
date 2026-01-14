/**
 * Device Enumeration API
 * =======================
 *
 * Type-safe device enumeration and capability querying using platform-native APIs.
 *
 * Uses:
 * - macOS: AVFoundation (AVCaptureDevice)
 * - Windows: DirectShow (ICreateDevEnum, IAMStreamConfig)
 * - Linux: V4L2 (Video4Linux2)
 *
 * @module
 */

import { bindings } from '../lib/binding.js';
import type {
  NativeDeviceCapabilities,
  NativeDeviceInfo,
  NativeDevicePlatform,
  NativeMediaType,
  NativeVideoMode,
} from '../lib/native-types.js';

// ============================================================================
// Type Definitions (re-exported for public API)
// ============================================================================

/**
 * Supported capture platforms
 */
export type DevicePlatform = NativeDevicePlatform;

/**
 * Media types a device can capture
 */
export type MediaType = NativeMediaType;

/**
 * Information about a capture device
 */
export interface DeviceInfo {
  /** Stable unique identifier (persists across sessions) */
  readonly id: string;

  /** Human-readable device name for UI display */
  readonly name: string;

  /** Platform-specific device string for FFmpeg (e.g., "0" for avfoundation, "video=Name" for dshow) */
  readonly ffmpegDevice: string;

  /** Types of media this device can capture */
  readonly mediaTypes: readonly MediaType[];

  /** Platform this device was enumerated from */
  readonly platform: DevicePlatform;
}

/**
 * A specific video capture mode
 */
export interface VideoMode {
  /** Width in pixels */
  readonly width: number;

  /** Height in pixels */
  readonly height: number;

  /** Minimum supported frame rate */
  readonly minFps: number;

  /** Maximum supported frame rate */
  readonly maxFps: number;
}

/**
 * Device capabilities for video capture
 */
export interface DeviceCapabilities {
  /** Supported video modes (resolution + frame rate) */
  readonly modes: readonly VideoMode[];

  /** Supported pixel formats (FFmpeg names: 'nv12', 'yuyv422', etc.) */
  readonly pixelFormats: readonly string[];

  /** Supported video codecs for compressed formats ('mjpeg', 'h264') */
  readonly videoCodecs: readonly string[];
}

/**
 * Error codes for device operations
 */
export type DeviceErrorCode =
  | 'DEVICE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'DEVICE_BUSY'
  | 'ENUMERATION_FAILED'
  | 'PROBE_FAILED'
  | 'INVALID_PLATFORM';

/**
 * Error thrown when device operations fail
 */
export class DeviceError extends Error {
  /**
   * Creates a new DeviceError
   *
   * @param message Human-readable error message
   * @param code Error code for programmatic handling
   * @param platform Platform where the error occurred
   * @param deviceId Optional device identifier if applicable
   */
  constructor(
    message: string,
    public readonly code: DeviceErrorCode,
    public readonly platform: DevicePlatform,
    public readonly deviceId?: string,
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Converts native device info to public API format
 */
function toDeviceInfo(native: NativeDeviceInfo): DeviceInfo {
  return {
    id: native.id,
    name: native.name,
    ffmpegDevice: native.ffmpegDevice,
    mediaTypes: native.mediaTypes as readonly MediaType[],
    platform: native.platform as DevicePlatform,
  };
}

/**
 * Converts native video mode to public API format
 */
function toVideoMode(native: NativeVideoMode): VideoMode {
  return {
    width: native.width,
    height: native.height,
    minFps: native.minFps,
    maxFps: native.maxFps,
  };
}

/**
 * Converts native capabilities to public API format
 */
function toDeviceCapabilities(native: NativeDeviceCapabilities): DeviceCapabilities {
  return {
    modes: native.modes.map(toVideoMode),
    pixelFormats: [...native.pixelFormats],
    videoCodecs: [...native.videoCodecs],
  };
}

// ============================================================================
// Device Class
// ============================================================================

/**
 * Device enumeration and capability querying
 *
 * Provides type-safe access to capture devices using platform-native APIs.
 * All methods are static - no instantiation required.
 *
 * @example
 * ```typescript
 * import { Device } from 'node-av/api';
 *
 * // Get current platform
 * console.log('Platform:', Device.getPlatform());
 *
 * // List all video devices
 * const videoDevices = Device.listDevices('video');
 * for (const device of videoDevices) {
 *   console.log(`${device.name} (${device.id})`);
 *
 *   // Probe capabilities
 *   const caps = await Device.probeCapabilitiesAsync(device);
 *   console.log(`  Modes: ${caps.modes.length}`);
 *   console.log(`  Formats: ${caps.pixelFormats.join(', ')}`);
 * }
 * ```
 */
export class Device {
  /**
   * Get the current platform's device format.
   *
   * @returns Platform identifier:
   *   - `'avfoundation'` on macOS
   *   - `'dshow'` on Windows
   *   - `'v4l2'` on Linux
   *   - `'unknown'` on unsupported platforms
   */
  static getPlatform(): DevicePlatform {
    return bindings.Device.getPlatform();
  }

  /**
   * List all available capture devices on the current platform.
   *
   * @returns Array of device information for all detected devices
   * @throws {DeviceError} If enumeration fails (code: 'ENUMERATION_FAILED')
   *
   * @example
   * ```typescript
   * const allDevices = Device.listDevices();
   * console.log(`Found ${allDevices.length} devices`);
   * ```
   */
  static listDevices(): DeviceInfo[];

  /**
   * List capture devices filtered by media type.
   *
   * @param mediaType Filter by 'video' or 'audio'
   * @returns Array of device information matching the filter
   * @throws {DeviceError} If enumeration fails (code: 'ENUMERATION_FAILED')
   *
   * @example
   * ```typescript
   * const videoDevices = Device.listDevices('video');
   * const audioDevices = Device.listDevices('audio');
   * ```
   */
  static listDevices(mediaType: MediaType): DeviceInfo[];

  static listDevices(mediaType?: MediaType): DeviceInfo[] {
    try {
      const nativeDevices = bindings.Device.listDevices(mediaType);
      return nativeDevices.map(toDeviceInfo);
    } catch (error) {
      const platform = Device.getPlatform();
      throw new DeviceError(
        `Failed to enumerate devices: ${error instanceof Error ? error.message : String(error)}`,
        'ENUMERATION_FAILED',
        platform,
      );
    }
  }

  /**
   * Probe capabilities for a specific device (synchronous).
   *
   * For UI contexts, prefer `probeCapabilitiesAsync` to avoid blocking the event loop.
   *
   * @param device Device from `listDevices()`
   * @returns Device capabilities including modes, pixel formats, and codecs
   * @throws {DeviceError} If device cannot be probed (code: 'PROBE_FAILED' or 'DEVICE_NOT_FOUND')
   *
   * @example
   * ```typescript
   * const devices = Device.listDevices('video');
   * if (devices.length > 0) {
   *   const caps = Device.probeCapabilities(devices[0]);
   *   for (const mode of caps.modes) {
   *     console.log(`${mode.width}x${mode.height} @ ${mode.minFps}-${mode.maxFps} fps`);
   *   }
   * }
   * ```
   */
  static probeCapabilities(device: DeviceInfo): DeviceCapabilities {
    try {
      const nativeCaps = bindings.Device.probeCapabilities({
        id: device.id,
        platform: device.platform,
      });
      return toDeviceCapabilities(nativeCaps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code: DeviceErrorCode = message.includes('not found') ? 'DEVICE_NOT_FOUND' : 'PROBE_FAILED';
      throw new DeviceError(`Failed to probe device capabilities: ${message}`, code, device.platform, device.id);
    }
  }

  /**
   * Probe capabilities for a specific device (asynchronous).
   *
   * Recommended for UI contexts to avoid blocking the event loop.
   *
   * @param device Device from `listDevices()`
   * @returns Promise resolving to device capabilities
   * @throws {DeviceError} If device cannot be probed (code: 'PROBE_FAILED' or 'DEVICE_NOT_FOUND')
   *
   * @example
   * ```typescript
   * const devices = Device.listDevices('video');
   * if (devices.length > 0) {
   *   const caps = await Device.probeCapabilitiesAsync(devices[0]);
   *   console.log(`Pixel formats: ${caps.pixelFormats.join(', ')}`);
   *   console.log(`Video codecs: ${caps.videoCodecs.join(', ') || 'none'}`);
   * }
   * ```
   */
  static async probeCapabilitiesAsync(device: DeviceInfo): Promise<DeviceCapabilities> {
    try {
      const nativeCaps = await bindings.Device.probeCapabilitiesAsync({
        id: device.id,
        platform: device.platform,
      });
      return toDeviceCapabilities(nativeCaps);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code: DeviceErrorCode = message.includes('not found') ? 'DEVICE_NOT_FOUND' : 'PROBE_FAILED';
      throw new DeviceError(`Failed to probe device capabilities: ${message}`, code, device.platform, device.id);
    }
  }

  /**
   * Find a device by its unique ID.
   *
   * @param id Device ID to search for
   * @param mediaType Optional filter by media type
   * @returns Device info if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const device = Device.findById('0x1420000005ac8600');
   * if (device) {
   *   console.log(`Found: ${device.name}`);
   * }
   * ```
   */
  static findById(id: string, mediaType?: MediaType): DeviceInfo | undefined {
    const devices = Device.listDevices(mediaType as MediaType);
    return devices.find((d) => d.id === id);
  }

  /**
   * Find a device by its name (case-insensitive partial match).
   *
   * @param name Device name to search for
   * @param mediaType Optional filter by media type
   * @returns Device info if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const device = Device.findByName('facetime');
   * if (device) {
   *   console.log(`Found: ${device.name}`);
   * }
   * ```
   */
  static findByName(name: string, mediaType?: MediaType): DeviceInfo | undefined {
    const devices = Device.listDevices(mediaType as MediaType);
    const lowerName = name.toLowerCase();
    return devices.find((d) => d.name.toLowerCase().includes(lowerName));
  }

  /**
   * Get the default video device (first available).
   *
   * @returns Default video device or undefined if none available
   *
   * @example
   * ```typescript
   * const defaultCamera = Device.getDefaultVideoDevice();
   * if (defaultCamera) {
   *   console.log(`Default camera: ${defaultCamera.name}`);
   * }
   * ```
   */
  static getDefaultVideoDevice(): DeviceInfo | undefined {
    const devices = Device.listDevices('video');
    return devices[0];
  }

  /**
   * Get the default audio device (first available).
   *
   * @returns Default audio device or undefined if none available
   *
   * @example
   * ```typescript
   * const defaultMic = Device.getDefaultAudioDevice();
   * if (defaultMic) {
   *   console.log(`Default mic: ${defaultMic.name}`);
   * }
   * ```
   */
  static getDefaultAudioDevice(): DeviceInfo | undefined {
    const devices = Device.listDevices('audio');
    return devices[0];
  }
}
