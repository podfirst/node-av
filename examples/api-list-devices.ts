/**
 * List Capture Devices and Their Capabilities
 *
 * Demonstrates the Device API for enumerating capture devices and querying capabilities.
 * Uses platform-native APIs (AVFoundation, DirectShow, V4L2) for reliable device information.
 *
 * Usage:
 *   tsx examples/api-list-devices.ts
 */

import { Device } from '../src/api/device.js';

console.log('Device Enumeration Demo\n');
console.log('========================');
console.log(`Platform: ${Device.getPlatform()}\n`);

// List all devices
const allDevices = Device.listDevices();
console.log(`Total devices found: ${allDevices.length}\n`);

// List video devices
console.log('--- VIDEO DEVICES ---\n');
const videoDevices = Device.listDevices('video');

if (videoDevices.length === 0) {
  console.log('No video devices found.\n');
} else {
  for (const device of videoDevices) {
    console.log(`${device.name}`);
    console.log(`  ID: ${device.id}`);
    console.log(`  FFmpeg device: ${device.ffmpegDevice}`);
    console.log(`  Platform: ${device.platform}`);

    try {
      // Probe capabilities (using async version for non-blocking)
      const caps = await Device.probeCapabilitiesAsync(device);

      // Show modes (resolution + frame rate combinations)
      console.log(`  Modes: ${caps.modes.length}`);

      // Group modes by resolution for cleaner output
      const modesByResolution = new Map<string, { minFps: number; maxFps: number }[]>();
      for (const mode of caps.modes) {
        const key = `${mode.width}x${mode.height}`;
        if (!modesByResolution.has(key)) {
          modesByResolution.set(key, []);
        }
        modesByResolution.get(key)!.push({ minFps: mode.minFps, maxFps: mode.maxFps });
      }

      // Show top 5 resolutions by area (largest first)
      const sortedResolutions = [...modesByResolution.entries()].sort((a, b) => {
        const [wa, ha] = a[0].split('x').map(Number);
        const [wb, hb] = b[0].split('x').map(Number);
        return wb * hb - wa * ha; // Descending by area
      });

      for (const [resolution, fpsRanges] of sortedResolutions.slice(0, 5)) {
        // Merge FPS ranges
        const minFps = Math.min(...fpsRanges.map((r) => r.minFps));
        const maxFps = Math.max(...fpsRanges.map((r) => r.maxFps));
        console.log(`    ${resolution} @ ${minFps.toFixed(1)}-${maxFps.toFixed(1)} fps`);
      }

      if (sortedResolutions.length > 5) {
        console.log(`    ... and ${sortedResolutions.length - 5} more resolutions`);
      }

      // Show pixel formats
      if (caps.pixelFormats.length > 0) {
        console.log(`  Pixel formats: ${caps.pixelFormats.join(', ')}`);
      }

      // Show video codecs (compressed formats like MJPEG, H.264)
      if (caps.videoCodecs.length > 0) {
        console.log(`  Compressed formats: ${caps.videoCodecs.join(', ')}`);
      }
    } catch (error) {
      console.log(`  Error probing capabilities: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log('');
  }
}

// List audio devices
console.log('--- AUDIO DEVICES ---\n');
const audioDevices = Device.listDevices('audio');

if (audioDevices.length === 0) {
  console.log('No audio devices found.\n');
} else {
  for (const device of audioDevices) {
    console.log(`${device.name}`);
    console.log(`  ID: ${device.id}`);
    console.log(`  FFmpeg device: ${device.ffmpegDevice}`);
    console.log(`  Platform: ${device.platform}`);
    console.log('');
  }
}

// Show default devices
console.log('--- DEFAULT DEVICES ---\n');

const defaultVideo = Device.getDefaultVideoDevice();
if (defaultVideo) {
  console.log(`Default video: ${defaultVideo.name}`);
} else {
  console.log('Default video: (none)');
}

const defaultAudio = Device.getDefaultAudioDevice();
if (defaultAudio) {
  console.log(`Default audio: ${defaultAudio.name}`);
} else {
  console.log('Default audio: (none)');
}

console.log('\nDone.');
