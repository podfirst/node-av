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
import type { NativeDevicePlatform, NativeMediaType } from '../lib/native-types.js';
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
export type DeviceErrorCode = 'DEVICE_NOT_FOUND' | 'PERMISSION_DENIED' | 'DEVICE_BUSY' | 'ENUMERATION_FAILED' | 'PROBE_FAILED' | 'INVALID_PLATFORM';
/**
 * Error thrown when device operations fail
 */
export declare class DeviceError extends Error {
    readonly code: DeviceErrorCode;
    readonly platform: DevicePlatform;
    readonly deviceId?: string | undefined;
    /**
     * Creates a new DeviceError
     *
     * @param message Human-readable error message
     * @param code Error code for programmatic handling
     * @param platform Platform where the error occurred
     * @param deviceId Optional device identifier if applicable
     */
    constructor(message: string, code: DeviceErrorCode, platform: DevicePlatform, deviceId?: string | undefined);
}
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
export declare class Device {
    /**
     * Get the current platform's device format.
     *
     * @returns Platform identifier:
     *   - `'avfoundation'` on macOS
     *   - `'dshow'` on Windows
     *   - `'v4l2'` on Linux
     *   - `'unknown'` on unsupported platforms
     */
    static getPlatform(): DevicePlatform;
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
    static probeCapabilities(device: DeviceInfo): DeviceCapabilities;
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
    static probeCapabilitiesAsync(device: DeviceInfo): Promise<DeviceCapabilities>;
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
    static findById(id: string, mediaType?: MediaType): DeviceInfo | undefined;
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
    static findByName(name: string, mediaType?: MediaType): DeviceInfo | undefined;
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
    static getDefaultVideoDevice(): DeviceInfo | undefined;
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
    static getDefaultAudioDevice(): DeviceInfo | undefined;
}
