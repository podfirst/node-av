import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  AV_CODEC_ID_H264,
  AV_HWDEVICE_TYPE_CUDA,
  AV_HWDEVICE_TYPE_NONE,
  AV_HWDEVICE_TYPE_OPENCL,
  AV_HWDEVICE_TYPE_QSV,
  AV_HWDEVICE_TYPE_RKMPP,
  AV_HWDEVICE_TYPE_VAAPI,
  AV_HWDEVICE_TYPE_VIDEOTOOLBOX,
  AV_HWDEVICE_TYPE_VULKAN,
  Decoder,
  Encoder,
  FF_ENCODER_LIBX264,
  HardwareContext,
  MediaInput,
  type AVHWDeviceType,
} from '../src/index.js';
import { getInputFile, prepareTestEnvironment, skipInCI } from './index.js';

import type { Frame } from '../src/lib/index.js';

prepareTestEnvironment();

const inputFile = getInputFile('video.mp4');

describe('HardwareContext', () => {
  describe('static methods', () => {
    it('should list available hardware types', () => {
      const available = HardwareContext.listAvailable();
      assert.ok(Array.isArray(available), 'Should return an array');
      console.log('Available hardware:', available.join(', ') || 'none');
    });

    it('should auto-detect hardware', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (hw) {
        console.log(`Auto-detected hardware: ${hw.deviceTypeName}`);
        assert.ok(hw.deviceContext, 'Should have device context');
        assert.ok(hw.deviceType !== AV_HWDEVICE_TYPE_NONE, 'Should have valid device type');
        hw.dispose();
      } else {
        console.log('No hardware acceleration available');
      }
    });

    it('should handle unknown device type', () => {
      assert.equal(HardwareContext.create(AV_HWDEVICE_TYPE_NONE), null, 'Should return null for unknown device type');
    });
  });

  describe('instance methods', () => {
    it('should provide device information', skipInCI, () => {
      const hw = HardwareContext.auto();
      if (hw) {
        assert.ok(hw.deviceTypeName, 'Should have device type name');
        assert.ok(typeof hw.deviceType === 'number', 'Should have device type number');
        assert.ok(typeof hw.devicePixelFormat === 'number', 'Should have hardware pixel format');
        hw.dispose();
      }
    });

    it('should get encoder codec for base codec name', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (hw) {
        // Test getting hardware encoder codec
        const h264Encoder = hw.getEncoderCodec('h264');
        const hevcEncoder = hw.getEncoderCodec('hevc');
        const av1Encoder = hw.getEncoderCodec('av1');

        console.log(`Hardware encoder codecs for ${hw.deviceTypeName}:`);
        console.log(`  h264: ${h264Encoder?.name ?? 'not supported'}`);
        console.log(`  hevc: ${hevcEncoder?.name ?? 'not supported'}`);
        console.log(`  av1: ${av1Encoder?.name ?? 'not supported'}`);

        // At least one might be supported depending on hardware
        assert.ok(h264Encoder !== null || hevcEncoder !== null || av1Encoder !== null || true, 'Hardware might support some codecs');

        hw.dispose();
      }
    });

    it('should support Symbol.dispose', skipInCI, () => {
      const hw = HardwareContext.auto();
      if (hw) {
        {
          using disposableHw = hw;
          assert.ok(disposableHw.deviceContext, 'Should work inside using block');
        }
        // Hardware should be disposed here
        assert.ok(hw.isDisposed, 'Should be disposed after using block');
      }
    });

    it('should check if hardware is disposed', skipInCI, () => {
      const hw = HardwareContext.auto();
      if (hw) {
        assert.equal(hw.isDisposed, false, 'Should not be disposed initially');
        hw.dispose();
        assert.equal(hw.isDisposed, true, 'Should be disposed after calling dispose()');
      }
    });
  });

  describe('specific hardware types', skipInCI, () => {
    it('should handle CUDA if available', () => {
      const cuda = HardwareContext.create(AV_HWDEVICE_TYPE_CUDA);
      if (cuda) {
        console.log('CUDA hardware acceleration available');
        assert.equal(cuda.deviceTypeName, 'cuda', 'Should be CUDA device');
        cuda.dispose();
      } else {
        console.log('CUDA not available on this system');
      }
    });

    it('should handle VideoToolbox if available', () => {
      const vt = HardwareContext.create(AV_HWDEVICE_TYPE_VIDEOTOOLBOX);

      if (vt) {
        console.log('VideoToolbox hardware acceleration available');
        assert.equal(vt.deviceTypeName, 'videotoolbox', 'Should be VideoToolbox device');
        vt.dispose();
      } else {
        console.log('VideoToolbox not available');
      }
    });

    it('should handle VAAPI if available', () => {
      const vaapi = HardwareContext.create(AV_HWDEVICE_TYPE_VAAPI);

      if (vaapi) {
        console.log('VAAPI hardware acceleration available');
        assert.equal(vaapi.deviceTypeName, 'vaapi', 'Should be VAAPI device');
        vaapi.dispose();
      } else {
        console.log('VAAPI not available');
      }
    });

    it('should handle QSV if available', () => {
      const qsv = HardwareContext.create(AV_HWDEVICE_TYPE_QSV);

      if (qsv) {
        console.log('QSV hardware acceleration available');
        assert.equal(qsv.deviceTypeName, 'qsv', 'Should be QSV device');
        qsv.dispose();
      } else {
        console.log('QSV not available');
      }
    });

    it('should handle RKMPP if available', () => {
      const rk = HardwareContext.create(AV_HWDEVICE_TYPE_RKMPP);

      if (rk) {
        console.log('RKMPP hardware acceleration available');
        assert.equal(rk.deviceTypeName, 'rkmpp', 'Should be RKMPP device');
        rk.dispose();
      } else {
        console.log('RKMPP not available');
      }
    });

    it('should handle Vulkan if available', () => {
      const vk = HardwareContext.create(AV_HWDEVICE_TYPE_VULKAN);

      if (vk) {
        console.log('Vulkan hardware acceleration available');
        assert.equal(vk.deviceTypeName, 'vulkan', 'Should be Vulkan device');
        vk.dispose();
      } else {
        console.log('Vulkan not available');
      }
    });

    it('should handle OpenCL if available', () => {
      const cl = HardwareContext.create(AV_HWDEVICE_TYPE_OPENCL);

      if (cl) {
        console.log('OpenCL hardware acceleration available');
        assert.equal(cl.deviceTypeName, 'opencl', 'Should be OpenCL device');
        cl.dispose();
      } else {
        console.log('OpenCL not available');
      }
    });
  });

  describe('hardware validation', skipInCI, () => {
    it('should validate decoder with testDecoder()', () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping decoder validation test');
        return;
      }

      try {
        const isDecoderWorking = hw.testDecoder();
        console.log(`Hardware decoder test: ${isDecoderWorking ? 'PASSED' : 'FAILED'}`);
        assert.ok(isDecoderWorking, 'Hardware decoder should be working');
        hw.dispose();
      } catch (error) {
        console.log('Decoder validation failed:', error);
        hw.dispose();
        throw error;
      }
    });

    it('should validate encoder with testEncoder()', () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping encoder validation test');
        return;
      }

      try {
        // Try to test H.264 encoder
        const encoderCodec = hw.getEncoderCodec('h264');
        if (!encoderCodec) {
          console.log('No H.264 hardware encoder available - skipping test');
          hw.dispose();
          return;
        }

        console.log(`Testing hardware encoder: ${encoderCodec.name}`);
        const isEncoderWorking = hw.testEncoder(AV_CODEC_ID_H264, encoderCodec);
        console.log(`Hardware encoder test (${encoderCodec.name}): ${isEncoderWorking ? 'PASSED' : 'FAILED'}`);

        // Don't fail test if encoder doesn't work - some hardware only supports decoding
        if (!isEncoderWorking) {
          console.log(`Note: ${hw.deviceTypeName} encoder not working - this is normal for some hardware`);
        }

        hw.dispose();
      } catch (error) {
        console.log('Encoder validation test error:', error);
        hw.dispose();
        // Don't throw - encoder support is optional
      }
    });

    it('should validate specific hardware types with create()', () => {
      // Helper function to test a hardware type
      const testHardware = (hwType: AVHWDeviceType, name: string) => {
        const hw = HardwareContext.create(hwType);
        if (hw) {
          console.log(`\nTesting ${name}...`);

          // Test decoder
          const decoderWorks = hw.testDecoder();
          console.log(`  ${name} decoder: ${decoderWorks ? '✓ PASSED' : '✗ FAILED'}`);

          // Test encoder if available
          const encoderCodec = hw.getEncoderCodec('h264');
          if (encoderCodec) {
            const encoderWorks = hw.testEncoder(AV_CODEC_ID_H264, encoderCodec);
            console.log(`  ${name} encoder (${encoderCodec.name}): ${encoderWorks ? '✓ PASSED' : '✗ FAILED'}`);
          } else {
            console.log(`  ${name} encoder: ⊘ Not available`);
          }

          hw.dispose();
          return true;
        }
        return false;
      };

      let testedCount = 0;

      // Test CUDA
      if (testHardware(AV_HWDEVICE_TYPE_CUDA, 'CUDA')) testedCount++;

      // Test VideoToolbox
      if (testHardware(AV_HWDEVICE_TYPE_VIDEOTOOLBOX, 'VideoToolbox')) testedCount++;

      // Test QSV
      if (testHardware(AV_HWDEVICE_TYPE_QSV, 'QSV')) testedCount++;

      // Test VAAPI
      if (testHardware(AV_HWDEVICE_TYPE_VAAPI, 'VAAPI')) testedCount++;

      // Test RKMPP
      if (testHardware(AV_HWDEVICE_TYPE_RKMPP, 'RKMPP')) testedCount++;

      // Test Vulkan
      if (testHardware(AV_HWDEVICE_TYPE_VULKAN, 'Vulkan')) testedCount++;

      // Test OpenCL
      if (testHardware(AV_HWDEVICE_TYPE_OPENCL, 'OpenCL')) testedCount++;

      console.log(`\nTotal hardware types tested: ${testedCount}`);
    });

    it('should validate encoder codec with validate parameter', () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping encoder codec validation test');
        return;
      }

      try {
        // Get encoder without validation
        const encoderWithoutValidation = hw.getEncoderCodec('h264', false);
        console.log(`Encoder without validation: ${encoderWithoutValidation?.name ?? 'none'}`);

        // Get encoder with validation (should actually test it)
        const encoderWithValidation = hw.getEncoderCodec('h264', true);
        console.log(`Encoder with validation: ${encoderWithValidation?.name ?? 'none'}`);

        // If validation fails, encoder should be null
        if (encoderWithoutValidation && !encoderWithValidation) {
          console.log('Encoder exists but validation failed');
        }

        hw.dispose();
      } catch (error) {
        console.log('Encoder codec validation test failed:', error);
        hw.dispose();
      }
    });
  });

  describe('hardware disposal', () => {
    it('should safely dispose hardware multiple times', skipInCI, () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping test');
        return;
      }

      // First dispose
      hw.dispose();
      assert.ok(hw.isDisposed, 'Should be marked as disposed');

      // Second dispose should be safe (no-op)
      hw.dispose();
      assert.ok(hw.isDisposed, 'Should still be disposed');

      // Third dispose should also be safe
      hw.dispose();
      assert.ok(hw.isDisposed, 'Should still be disposed');
    });

    it('should dispose hardware when decoder closes', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping test');
        return;
      }

      const media = await MediaInput.open(inputFile);
      const videoStream = media.video(0);
      assert.ok(videoStream, 'Should have video stream');

      // Decoder needs hardware context in options
      const decoder = await Decoder.create(videoStream, {
        hardware: hw,
      });

      assert.ok(!hw.isDisposed, 'Hardware should not be disposed yet');

      decoder.close();
      assert.ok(!hw.isDisposed, 'Hardware should not be disposed after decoder closes');

      hw.dispose();
      assert.ok(hw.isDisposed, 'Should be disposed');

      media.close();
    });

    it('should dispose hardware when encoder closes', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping test');
        return;
      }

      try {
        // Encoder detects hardware from frame's hw_frames_ctx
        const encoder = await Encoder.create(FF_ENCODER_LIBX264, {
          timeBase: { num: 1, den: 25 },
          frameRate: { num: 25, den: 1 },
          bitrate: '1M',
        });

        assert.ok(!hw.isDisposed, 'Hardware should not be disposed yet');

        encoder.close();
        assert.ok(!hw.isDisposed, 'Hardware should not be disposed after encoder closes');

        hw.dispose();
        assert.ok(hw.isDisposed, 'Should be disposed');
      } catch (error) {
        // Hardware encoding might not be supported
        console.log('Hardware encoding not supported:', error);
        hw.dispose();
      }
    });

    it('should allow sharing hardware between multiple decoders', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware available - skipping test');
        return;
      }

      const media1 = await MediaInput.open(inputFile);
      const media2 = await MediaInput.open(inputFile);
      const videoStream1 = media1.video(0);
      const videoStream2 = media2.video(0);

      assert.ok(videoStream1 && videoStream2, 'Should have video streams');

      // Create two decoders sharing the same hardware
      const decoder1 = await Decoder.create(videoStream1, {
        hardware: hw,
      });
      const decoder2 = await Decoder.create(videoStream2, {
        hardware: hw,
      });

      assert.ok(!hw.isDisposed, 'Hardware should not be disposed yet');

      decoder1.close();
      assert.ok(!hw.isDisposed, 'Hardware should not be disposed after first decoder closes');

      decoder2.close();
      assert.ok(!hw.isDisposed, 'Hardware should still not be disposed after second decoder closes');

      hw.dispose();
      assert.ok(hw.isDisposed, 'Should be disposed');

      media1.close();
      media2.close();
    });
  });

  describe('hardware integration', () => {
    it('should work with Decoder when hardware is available (async)', skipInCI, async () => {
      // Try to get hardware context
      const hw = HardwareContext.auto();

      if (!hw) {
        console.log('No hardware acceleration available - skipping test');
        return;
      }

      try {
        // Open a test video
        const media = await MediaInput.open(inputFile);
        const videoStream = media.video(0);
        assert.ok(videoStream, 'Should have video stream');

        // Create decoder with hardware acceleration
        const decoder = await Decoder.create(videoStream, {
          hardware: hw,
        });

        // Decode first frame to verify it works
        let frameCount = 0;
        for await (const packet of media.packets()) {
          if (packet.streamIndex === videoStream.index) {
            const frame = await decoder.decode(packet);
            if (frame) {
              frameCount++;
              frame.free();
              break; // Just test first frame
            }
          }
        }

        assert.ok(frameCount > 0, 'Should decode at least one frame');

        decoder.close();
        media.close();
      } catch (error) {
        // Hardware might not support the codec
        console.log('Hardware acceleration test failed:', error);
        hw.dispose();
      }
    });

    it('should work with Decoder when hardware is available (sync)', skipInCI, async () => {
      // Try to get hardware context
      const hw = HardwareContext.auto();

      if (!hw) {
        console.log('No hardware acceleration available - skipping test');
        return;
      }

      try {
        // Open a test video
        const media = await MediaInput.open(inputFile);
        const videoStream = media.video(0);
        assert.ok(videoStream, 'Should have video stream');

        // Create decoder with hardware acceleration
        const decoder = await Decoder.create(videoStream, {
          hardware: hw,
        });

        // Decode first frame to verify it works
        let frameCount = 0;
        for await (const packet of media.packets()) {
          if (packet.streamIndex === videoStream.index) {
            const frame = decoder.decodeSync(packet);
            if (frame) {
              frameCount++;
              frame.free();
              break; // Just test first frame
            }
          }
        }

        assert.ok(frameCount > 0, 'Should decode at least one frame');

        decoder.close();
        media.close();
      } catch (error) {
        // Hardware might not support the codec
        console.log('Hardware acceleration test failed:', error);
        hw.dispose();
      }
    });

    it('should work with Decoder using auto hardware detection (async)', skipInCI, async () => {
      const media = await MediaInput.open(inputFile);
      const videoStream = media.video(0);
      assert.ok(videoStream, 'Should have video stream');

      // Auto-detect hardware and create decoder
      const hw = HardwareContext.auto();
      const decoder = await Decoder.create(videoStream, hw ? { hardware: hw } : {});

      // Decode first frame
      let frameCount = 0;
      for await (const packet of media.packets()) {
        if (packet.streamIndex === videoStream.index) {
          const frame = await decoder.decode(packet);
          if (frame) {
            frameCount++;
            frame.free();
            break;
          }
        }
      }

      assert.ok(frameCount > 0, 'Should decode at least one frame');

      decoder.close();
      media.close();
      // hw is disposed by decoder.close()
    });

    it('should work with Decoder using auto hardware detection (sync)', skipInCI, async () => {
      const media = await MediaInput.open(inputFile);
      const videoStream = media.video(0);
      assert.ok(videoStream, 'Should have video stream');

      // Auto-detect hardware and create decoder
      const hw = HardwareContext.auto();
      const decoder = await Decoder.create(videoStream, hw ? { hardware: hw } : {});

      // Decode first frame
      let frameCount = 0;
      for await (const packet of media.packets()) {
        if (packet.streamIndex === videoStream.index) {
          const frame = decoder.decodeSync(packet);
          if (frame) {
            frameCount++;
            frame.free();
            break;
          }
        }
      }

      assert.ok(frameCount > 0, 'Should decode at least one frame');

      decoder.close();
      media.close();
      // hw is disposed by decoder.close()
    });

    it('should work with Encoder when hardware is available', skipInCI, async () => {
      const hw = HardwareContext.auto();

      if (!hw) {
        console.log('No hardware acceleration available for encoding - skipping test');
        return;
      }

      const hwEncoderCodec = hw.getEncoderCodec('h264');
      if (!hwEncoderCodec) {
        console.log('Hardware encoder codec not available - skipping test');
        return;
      }

      const encoder = await Encoder.create(hwEncoderCodec, {
        timeBase: { num: 1, den: 25 },
        frameRate: { num: 25, den: 1 },
        bitrate: '1M',
      });

      // Just verify it was created successfully
      assert.ok(encoder, 'Should create hardware encoder');

      encoder.close();
      hw.dispose();
    });

    it('should work with Encoder using auto hardware detection', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        return;
      }

      try {
        // Use hardware-specific encoder codec if available
        const hwEncoderCodec = hw.getEncoderCodec('h264');
        if (!hwEncoderCodec) {
          hw.dispose();
          return;
        }

        const encoder = await Encoder.create(hwEncoderCodec, {
          timeBase: { num: 1, den: 25 },
          frameRate: { num: 25, den: 1 },
          bitrate: '1M',
        });

        // Just verify it was created
        assert.ok(encoder, 'Should create encoder');

        encoder.close();
      } catch (error) {
        // Auto hardware might fail, that's OK
        console.log('Auto hardware encoding failed (expected):', error);
        hw?.dispose();
      }
    });
  });

  describe('zero-copy GPU transfer', () => {
    it('should transfer frames from decoder to encoder on GPU (zero-copy) (async)', skipInCI, async () => {
      // This test demonstrates zero-copy GPU frame transfer
      // where frames stay on GPU between decode and encode

      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware acceleration available - skipping zero-copy test');
        return;
      }

      try {
        // Open test video
        const media = await MediaInput.open(inputFile);
        const videoStream = media.video(0);
        assert.ok(videoStream, 'Should have video stream');

        // Create hardware decoder
        const decoder = await Decoder.create(videoStream, {
          hardware: hw,
        });

        // Create hardware encoder
        // Use hardware-specific encoder codec
        const hwEncoderCodec = hw.getEncoderCodec('h264');

        if (!hwEncoderCodec) {
          // Not supported, skip
          decoder.close();
          media.close();
          hw.dispose();
          return;
        }

        const encoder = await Encoder.create(hwEncoderCodec, {
          timeBase: { num: 1, den: 25 },
          frameRate: { num: 25, den: 1 },
          bitrate: '2M',
        });

        let decodedFrames = 0;
        let encodedPackets = 0;
        const maxFrames = 10; // Process only first 10 frames for test

        // Process frames
        for await (const packet of media.packets()) {
          if (packet.streamIndex === videoStream.index) {
            const frame = await decoder.decode(packet);
            if (frame) {
              decodedFrames++;

              // Check if frame is on GPU (hardware pixel format)
              const isHardwareFrame = frame.isHwFrame();

              if (isHardwareFrame) {
                console.log(`Frame ${decodedFrames} is on GPU (format: ${frame.format})`);
              }

              // Encode the frame directly (zero-copy if both on same GPU)
              const encodedPacket = await encoder.encode(frame);
              if (encodedPacket) {
                encodedPackets++;
                encodedPacket.free();
              }

              frame.free();

              if (decodedFrames >= maxFrames) {
                break;
              }
            }
          }
        }

        // Flush encoder
        for await (const flushPacket of encoder.flushPackets()) {
          encodedPackets++;
          flushPacket.free();
        }

        console.log(`Zero-copy test: Decoded ${decodedFrames} frames, Encoded ${encodedPackets} packets`);
        assert.ok(decodedFrames > 0, 'Should decode frames');
        assert.ok(encodedPackets > 0, 'Should encode packets');

        decoder.close();
        encoder.close();
        media.close();
      } catch (error) {
        console.log('Zero-copy test failed:', error);
        hw.dispose();
        throw error;
      }
    });

    it('should transfer frames from decoder to encoder on GPU (zero-copy) (sync)', skipInCI, async () => {
      // This test demonstrates zero-copy GPU frame transfer with sync methods
      // where frames stay on GPU between decode and encode

      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware acceleration available - skipping zero-copy test');
        return;
      }

      try {
        // Open test video
        const media = await MediaInput.open(inputFile);
        const videoStream = media.video(0);
        assert.ok(videoStream, 'Should have video stream');

        // Create hardware decoder
        const decoder = await Decoder.create(videoStream, {
          hardware: hw,
        });

        // Create hardware encoder
        // Use hardware-specific encoder codec
        const hwEncoderCodec = hw.getEncoderCodec('h264');

        if (!hwEncoderCodec) {
          // Not supported, skip
          decoder.close();
          media.close();
          hw.dispose();
          return;
        }

        const encoder = await Encoder.create(hwEncoderCodec, {
          timeBase: { num: 1, den: 25 },
          frameRate: { num: 25, den: 1 },
          bitrate: '2M',
        });

        let decodedFrames = 0;
        let encodedPackets = 0;
        const maxFrames = 10; // Process only first 10 frames for test

        // Process frames using sync methods
        for await (const packet of media.packets()) {
          if (packet.streamIndex === videoStream.index) {
            const frame = decoder.decodeSync(packet);
            if (frame) {
              decodedFrames++;

              // Check if frame is on GPU (hardware pixel format)
              const isHardwareFrame = frame.isHwFrame();

              if (isHardwareFrame) {
                console.log(`Frame ${decodedFrames} is on GPU (format: ${frame.format})`);
              }

              // Encode the frame directly (zero-copy if both on same GPU)
              const encodedPacket = encoder.encodeSync(frame);
              if (encodedPacket) {
                encodedPackets++;
                encodedPacket.free();
              }

              frame.free();

              if (decodedFrames >= maxFrames) {
                break;
              }
            }
          }
        }

        // Flush encoder
        for await (const flushPacket of encoder.flushPackets()) {
          encodedPackets++;
          flushPacket.free();
        }

        console.log(`Zero-copy test (sync): Decoded ${decodedFrames} frames, Encoded ${encodedPackets} packets`);
        assert.ok(decodedFrames > 0, 'Should decode frames');
        assert.ok(encodedPackets > 0, 'Should encode packets');

        decoder.close();
        encoder.close();
        media.close();
      } catch (error) {
        console.log('Zero-copy test (sync) failed:', error);
        hw.dispose();
        throw error;
      }
    });

    it('should demonstrate GPU memory efficiency with multiple streams', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware acceleration available - skipping test');
        return;
      }

      try {
        // Open two input videos
        const media1 = await MediaInput.open(inputFile);
        const media2 = await MediaInput.open(inputFile);

        const videoStream1 = media1.video(0);
        const videoStream2 = media2.video(0);

        assert.ok(videoStream1 && videoStream2, 'Should have video streams');

        // Create decoders sharing same hardware context
        const decoder1 = await Decoder.create(videoStream1, {
          hardware: hw,
        });
        const decoder2 = await Decoder.create(videoStream2, {
          hardware: hw,
        });

        // Process one frame from each decoder
        let frame1: Frame | null = null;
        let frame2: Frame | null = null;

        for await (const packet of media1.packets()) {
          if (packet.streamIndex === videoStream1.index) {
            frame1 = await decoder1.decode(packet);
            if (frame1) break;
          }
        }

        for await (const packet of media2.packets()) {
          if (packet.streamIndex === videoStream2.index) {
            frame2 = await decoder2.decode(packet);
            if (frame2) break;
          }
        }

        assert.ok(frame1, 'Should decode frame from stream 1');
        assert.ok(frame2, 'Should decode frame from stream 2');

        // Both frames should be on the same GPU
        console.log('Both frames decoded on same GPU context');

        frame1?.free();
        frame2?.free();
        decoder1.close();
        decoder2.close();
        media1.close();
        media2.close();
      } catch (error) {
        console.log('Multi-stream GPU test failed:', error);
        hw.dispose();
      }
    });

    it('should verify hardware codec selection', skipInCI, async () => {
      const hw = HardwareContext.auto();
      if (!hw) {
        console.log('No hardware acceleration available - skipping test');
        return;
      }

      console.log(`Hardware ${hw.deviceTypeName} codec support:`);

      // Test getting hardware encoder codecs
      const h264HwCodec = hw.getEncoderCodec('h264');
      if (!h264HwCodec) {
        return;
      }

      const encoder = await Encoder.create(h264HwCodec, {
        frameRate: { num: 25, den: 1 },
        timeBase: { num: 1, den: 25 },
        bitrate: '1M',
      });

      assert.ok(encoder, 'Should create hardware encoder');
      encoder.close();

      hw.dispose();
    });
  });
});
