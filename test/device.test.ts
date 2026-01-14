import assert from 'node:assert';
import { describe, it } from 'node:test';

import { Device, DeviceError, type DeviceInfo, type DevicePlatform, type VideoMode } from '../src/api/device.js';

describe('Device', () => {
  describe('getPlatform', () => {
    it('should return a valid platform', () => {
      const platform = Device.getPlatform();
      assert.ok(['avfoundation', 'dshow', 'v4l2', 'unknown'].includes(platform));
    });

    it('should return avfoundation on macOS', (t) => {
      if (process.platform !== 'darwin') {
        t.skip();
        return;
      }
      const platform = Device.getPlatform();
      assert.equal(platform, 'avfoundation');
    });

    it('should return dshow on Windows', (t) => {
      if (process.platform !== 'win32') {
        t.skip();
        return;
      }
      const platform = Device.getPlatform();
      assert.equal(platform, 'dshow');
    });

    it('should return v4l2 on Linux', (t) => {
      if (process.platform !== 'linux') {
        t.skip();
        return;
      }
      const platform = Device.getPlatform();
      assert.equal(platform, 'v4l2');
    });
  });

  describe('listDevices', () => {
    it('should return an array', () => {
      const devices = Device.listDevices();
      assert.ok(Array.isArray(devices));
    });

    it('should return DeviceInfo objects with required fields', () => {
      const devices = Device.listDevices();

      for (const device of devices) {
        // Type safety: all required fields must exist
        assert.ok(typeof device.id === 'string', 'id must be a string');
        assert.ok(device.id.length > 0, 'id must not be empty');

        assert.ok(typeof device.name === 'string', 'name must be a string');
        assert.ok(device.name.length > 0, 'name must not be empty');

        assert.ok(typeof device.ffmpegDevice === 'string', 'ffmpegDevice must be a string');

        assert.ok(Array.isArray(device.mediaTypes), 'mediaTypes must be an array');
        assert.ok(device.mediaTypes.length > 0, 'mediaTypes must not be empty');
        for (const mediaType of device.mediaTypes) {
          assert.ok(['video', 'audio'].includes(mediaType), `invalid mediaType: ${mediaType}`);
        }

        assert.ok(typeof device.platform === 'string', 'platform must be a string');
        assert.ok(
          ['avfoundation', 'dshow', 'v4l2', 'unknown'].includes(device.platform),
          `invalid platform: ${device.platform}`,
        );
      }
    });

    it('should filter by video media type', () => {
      const devices = Device.listDevices('video');

      for (const device of devices) {
        assert.ok(device.mediaTypes.includes('video'), `device ${device.name} should have video media type`);
      }
    });

    it('should filter by audio media type', () => {
      const devices = Device.listDevices('audio');

      for (const device of devices) {
        assert.ok(device.mediaTypes.includes('audio'), `device ${device.name} should have audio media type`);
      }
    });
  });

  describe('probeCapabilities', () => {
    it('should return capabilities for first video device', (t) => {
      const devices = Device.listDevices('video');
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const caps = Device.probeCapabilities(devices[0]);

      // Type safety: all required fields must exist
      assert.ok(Array.isArray(caps.modes), 'modes must be an array');
      assert.ok(Array.isArray(caps.pixelFormats), 'pixelFormats must be an array');
      assert.ok(Array.isArray(caps.videoCodecs), 'videoCodecs must be an array');
    });

    it('should return valid VideoMode objects', (t) => {
      const devices = Device.listDevices('video');
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const caps = Device.probeCapabilities(devices[0]);

      for (const mode of caps.modes) {
        assert.ok(typeof mode.width === 'number', 'width must be a number');
        assert.ok(mode.width > 0, 'width must be positive');

        assert.ok(typeof mode.height === 'number', 'height must be a number');
        assert.ok(mode.height > 0, 'height must be positive');

        assert.ok(typeof mode.minFps === 'number', 'minFps must be a number');
        assert.ok(mode.minFps >= 0, 'minFps must be non-negative');

        assert.ok(typeof mode.maxFps === 'number', 'maxFps must be a number');
        assert.ok(mode.maxFps > 0, 'maxFps must be positive');

        assert.ok(mode.maxFps >= mode.minFps, 'maxFps must be >= minFps');
      }
    });

    it('should return pixel format strings', (t) => {
      const devices = Device.listDevices('video');
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const caps = Device.probeCapabilities(devices[0]);

      for (const format of caps.pixelFormats) {
        assert.ok(typeof format === 'string', 'pixel format must be a string');
        assert.ok(format.length > 0, 'pixel format must not be empty');
      }
    });

    it('should throw DeviceError for non-existent device', () => {
      const fakeDevice: DeviceInfo = {
        id: 'non-existent-device-id',
        name: 'Fake Device',
        ffmpegDevice: 'fake',
        mediaTypes: ['video'],
        platform: Device.getPlatform(),
      };

      assert.throws(
        () => Device.probeCapabilities(fakeDevice),
        (error: unknown) => {
          assert.ok(error instanceof DeviceError);
          assert.ok(['DEVICE_NOT_FOUND', 'PROBE_FAILED'].includes(error.code));
          return true;
        },
      );
    });
  });

  describe('probeCapabilitiesAsync', () => {
    it('should return capabilities asynchronously', async (t) => {
      const devices = Device.listDevices('video');
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const caps = await Device.probeCapabilitiesAsync(devices[0]);

      assert.ok(Array.isArray(caps.modes), 'modes must be an array');
      assert.ok(Array.isArray(caps.pixelFormats), 'pixelFormats must be an array');
      assert.ok(Array.isArray(caps.videoCodecs), 'videoCodecs must be an array');
    });

    it('should reject with DeviceError for non-existent device', async () => {
      const fakeDevice: DeviceInfo = {
        id: 'non-existent-device-id',
        name: 'Fake Device',
        ffmpegDevice: 'fake',
        mediaTypes: ['video'],
        platform: Device.getPlatform(),
      };

      await assert.rejects(
        Device.probeCapabilitiesAsync(fakeDevice),
        (error: unknown) => {
          assert.ok(error instanceof DeviceError);
          assert.ok(['DEVICE_NOT_FOUND', 'PROBE_FAILED'].includes(error.code));
          return true;
        },
      );
    });
  });

  describe('findById', () => {
    it('should find device by ID', (t) => {
      const devices = Device.listDevices();
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const device = Device.findById(devices[0].id);
      assert.ok(device);
      assert.equal(device.id, devices[0].id);
    });

    it('should return undefined for non-existent ID', () => {
      const device = Device.findById('non-existent-id-12345');
      assert.equal(device, undefined);
    });
  });

  describe('findByName', () => {
    it('should find device by partial name match', (t) => {
      const devices = Device.listDevices();
      if (devices.length === 0) {
        t.skip();
        return;
      }

      // Use first few characters of device name
      const searchTerm = devices[0].name.substring(0, 4);
      const device = Device.findByName(searchTerm);
      assert.ok(device);
    });

    it('should be case-insensitive', (t) => {
      const devices = Device.listDevices();
      if (devices.length === 0) {
        t.skip();
        return;
      }

      const upperSearch = devices[0].name.toUpperCase().substring(0, 4);
      const lowerSearch = devices[0].name.toLowerCase().substring(0, 4);

      const upperResult = Device.findByName(upperSearch);
      const lowerResult = Device.findByName(lowerSearch);

      // Both should find the same device
      assert.ok(upperResult);
      assert.ok(lowerResult);
      assert.equal(upperResult.id, lowerResult.id);
    });

    it('should return undefined for non-existent name', () => {
      const device = Device.findByName('NonExistentDeviceName12345');
      assert.equal(device, undefined);
    });
  });

  describe('getDefaultVideoDevice', () => {
    it('should return first video device or undefined', () => {
      const defaultDevice = Device.getDefaultVideoDevice();
      const videoDevices = Device.listDevices('video');

      if (videoDevices.length > 0) {
        assert.ok(defaultDevice);
        assert.equal(defaultDevice.id, videoDevices[0].id);
      } else {
        assert.equal(defaultDevice, undefined);
      }
    });
  });

  describe('getDefaultAudioDevice', () => {
    it('should return first audio device or undefined', () => {
      const defaultDevice = Device.getDefaultAudioDevice();
      const audioDevices = Device.listDevices('audio');

      if (audioDevices.length > 0) {
        assert.ok(defaultDevice);
        assert.equal(defaultDevice.id, audioDevices[0].id);
      } else {
        assert.equal(defaultDevice, undefined);
      }
    });
  });

  describe('DeviceError', () => {
    it('should be an instance of Error', () => {
      const error = new DeviceError('Test error', 'PROBE_FAILED', 'avfoundation', 'test-id');
      assert.ok(error instanceof Error);
      assert.ok(error instanceof DeviceError);
    });

    it('should have correct properties', () => {
      const error = new DeviceError('Test error message', 'DEVICE_NOT_FOUND', 'dshow', 'device-123');

      assert.equal(error.message, 'Test error message');
      assert.equal(error.code, 'DEVICE_NOT_FOUND');
      assert.equal(error.platform, 'dshow');
      assert.equal(error.deviceId, 'device-123');
      assert.equal(error.name, 'DeviceError');
    });

    it('should work without deviceId', () => {
      const error = new DeviceError('Enumeration failed', 'ENUMERATION_FAILED', 'v4l2');

      assert.equal(error.code, 'ENUMERATION_FAILED');
      assert.equal(error.deviceId, undefined);
    });
  });
});
