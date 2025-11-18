/**
 * High-Level API Example: Whisper Speech Transcription
 *
 * Demonstrates automatic speech recognition using OpenAI's Whisper model.
 * Shows how to transcribe audio files to text with timestamps using the high-level API.
 * Supports GPU acceleration and Voice Activity Detection (VAD) for better segmentation.
 *
 * Usage: tsx examples/api-whisper-transcribe.ts <input> [options]
 * Example: tsx examples/api-whisper-transcribe.ts testdata/audio-speech.mp3
 * Example with VAD: tsx examples/api-whisper-transcribe.ts testdata/audio-speech.mp3 --vad
 * Example with different model: tsx examples/api-whisper-transcribe.ts testdata/audio-speech.mp3 --model tiny
 */

import { AV_LOG_ERROR, Decoder, Demuxer, Log, WhisperTranscriber } from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

// Parse command line arguments
const inputFile = process.argv[2];
const useVAD = process.argv.includes('--vad');
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex > -1 ? process.argv[modelIndex + 1] : 'base.en';

if (!inputFile) {
  console.error('Usage: tsx examples/api-whisper-transcribe.ts <input> [--vad] [--model <model>]');
  console.error('');
  console.error('Available models:');
  console.error('  - tiny, tiny.en');
  console.error('  - base, base.en');
  console.error('  - small, small.en');
  console.error('  - medium, medium.en');
  console.error('  - large-v1, large-v2, large-v3');
  console.error('');
  console.error('Options:');
  console.error('  --vad        Enable Voice Activity Detection for better segmentation');
  console.error('  --model      Whisper model to use (default: base.en)');
  process.exit(1);
}

prepareTestEnvironment();
Log.setLevel(AV_LOG_ERROR);

console.log('='.repeat(80));
console.log('Whisper Speech Transcription Example');
console.log('='.repeat(80));
console.log(`Input file: ${inputFile}`);
console.log(`Model: ${model}`);
console.log(`VAD: ${useVAD ? 'enabled' : 'disabled'}`);
console.log('');

// Open input media
console.log('Opening audio file...');
await using input = await Demuxer.open(inputFile);

// Get audio stream
const audioStream = input.audio(0);
if (!audioStream) {
  throw new Error('No audio stream found in input file');
}

console.log(`Audio: ${audioStream.codecpar.sampleRate}Hz, ${audioStream.codecpar.channels}ch, ${audioStream.codecpar.codecId}`);
console.log('');

// Create decoder
console.log('Creating audio decoder...');
using decoder = await Decoder.create(audioStream);

// Create Whisper transcriber
console.log(`Creating Whisper transcriber (downloading ${model} model if needed)...`);
using transcriber = await WhisperTranscriber.create({
  model: model as any,
  vadModel: useVAD ? 'silero-v5.1.2' : undefined,
  modelDir: './models',
  useGpu: true,
  language: 'en',
  queue: useVAD ? 10 : 3,
});

console.log('Transcriber ready! Processing audio...');
console.log('');
console.log('-'.repeat(80));

// Transcribe audio
let segmentCount = 0;
let totalDuration = 0;

const inputGenerator = input.packets(audioStream.index);
const decoderGenerator = decoder.frames(inputGenerator);

for await (const segment of transcriber.transcribe(decoderGenerator)) {
  segmentCount++;
  totalDuration = segment.end;

  // Format timestamps
  const startTime = formatTimestamp(segment.start);
  const endTime = formatTimestamp(segment.end);
  const duration = formatDuration(segment.end - segment.start);

  // Print segment
  console.log(`[${startTime} --> ${endTime}] (${duration})`);
  console.log(`  ${segment.text}`);

  if (segment.turn) {
    console.log('  --- Speaker turn detected ---');
  }
  console.log('');
}

console.log('-'.repeat(80));
console.log('');
console.log('Transcription complete!');
console.log(`Segments: ${segmentCount}`);
console.log(`Total duration: ${formatTimestamp(totalDuration)}`);

/**
 * Format milliseconds to timestamp (HH:MM:SS.mmm)
 */
function formatTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Format milliseconds to duration (e.g., "1.5s")
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
