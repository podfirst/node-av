import { readFile } from 'fs/promises';
import { ok, strictEqual, throws } from 'node:assert';
import { before, describe, it } from 'node:test';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { FrameUtils } from '../src/lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('FrameUtils', async () => {
  let testImage: Buffer;
  const inputWidth = 320;
  const inputHeight = 180;

  before(async () => {
    testImage = await readFile(resolve(__dirname, '../testdata/input.nv12'));
  });

  await describe('constructor', async () => {
    await it('should create instance with valid dimensions', () => {
      const processor = new FrameUtils(320, 180);
      ok(processor);
      processor.close();
    });

    await it('should throw on invalid dimensions', () => {
      throws(() => new FrameUtils(0, 180), /Failed to allocate frame buffer/);
      throws(() => new FrameUtils(320, 0), /Failed to allocate frame buffer/);
      throws(() => new FrameUtils(-1, 180), /Failed to allocate frame buffer/);
    });

    await it('should implement Disposable pattern', () => {
      using processor = new FrameUtils(320, 180);
      ok(processor);
    });
  });

  await describe('process', async () => {
    await it('should process image without options (passthrough)', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage);
      ok(Buffer.isBuffer(output));
      // NV12 size = width * height * 1.5
      strictEqual(output.length, inputWidth * inputHeight * 1.5);
    });

    await it('should resize image', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        resize: { width: 640, height: 360 },
      });
      ok(Buffer.isBuffer(output));
      // Resized NV12 size
      strictEqual(output.length, 640 * 360 * 1.5);
    });

    await it('should convert format to RGB', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        format: { to: 'rgb' },
      });
      ok(Buffer.isBuffer(output));
      // RGB size = width * height * 3
      strictEqual(output.length, inputWidth * inputHeight * 3);
    });

    await it('should convert format to RGBA', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        format: { to: 'rgba' },
      });
      ok(Buffer.isBuffer(output));
      // RGBA size = width * height * 4
      strictEqual(output.length, inputWidth * inputHeight * 4);
    });

    await it('should convert format to grayscale', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        format: { to: 'gray' },
      });
      ok(Buffer.isBuffer(output));
      // Gray size = width * height
      strictEqual(output.length, inputWidth * inputHeight);
    });

    await it('should crop image', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        crop: {
          left: 10,
          top: 10,
          width: 100,
          height: 100,
        },
      });
      ok(Buffer.isBuffer(output));
      // Cropped NV12 size
      strictEqual(output.length, 100 * 100 * 1.5);
    });

    await it('should crop and resize', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        crop: {
          left: 10,
          top: 10,
          width: 100,
          height: 100,
        },
        resize: {
          width: 200,
          height: 200,
        },
      });
      ok(Buffer.isBuffer(output));
      // Resized NV12 size
      strictEqual(output.length, 200 * 200 * 1.5);
    });

    await it('should crop, resize and convert format', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);
      const output = processor.process(testImage, {
        crop: {
          left: 0,
          top: 0,
          width: 160,
          height: 90,
        },
        resize: {
          width: 320,
          height: 180,
        },
        format: { to: 'rgba' },
      });
      ok(Buffer.isBuffer(output));
      // RGBA size
      strictEqual(output.length, 320 * 180 * 4);
    });

    await it('should throw on invalid crop parameters', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      // Crop exceeds image bounds
      throws(
        () =>
          processor.process(testImage, {
            crop: {
              left: 250,
              top: 0,
              width: 100,
              height: 100,
            },
          }),
        /Invalid crop parameters/,
      );

      // Negative values
      throws(
        () =>
          processor.process(testImage, {
            crop: {
              left: -10,
              top: 0,
              width: 100,
              height: 100,
            },
          }),
        /Invalid crop parameters/,
      );

      // Zero dimensions
      throws(
        () =>
          processor.process(testImage, {
            crop: {
              left: 0,
              top: 0,
              width: 0,
              height: 100,
            },
          }),
        /Invalid crop parameters/,
      );
    });

    await it('should handle edge crop cases', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      // Full image crop
      const fullCrop = processor.process(testImage, {
        crop: {
          left: 0,
          top: 0,
          width: inputWidth,
          height: inputHeight,
        },
      });
      ok(Buffer.isBuffer(fullCrop));
      strictEqual(fullCrop.length, inputWidth * inputHeight * 1.5);

      // 1x1 crop
      const tinyCrop = processor.process(testImage, {
        crop: {
          left: 0,
          top: 0,
          width: 1,
          height: 1,
        },
      });
      ok(Buffer.isBuffer(tinyCrop));
      // NV12 1x1 still has UV plane (FFmpeg returns 3 bytes: 1 Y + 2 UV)
      strictEqual(tinyCrop.length, 3);

      // Bottom-right corner crop
      const cornerCrop = processor.process(testImage, {
        crop: {
          left: inputWidth - 10,
          top: inputHeight - 10,
          width: 10,
          height: 10,
        },
      });
      ok(Buffer.isBuffer(cornerCrop));
      strictEqual(cornerCrop.length, 10 * 10 * 1.5);
    });

    await it('should handle different format combinations', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      const formats = ['rgb', 'rgba', 'gray', 'nv12', 'yuv420p'] as const;

      for (const format of formats) {
        const output = processor.process(testImage, {
          format: { to: format },
        });
        ok(Buffer.isBuffer(output));

        let expectedSize: number;
        switch (format) {
          case 'rgb':
            expectedSize = inputWidth * inputHeight * 3;
            break;
          case 'rgba':
            expectedSize = inputWidth * inputHeight * 4;
            break;
          case 'gray':
            expectedSize = inputWidth * inputHeight;
            break;
          case 'nv12':
          case 'yuv420p':
            expectedSize = inputWidth * inputHeight * 1.5;
            break;
        }

        strictEqual(output.length, expectedSize, `Format ${format} size mismatch`);
      }
    });

    await it('should reuse internal resources (performance)', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      // Process multiple times with same configuration
      const options = {
        resize: { width: 640, height: 360 },
        format: { to: 'rgba' as const },
      };

      const results: Buffer[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        results.push(processor.process(testImage, options));
      }

      // All results should have same size
      const expectedSize = 640 * 360 * 4;
      for (const result of results) {
        strictEqual(result.length, expectedSize);
      }
    });

    await it('should handle rapid configuration changes', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      // Different configurations in sequence
      const configs = [
        { resize: { width: 640, height: 360 } },
        { format: { to: 'rgb' as const } },
        { crop: { left: 10, top: 10, width: 100, height: 100 } },
        { resize: { width: 1920, height: 1080 }, format: { to: 'rgba' as const } },
      ];

      for (const config of configs) {
        const output = processor.process(testImage, config);
        ok(Buffer.isBuffer(output));
      }
    });

    await it('should throw after close', () => {
      const processor = new FrameUtils(inputWidth, inputHeight);
      processor.close();

      throws(() => processor.process(testImage), /FrameUtils instance has been disposed/);
    });

    await it('should handle multiple close calls', () => {
      const processor = new FrameUtils(inputWidth, inputHeight);
      processor.close();
      processor.close(); // Should not throw
      processor[Symbol.dispose](); // Should not throw
    });
  });

  await describe('performance', async () => {
    await it('should process frames quickly', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        processor.process(testImage, {
          resize: { width: 640, height: 360 },
          format: { to: 'rgba' },
        });
      }

      const time = performance.now() - start;
      const avg = time / iterations;

      // Should be very fast (< 5ms per frame on average)
      ok(avg < 5, `Average processing time ${avg.toFixed(3)}ms is too slow`);
    });

    await it('should handle memory efficiently', () => {
      using processor = new FrameUtils(inputWidth, inputHeight);

      // Process many frames to test for memory leaks
      const iterations = 1000;
      const memBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        const output = processor.process(testImage, {
          resize: { width: 640, height: 360 },
        });
        // Ensure output is valid
        ok(output.length > 0);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = (memAfter - memBefore) / 1024 / 1024; // MB

      // Memory increase should be minimal (< 50MB for 1000 iterations)
      ok(memIncrease < 50, `Memory increased by ${memIncrease.toFixed(2)}MB`);
    });
  });

  await describe('edge cases', async () => {
    await it('should handle incorrect buffer size', () => {
      using processor = new FrameUtils(320, 180);
      const wrongSizeBuffer = Buffer.alloc(100); // Too small

      // Should not crash, native code should handle gracefully
      try {
        const output = processor.process(wrongSizeBuffer);
        ok(Buffer.isBuffer(output));
      } catch (e: any) {
        // May throw, which is acceptable
        ok(e.message);
      }
    });

    await it('should handle very large dimensions', () => {
      // 4K resolution
      using processor = new FrameUtils(3840, 2160);

      // Create a dummy buffer (just for testing initialization)
      const size = 3840 * 2160 * 1.5;
      const largeBuffer = Buffer.alloc(size);

      const output = processor.process(largeBuffer, {
        resize: { width: 1920, height: 1080 },
      });

      ok(Buffer.isBuffer(output));
      strictEqual(output.length, 1920 * 1080 * 1.5);
    });

    await it('should handle odd dimensions', () => {
      // Odd dimensions can be tricky with YUV formats
      using processor = new FrameUtils(321, 181);

      const size = 321 * 181 * 1.5;
      const buffer = Buffer.alloc(Math.ceil(size));

      const output = processor.process(buffer, {
        format: { to: 'rgb' },
      });

      ok(Buffer.isBuffer(output));
      strictEqual(output.length, 321 * 181 * 3);
    });
  });
});
