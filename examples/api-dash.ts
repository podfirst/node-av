/**
 * High-Level API Example: DASH Streaming
 *
 * Shows how to create MPEG-DASH streams from RTSP/file sources.
 * Demonstrates fragmented MP4 output with configurable segment duration.
 *
 * Usage: tsx examples/api-dash.ts <input> <output-dir> [options]
 *
 * Options:
 *   --duration <n>       Recording duration in seconds (default: 10)
 *   --segment <n>        DASH segment duration in seconds (default: 2)
 *   --window-size <n>    DASH window size (default: 10)
 *   --bitrate <rate>     Video bitrate (default: 5M)
 *   --preset <preset>    Encoder preset (default: ultrafast)
 *
 * Examples:
 *   tsx examples/api-dash.ts testdata/video.mp4 examples/.tmp/dash --bitrate 2M --segment 4
 *   tsx examples/api-dash.ts rtsp://camera.local/stream examples/.tmp/dash
 *   tsx examples/api-dash.ts rtsp://admin:pass@192.168.1.100/ch1 examples/.tmp/dash --duration 30
 *   tsx examples/api-dash.ts rtsp://server/live examples/.tmp/dash --preset medium --window-size 20
 */

import fs from 'fs/promises';

import {
  AV_PIX_FMT_YUV420P,
  avGetCodecStringDash,
  avGetMimeTypeDash,
  Decoder,
  Encoder,
  FF_ENCODER_LIBX265,
  FilterAPI,
  FilterPreset,
  MediaInput,
  MediaOutput,
} from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const inputUrl = args[0];
const outputDir = args[1];

if (!inputUrl || !outputDir || inputUrl.startsWith('--') || outputDir.startsWith('--')) {
  console.error('Usage: tsx examples/api-dash.ts <input> <output-dir> [options]');
  console.error('Options:');
  console.error('  --duration <n>       Recording duration in seconds (default: 10)');
  console.error('  --segment <n>        DASH segment duration in seconds (default: 2)');
  console.error('  --window-size <n>    DASH window size (default: 10)');
  console.error('  --bitrate <rate>     Video bitrate (default: 5M)');
  console.error('  --preset <preset>    Encoder preset (default: ultrafast)');
  process.exit(1);
}

// Parse options
const durationIndex = args.indexOf('--duration');
const duration = durationIndex !== -1 ? parseInt(args[durationIndex + 1]) : 10;

const segmentIndex = args.indexOf('--segment');
const segmentDuration = segmentIndex !== -1 ? parseInt(args[segmentIndex + 1]) : 2;

const windowSizeIndex = args.indexOf('--window-size');
const windowSize = windowSizeIndex !== -1 ? parseInt(args[windowSizeIndex + 1]) : 10;

const bitrateIndex = args.indexOf('--bitrate');
const bitrate = bitrateIndex !== -1 ? args[bitrateIndex + 1] : '5M';

const presetIndex = args.indexOf('--preset');
const preset = presetIndex !== -1 ? args[presetIndex + 1] : 'ultrafast';

let stop = false;

prepareTestEnvironment();

console.log(`Input: ${inputUrl}`);
console.log(`Output Directory: ${outputDir}`);
console.log(`Duration: ${duration} seconds`);
console.log(`Segment Duration: ${segmentDuration} seconds`);
console.log(`Window Size: ${windowSize}`);
console.log(`Bitrate: ${bitrate}`);
console.log(`Encoder Preset: ${preset}`);

// Prepare output directory
const dashManifestPath = `${outputDir}/manifest.mpd`;
console.log('Preparing output directory...');
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

// Detect if input is RTSP
const isRtsp = inputUrl.toLowerCase().startsWith('rtsp://');

// Open input
console.log(isRtsp ? 'Connecting to RTSP stream...' : 'Opening input file...');
await using input = await MediaInput.open(inputUrl, {
  options: isRtsp ? { rtsp_transport: 'tcp' } : undefined,
});

// Get video stream
const videoStream = input.video();
if (!videoStream) {
  throw new Error('No video stream found in input');
}

// Display input information
console.log('\nInput Information:');
console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
console.log(`Codec: ${videoStream.codecpar.codecId}`);
console.log(`Format: ${videoStream.codecpar.format}`);
console.log(`Time base: ${videoStream.timeBase.num}/${videoStream.timeBase.den}`);
console.log(`Frame rate: ${videoStream.avgFrameRate.num}/${videoStream.avgFrameRate.den}`);

