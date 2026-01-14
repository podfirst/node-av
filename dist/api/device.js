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
/**
 * Error thrown when device operations fail
 */
export class DeviceError extends Error {
    code;
    platform;
    deviceId;
    /**
     * Creates a new DeviceError
     *
     * @param message Human-readable error message
     * @param code Error code for programmatic handling
     * @param platform Platform where the error occurred
     * @param deviceId Optional device identifier if applicable
     */
    constructor(message, code, platform, deviceId) {
        super(message);
        this.code = code;
        this.platform = platform;
        this.deviceId = deviceId;
        this.name = 'DeviceError';
    }
}
// ============================================================================
// Internal Helpers
// ============================================================================
/**
 * Converts native device info to public API format
 */
function toDeviceInfo(native) {
    return {
        id: native.id,
        name: native.name,
        ffmpegDevice: native.ffmpegDevice,
        mediaTypes: native.mediaTypes,
        platform: native.platform,
    };
}
/**
 * Converts native video mode to public API format
 */
function toVideoMode(native) {
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
function toDeviceCapabilities(native) {
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
    static getPlatform() {
        return bindings.Device.getPlatform();
    }
    static listDevices(mediaType) {
        try {
            const nativeDevices = bindings.Device.listDevices(mediaType);
            return nativeDevices.map(toDeviceInfo);
        }
        catch (error) {
            const platform = Device.getPlatform();
            throw new DeviceError(`Failed to enumerate devices: ${error instanceof Error ? error.message : String(error)}`, 'ENUMERATION_FAILED', platform);
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
    static probeCapabilities(device) {
        try {
            const nativeCaps = bindings.Device.probeCapabilities({
                id: device.id,
                platform: device.platform,
            });
            return toDeviceCapabilities(nativeCaps);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const code = message.includes('not found') ? 'DEVICE_NOT_FOUND' : 'PROBE_FAILED';
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
    static async probeCapabilitiesAsync(device) {
        try {
            const nativeCaps = await bindings.Device.probeCapabilitiesAsync({
                id: device.id,
                platform: device.platform,
            });
            return toDeviceCapabilities(nativeCaps);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const code = message.includes('not found') ? 'DEVICE_NOT_FOUND' : 'PROBE_FAILED';
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
    static findById(id, mediaType) {
        const devices = Device.listDevices(mediaType);
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
    static findByName(name, mediaType) {
        const devices = Device.listDevices(mediaType);
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
    static getDefaultVideoDevice() {
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
    static getDefaultAudioDevice() {
        const devices = Device.listDevices('audio');
        return devices[0];
    }
}
//# sourceMappingURL=device.js.map