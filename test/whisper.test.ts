import assert from 'node:assert';
import { describe, it } from 'node:test';

import { Decoder } from '../src/api/decoder.js';
import { Demuxer } from '../src/api/demuxer.js';
import { WhisperTranscriber } from '../src/api/whisper.js';
import { AV_SAMPLE_FMT_S16 } from '../src/index.js';
import { getInputFile, isCI, prepareTestEnvironment, skipInCI } from './index.js';

prepareTestEnvironment();

const audioFile = getInputFile('audio-speech.wav');

describe('WhisperTranscriber', () => {
  describe('model download', () => {
    it('should download model if not present', async () => {
      console.log('Downloading model test...');

      // This will download the model if it doesn't exist
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created after model download');
    });

    it('should download VAD model if specified', async () => {
      console.log('Downloading VAD model test...');

      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        vadModel: 'silero-v5.1.2',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created after VAD model download');
    });
  });

  describe('create', () => {
    it('should create transcriber with basic options', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created');
    });

    it('should create transcriber with VAD enabled', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        vadModel: 'silero-v5.1.2',
        modelDir: './models',
        language: 'en',
        queue: 3,
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created');
    });

    it('should create transcriber with GPU enabled', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        gpuDevice: 0,
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created');
    });

    it('should create transcriber with custom queue size', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        queue: 5,
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created');
    });
  });

  describe('configuration options', () => {
    it('should accept auto language detection', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'auto',
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created with auto language');
    });

    it('should accept different VAD parameters', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        vadModel: 'silero-v5.1.2',
        modelDir: './models',
        vadThreshold: 0.6,
        vadMinSpeechDuration: 0.2,
        vadMinSilenceDuration: 0.6,
        useGpu: isCI() ? false : true,
      });

      assert.ok(transcriber, 'Transcriber should be created with custom VAD params');
    });

    it('should accept GPU device selection', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        useGpu: isCI() ? false : true,
        gpuDevice: 0,
      });

      assert.ok(transcriber, 'Transcriber should be created with GPU device');
    });
  });

  describe('transcribe', skipInCI, () => {
    it('should transcribe audio from file', async () => {
      await using input = await Demuxer.open({
        type: 'audio',
        input: audioFile,
        sampleRate: 48000,
        sampleFormat: AV_SAMPLE_FMT_S16,
        channels: 1,
      });

      const audioStream = input.audio();
      assert.ok(audioStream, 'Audio stream should exist');

      using decoder = await Decoder.create(audioStream);
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      const segments: {
        start: number;
        end: number;
        text: string;
      }[] = [];

      const inputGenerator = input.packets(audioStream.index);
      const decoderGenerator = decoder.frames(inputGenerator);

      for await (const segment of transcriber.transcribe(decoderGenerator)) {
        assert.ok(segment, 'Segment should exist');
        assert.ok(typeof segment.start === 'number', 'Start time should be a number');
        assert.ok(typeof segment.end === 'number', 'End time should be a number');
        assert.ok(typeof segment.text === 'string', 'Text should be a string');
        assert.ok(segment.start >= 0, 'Start time should be non-negative');
        assert.ok(segment.end >= segment.start, 'End time should be >= start time');

        segments.push(segment);

        // Limit to first 3 segments for testing
        if (segments.length >= 3) {
          break;
        }
      }

      assert.ok(segments.length > 0, 'Should transcribe at least one segment');
    });

    it('should transcribe with VAD enabled', async () => {
      await using input = await Demuxer.open({
        type: 'audio',
        input: audioFile,
        sampleRate: 48000,
        sampleFormat: AV_SAMPLE_FMT_S16,
        channels: 1,
      });

      const audioStream = input.audio();
      assert.ok(audioStream, 'Audio stream should exist');

      using decoder = await Decoder.create(audioStream);
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        vadModel: 'silero-v5.1.2',
        modelDir: './models',
        language: 'en',
        queue: 3,
        vadThreshold: 0.5,
        useGpu: isCI() ? false : true,
      });

      const segments: {
        start: number;
        end: number;
        text: string;
        turn?: boolean;
      }[] = [];

      const inputGenerator = input.packets(audioStream.index);
      const decoderGenerator = decoder.frames(inputGenerator);

      for await (const segment of transcriber.transcribe(decoderGenerator)) {
        assert.ok(segment, 'Segment should exist');
        assert.ok(typeof segment.start === 'number', 'Start time should be a number');
        assert.ok(typeof segment.end === 'number', 'End time should be a number');
        assert.ok(typeof segment.text === 'string', 'Text should be a string');

        // VAD might add turn field
        if (segment.turn !== undefined) {
          assert.ok(typeof segment.turn === 'boolean', 'Turn should be a boolean');
        }

        segments.push(segment);

        // Limit to first 3 segments for testing
        if (segments.length >= 3) {
          break;
        }
      }

      assert.ok(segments.length > 0, 'Should transcribe at least one segment');
    });

    it('should handle empty audio stream', async () => {
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      const segments: any[] = [];

      // Create empty generator
      async function* emptyGenerator() {
        // Yield nothing
      }

      for await (const segment of transcriber.transcribe(emptyGenerator())) {
        segments.push(segment);
      }

      assert.equal(segments.length, 0, 'Should produce no segments for empty input');
    });

    it('should produce segments with sequential timestamps', async () => {
      await using input = await Demuxer.open({
        type: 'audio',
        input: audioFile,
        sampleRate: 48000,
        sampleFormat: AV_SAMPLE_FMT_S16,
        channels: 1,
      });

      const audioStream = input.audio();
      assert.ok(audioStream, 'Audio stream should exist');

      using decoder = await Decoder.create(audioStream);
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      const segments: {
        start: number;
        end: number;
        text: string;
      }[] = [];

      const inputGenerator = input.packets(audioStream.index);
      const decoderGenerator = decoder.frames(inputGenerator);

      for await (const segment of transcriber.transcribe(decoderGenerator)) {
        segments.push(segment);

        // Limit to first 3 segments for testing
        if (segments.length >= 3) {
          break;
        }
      }

      // Check that timestamps are sequential and non-overlapping
      for (let i = 1; i < segments.length; i++) {
        const prev = segments[i - 1];
        const curr = segments[i];

        assert.ok(curr.start >= prev.start, `Segment ${i} start time (${curr.start}) should be >= previous start (${prev.start})`);
      }
    });

    it('should produce non-empty text segments', async () => {
      await using input = await Demuxer.open({
        type: 'audio',
        input: audioFile,
        sampleRate: 48000,
        sampleFormat: AV_SAMPLE_FMT_S16,
        channels: 1,
      });

      const audioStream = input.audio();
      assert.ok(audioStream, 'Audio stream should exist');

      using decoder = await Decoder.create(audioStream);
      using transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      const inputGenerator = input.packets(audioStream.index);
      const decoderGenerator = decoder.frames(inputGenerator);

      let segmentCount = 0;

      for await (const segment of transcriber.transcribe(decoderGenerator)) {
        assert.ok(segment.text.trim().length > 0, 'Segment text should not be empty');
        segmentCount++;

        // Limit to first 5 segments for testing
        if (segmentCount >= 5) {
          break;
        }
      }

      assert.ok(segmentCount > 0, 'Should produce at least one segment');
    });
  });

  describe('close', () => {
    it('should close transcriber properly', async () => {
      const transcriber = await WhisperTranscriber.create({
        model: 'tiny.en',
        modelDir: './models',
        language: 'en',
        useGpu: isCI() ? false : true,
      });

      transcriber.close();

      // Closing again should not throw
      transcriber.close();
    });

    it('should cleanup with using statement', async () => {
      {
        using transcriber = await WhisperTranscriber.create({
          model: 'tiny.en',
          modelDir: './models',
          language: 'en',
          useGpu: isCI() ? false : true,
        });

        assert.ok(transcriber, 'Transcriber should be created');
      }
      // Transcriber should be automatically closed
    });
  });
});