// Create decoder
console.log('\nCreating video decoder...');
using decoder = await Decoder.create(videoStream);

// Create filter (ensure YUV420P for DASH compatibility)
const filterChain = FilterPreset.chain().format(AV_PIX_FMT_YUV420P).build();
console.log(`\nCreating filter: ${filterChain}`);
using filter = FilterAPI.create(filterChain, {
  frameRate: videoStream.avgFrameRate,
  timeBase: videoStream.timeBase,
});

// Create encoder
console.log('\nCreating H.265 encoder...');
using encoder = await Encoder.create(FF_ENCODER_LIBX265, {
  frameRate: videoStream.avgFrameRate,
  timeBase: videoStream.timeBase,
  bitrate,
  options: {
    preset,
    tune: isRtsp ? 'zerolatency' : undefined,
  },
});

// Create DASH output
console.log('\nCreating DASH output...');
await using dashOutput = await MediaOutput.open(dashManifestPath, {
  options: {
    movflags: 'frag_keyframe+empty_moov+default_base_moof',
    seg_duration: segmentDuration,
    window_size: windowSize,
    extra_window_size: Math.floor(windowSize / 2),
  },
});

// Add video stream
const dashVideoStreamIndex = dashOutput.addStream(encoder);

console.log('\nDASH Configuration:');
console.log(`Segment Duration: ${segmentDuration}s`);
console.log(`Window Size: ${windowSize} segments`);
console.log(`Manifest: ${dashManifestPath}`);

// Set up timeout for recording duration
const timeout = setTimeout(() => {
  console.log(`\nRecording duration reached (${duration}s), stopping...`);
  stop = true;
}, duration * 1000);

// Process streams
console.log('\nStreaming started...');
const startTime = Date.now();
let packetsWritten = 0;
let framesProcessed = 0;

try {
  // Create processing pipeline
  const videoInputGenerator = input.packets(videoStream.index);
  const videoDecoderGenerator = decoder.frames(videoInputGenerator);
  const videoFilterGenerator = filter.frames(videoDecoderGenerator);
  const videoEncoderGenerator = encoder.packets(videoFilterGenerator);

  // Process video
  for await (const packet of videoEncoderGenerator) {
    if (stop) break;

    await dashOutput.writePacket(packet, dashVideoStreamIndex);
    packetsWritten++;
    framesProcessed++;

    // After first packet, output stream codecpar is initialized
    if (packetsWritten === 1) {
      const outputStream = dashOutput.video();
      if (outputStream) {
        console.log('Output Stream Info:');
        console.log(`  Codec ID: ${outputStream.codecpar.codecId}`);
        console.log(`  Codec Tag: ${outputStream.codecpar.codecTag}`);
        console.log(`  Extradata size: ${outputStream.codecpar.extradata?.length ?? 0}`);
        console.log(`  Framerate: ${outputStream.codecpar.frameRate?.num}/${outputStream.codecpar.frameRate?.den}`);

        // Use MediaOutput methods for codec strings and MIME type
        const mimeType = avGetMimeTypeDash(outputStream.codecpar);
        const codecString = avGetCodecStringDash(outputStream.codecpar); // Auto-detects DASH

        console.log(`Output Codec String: ${mimeType}; codecs="${codecString}"`);
      }
    }

    // Progress indicator
    if (packetsWritten % 30 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const fps = framesProcessed / elapsed;
      console.log(`Streaming: ${elapsed.toFixed(1)}s - Frames: ${framesProcessed} (${fps.toFixed(1)} fps)`);
    }
  }
} finally {
  clearTimeout(timeout);
}

const elapsed = (Date.now() - startTime) / 1000;

console.log('\nStreaming complete!');
console.log(`Duration: ${elapsed.toFixed(2)} seconds`);
console.log(`Frames processed: ${framesProcessed}`);
console.log(`Average FPS: ${(framesProcessed / elapsed).toFixed(2)}`);
console.log(`Packets written: ${packetsWritten}`);
console.log(`DASH manifest: ${dashManifestPath}`);
console.log(`\nTo play: ffplay ${dashManifestPath}`);
