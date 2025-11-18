/**
 * High-Level API Example: Generate Subtitles from Video/Audio
 *
 * Demonstrates how to generate SRT subtitle files from video or audio using Whisper.
 * Shows how to transcribe media and export the results in SubRip (SRT) format.
 *
 * Usage: tsx examples/api-whisper-subtitles.ts <input> <output.srt> [options]
 * Example: tsx examples/api-whisper-subtitles.ts testdata/audio-speech.mp3 examples/.tmp/output.srt
 * Example with VAD: tsx examples/api-whisper-subtitles.ts testdata/audio-speech.mp3 examples/.tmp/output.srt --vad
 */

import { writeFile } from 'fs/promises';
import { AV_LOG_ERROR, Decoder, Demuxer, Log, WhisperTranscriber, type WhisperSegment } from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

// Parse command line arguments
const inputFile = process.argv[2];
const outputFile = process.argv[3];
const useVAD = process.argv.includes('--vad');
const modelIndex = process.argv.indexOf('--model');
const model = modelIndex > -1 ? process.argv[modelIndex + 1] : 'base.en';

if (!inputFile || !outputFile) {
  console.error('Usage: tsx examples/api-whisper-subtitles.ts <input> <output.srt> [--vad] [--model <model>]');
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
console.log('Whisper Subtitle Generation Example');
console.log('='.repeat(80));
console.log(`Input: ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log(`Model: ${model}`);
console.log(`VAD: ${useVAD ? 'enabled' : 'disabled'}`);
console.log('');

// Open input media
console.log('Opening media file...');
await using input = await Demuxer.open(inputFile);

// Get audio stream (works with both audio files and video files)
const audioStream = input.audio(0);
if (!audioStream) {
  throw new Error('No audio stream found in input file');
}

// Show media info
if (input.video(0)) {
  const videoStream = input.video(0)!;
  console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}, ${videoStream.codecpar.codecId}`);
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

console.log('Transcribing audio...');
console.log('');

// Collect all segments
const segments: WhisperSegment[] = [];

const inputGenerator = input.packets(audioStream.index);
const decoderGenerator = decoder.frames(inputGenerator);

for await (const segment of transcriber.transcribe(decoderGenerator)) {
  segments.push(segment);

  // Show progress
  const timestamp = formatTimestamp(segment.end);
  process.stdout.write(`\rProcessing: ${timestamp} (${segments.length} segments)`);
}

console.log(''); // New line after progress
console.log('');
console.log(`Transcribed ${segments.length} segments`);

// Generate SRT file
console.log(`Generating SRT file: ${outputFile}`);
const srtContent = generateSRT(segments);
await writeFile(outputFile, srtContent, 'utf-8');

console.log('Done!');
console.log(`Subtitle file saved: ${outputFile}`);
console.log('');

// Show preview of first few segments
console.log('Preview (first 3 segments):');
console.log('-'.repeat(80));
const preview = srtContent.split('\n\n').slice(0, 3).join('\n\n');
console.log(preview);
console.log('-'.repeat(80));

/**
 * Generate SRT (SubRip) subtitle file content from Whisper segments
 */
function generateSRT(segments: WhisperSegment[]): string {
  return segments
    .map((segment, index) => {
      const sequenceNumber = index + 1;
      const startTime = formatSRTTimestamp(segment.start);
      const endTime = formatSRTTimestamp(segment.end);
      const text = segment.text.trim();

      return `${sequenceNumber}\n${startTime} --> ${endTime}\n${text}`;
    })
    .join('\n\n');
}

/**
 * Format milliseconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatSRTTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

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
