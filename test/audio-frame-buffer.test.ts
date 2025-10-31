import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AudioFrameBuffer } from '../src/api/audio-frame-buffer.js';
import { AV_CHANNEL_LAYOUT_MONO, AV_CHANNEL_LAYOUT_STEREO } from '../src/constants/channel-layouts.js';
import { AV_SAMPLE_FMT_FLT, AV_SAMPLE_FMT_S16 } from '../src/constants/constants.js';
import { Frame } from '../src/lib/frame.js';

import type { AVSampleFormat } from '../src/constants/constants.js';
import type { ChannelLayout } from '../src/lib/types.js';

// Helper function to create audio frames
function createAudioFrame(nbSamples: number, format: AVSampleFormat, sampleRate: number, channelLayout: ChannelLayout, pts = 0n): Frame {
  const frame = new Frame();
  frame.alloc();
  frame.nbSamples = nbSamples;
  frame.format = format;
  frame.sampleRate = sampleRate;
  frame.channelLayout = channelLayout;
  frame.getBuffer(0);
  frame.pts = pts;
  return frame;
}

describe('AudioFrameBuffer', () => {
  describe('create', () => {
    it('should create buffer with correct parameters', () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);

      assert.strictEqual(buffer.size, 0, 'Initial buffer should be empty');
      assert.strictEqual(buffer.hasFrame(), false, 'Should not have frame initially');
    });

    it('should create buffer for different sample formats', () => {
      using buffer1 = AudioFrameBuffer.create(960, AV_SAMPLE_FMT_S16, 48000, AV_CHANNEL_LAYOUT_STEREO, 2);
      using buffer2 = AudioFrameBuffer.create(1024, AV_SAMPLE_FMT_FLT, 44100, AV_CHANNEL_LAYOUT_MONO, 1);

      assert.strictEqual(buffer1.size, 0);
      assert.strictEqual(buffer2.size, 0);
    });
  });

  describe('push (async)', () => {
    it('should buffer audio frames asynchronously', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);

      assert.strictEqual(buffer.size, 240, 'Buffer should contain 240 samples');
      assert.strictEqual(buffer.hasFrame(), false, 'Should not have complete frame yet');
    });

    it('should accumulate samples from multiple frames', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame1 = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 0n);
      using frame2 = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 240n);

      await buffer.push(frame1);
      assert.strictEqual(buffer.size, 240);
      assert.strictEqual(buffer.hasFrame(), false);

      await buffer.push(frame2);
      assert.strictEqual(buffer.size, 480);
      assert.strictEqual(buffer.hasFrame(), true, 'Should have complete frame now');
    });

    it('should throw error for non-audio frames', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = new Frame(); // Empty frame, not audio

      await assert.rejects(async () => await buffer.push(frame), /requires an audio frame/, 'Should reject non-audio frames');
    });
  });

  describe('pushSync', () => {
    it('should buffer audio frames synchronously', () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      buffer.pushSync(frame);

      assert.strictEqual(buffer.size, 240, 'Buffer should contain 240 samples');
      assert.strictEqual(buffer.hasFrame(), false, 'Should not have complete frame yet');
    });
  });

  describe('pull (async)', () => {
    it('should return null when insufficient samples', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);

      const outputFrame = await buffer.pull();
      assert.strictEqual(outputFrame, null, 'Should return null when insufficient samples');
    });

    it('should return frame with correct size when enough samples available', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(960, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);

      // Should be able to pull 2 frames
      using outputFrame1 = await buffer.pull();
      assert.notStrictEqual(outputFrame1, null);
      assert.strictEqual(outputFrame1!.nbSamples, 480, 'Output frame should have exactly 480 samples');
      assert.strictEqual(outputFrame1!.pts, 0n, 'First frame PTS should be 0');

      using outputFrame2 = await buffer.pull();
      assert.notStrictEqual(outputFrame2, null);
      assert.strictEqual(outputFrame2!.nbSamples, 480);
      assert.strictEqual(outputFrame2!.pts, 480n, 'Second frame PTS should be 480');

      // No more frames available
      const outputFrame3 = await buffer.pull();
      assert.strictEqual(outputFrame3, null);
    });

    it('should maintain PTS continuity', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);

      // Push multiple frames
      for (let i = 0; i < 3; i++) {
        using frame = createAudioFrame(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, BigInt(i * 480));
        await buffer.push(frame);
      }

      // Pull and verify PTS
      using frame1 = await buffer.pull();
      assert.strictEqual(frame1!.pts, 0n);

      using frame2 = await buffer.pull();
      assert.strictEqual(frame2!.pts, 480n);

      using frame3 = await buffer.pull();
      assert.strictEqual(frame3!.pts, 960n);
    });
  });

  describe('pullSync', () => {
    it('should return frame synchronously', () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      buffer.pushSync(frame);

      using outputFrame = buffer.pullSync();
      assert.notStrictEqual(outputFrame, null);
      assert.strictEqual(outputFrame!.nbSamples, 480);
    });
  });

  describe('hasFrame', () => {
    it('should return true when enough samples available', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);

      assert.strictEqual(buffer.hasFrame(), true);
    });

    it('should return false when insufficient samples', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);

      assert.strictEqual(buffer.hasFrame(), false);
    });
  });

  describe('reset', () => {
    it('should clear buffer and reset PTS', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      using frame = createAudioFrame(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);

      await buffer.push(frame);
      assert.strictEqual(buffer.size, 480);
      assert.strictEqual(buffer.hasFrame(), true);

      buffer.reset();

      assert.strictEqual(buffer.size, 0, 'Buffer should be empty after reset');
      assert.strictEqual(buffer.hasFrame(), false, 'Should not have frame after reset');

      // Verify PTS reset by pushing and pulling again
      using frame2 = createAudioFrame(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1000n);
      await buffer.push(frame2);
      using outputFrame = await buffer.pull();
      assert.strictEqual(outputFrame!.pts, 0n, 'PTS should reset to 0');
    });
  });

  describe('size', () => {
    it('should track number of buffered samples', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);

      assert.strictEqual(buffer.size, 0);

      using frame1 = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);
      await buffer.push(frame1);
      assert.strictEqual(buffer.size, 240);

      using frame2 = createAudioFrame(240, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);
      await buffer.push(frame2);
      assert.strictEqual(buffer.size, 480);

      using outputFrame = await buffer.pull();
      assert.notStrictEqual(outputFrame, null);
      assert.strictEqual(buffer.size, 0, 'Buffer should be empty after pulling all samples');
    });
  });

  describe('variable frame sizes', () => {
    it('should handle variable input frame sizes correctly', async () => {
      using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);

      const sizes = [100, 200, 300, 400, 500];

      for (const size of sizes) {
        using frame = createAudioFrame(size, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO);
        await buffer.push(frame);
      }

      // Total: 1500 samples = 3 complete frames (480 each) + 60 remaining
      assert.strictEqual(buffer.size, 1500);

      using frame1 = await buffer.pull();
      assert.notStrictEqual(frame1, null);
      assert.strictEqual(frame1!.nbSamples, 480);

      using frame2 = await buffer.pull();
      assert.notStrictEqual(frame2, null);
      assert.strictEqual(frame2!.nbSamples, 480);

      using frame3 = await buffer.pull();
      assert.notStrictEqual(frame3, null);
      assert.strictEqual(frame3!.nbSamples, 480);

      // Should have 60 samples remaining
      assert.strictEqual(buffer.size, 60);
      assert.strictEqual(buffer.hasFrame(), false);
    });
  });

  describe('disposal', () => {
    it('should properly dispose resources', () => {
      using _buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      // using statement will automatically call Symbol.dispose
    });

    it('should handle manual disposal', () => {
      const buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, AV_CHANNEL_LAYOUT_MONO, 1);
      buffer[Symbol.dispose]();
      // Should not throw
    });
  });
});
