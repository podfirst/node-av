/**
 * High-Level API Example: Hardware-Accelerated RTSP Streaming
 *
 * Shows how to capture and transcode RTSP streams with hardware acceleration.
 * Demonstrates real-time video processing with automatic hardware detection.
 *
 * Usage: tsx examples/api-hw-rtsp.ts <rtsp-url> <output>
 *
 * Options:
 *   --duration <n>   Recording duration in seconds (default: 10)
 *   --scale <WxH>    Scale video to WxH (default: 640x360)
 *
 * Examples:
 *   tsx examples/api-hw-rtsp.ts rtsp://camera.local/stream examples/.tmp/api-hw-rtsp-output.mp4
 *   tsx examples/api-hw-rtsp.ts rtsp://admin:pass@192.168.1.100/ch1 output.mp4 --duration 30
 *   tsx examples/api-hw-rtsp.ts rtsp://server/live output.mp4 --scale 1280x720
 */

import {
  AV_LOG_DEBUG,
  AV_SAMPLE_FMT_FLTP,
  Codec,
  Decoder,
  Encoder,
  FF_ENCODER_AAC,
  FF_ENCODER_LIBX265,
  FilterAPI,
  FilterPreset,
  HardwareContext,
  Log,
  MediaInput,
  MediaOutput,
} from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const rtspUrl = args[0];
const outputFile = args[1];

if (!rtspUrl || !outputFile || rtspUrl.startsWith('--') || outputFile.startsWith('--')) {
  console.error('Usage: tsx examples/api-hw-rtsp.ts <rtsp-url> <output> [options]');
  console.error('Options:');
  console.error('  --duration <n>   Recording duration in seconds (default: 10)');
  console.error('  --scale <WxH>    Scale video to WxH (default: 640x360)');
  process.exit(1);
}

// Parse options
const durationIndex = args.indexOf('--duration');
const duration = durationIndex !== -1 ? parseInt(args[durationIndex + 1]) : 10;

const scaleIndex = args.indexOf('--scale');
let scaleWidth = 640;
let scaleHeight = 360;
if (scaleIndex !== -1) {
  const [w, h] = args[scaleIndex + 1].split('x');
  scaleWidth = parseInt(w);
  scaleHeight = parseInt(h);
}

let stop = false;

prepareTestEnvironment();
Log.setLevel(AV_LOG_DEBUG);

console.log(`Input: ${rtspUrl}`);
console.log(`Output: ${outputFile}`);
console.log(`Duration: ${duration} seconds`);
console.log(`Scale to: ${scaleWidth}x${scaleHeight}`);

// Open RTSP stream
console.log('Connecting to RTSP stream...');
await using input = await MediaInput.open(rtspUrl, {
  options: {
    rtsp_transport: 'tcp',
  },
});

// Get streams
const videoStream = input.video();
if (!videoStream) {
  throw new Error('No video stream found in RTSP source');
}

const audioStream = input.audio();
if (!audioStream) {
  console.warn('No audio stream found, processing video only');
}

// Display input information
console.log('Input Information:');
console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
console.log(`Codec: ${videoStream.codecpar.codecId}`);
console.log(`Format: ${videoStream.codecpar.format}`);
console.log(`Time base: ${videoStream.timeBase.num}/${videoStream.timeBase.den}`);
console.log(`Frame rate: ${videoStream.avgFrameRate.num}/${videoStream.avgFrameRate.den}`);
if (audioStream) {
  console.log(`Audio: ${audioStream.codecpar.sampleRate}Hz, ${audioStream.codecpar.channels} channels`);
  console.log(`Audio codec: ${audioStream.codecpar.codecId}`);
}

// Auto-detect hardware
console.log('Detecting hardware acceleration...');
using hardware = HardwareContext.auto();
if (hardware) {
  console.log(`Using hardware: ${hardware.deviceTypeName}`);
} else {
  console.log('No hardware acceleration available, using software');
}

// Create decoder
console.log('Creating video decoder...');
using videoDecoder = await Decoder.create(videoStream, {
  hardware,
});

// Create filter
const filterChain = FilterPreset.chain(hardware).scale(scaleWidth, scaleHeight).custom('setpts=N/FRAME_RATE/TB').build();
console.log(`Creating video filter: ${filterChain}`);
using videoFilter = FilterAPI.create(filterChain, {
  framerate: videoStream.avgFrameRate,
  hardware,
});

// Create encoder
const encoderCodec = hardware?.getEncoderCodec('hevc') ?? Codec.findEncoderByName(FF_ENCODER_LIBX265);
if (!encoderCodec) {
  throw new Error('No suitable encoder found');
}

console.log(`Creating video encoder: ${encoderCodec.name}...`);
using videoEncoder = await Encoder.create(encoderCodec, {
  decoder: videoDecoder,
  filter: videoFilter,
  bitrate: '2M',
  gopSize: 60,
});

// Create output
console.log('Creating output file...');
await using output = await MediaOutput.open(outputFile, {
  input,
});

// Add video stream
const videoOutputIndex = output.addStream(videoStream, { encoder: videoEncoder });

// Add audio stream if available (direct copy)
let audioOutputIndex = -1;

let audioDecoder: Decoder | null = null;
let audioFilter: FilterAPI | null = null;
let audioEncoder: Encoder | null = null;

if (audioStream) {
  console.log('Creating audio decoder...');
  audioDecoder = await Decoder.create(audioStream);

  const filterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_FLTP, 44100, 'stereo').build();
  console.log('Creating audio filter:', filterChain);
  audioFilter = FilterAPI.create(filterChain);

  console.log('Creating audio encoder:', FF_ENCODER_AAC);
  audioEncoder = await Encoder.create(FF_ENCODER_AAC, {
    decoder: audioDecoder,
    filter: audioFilter,
  });

  audioOutputIndex = output.addStream(audioStream, { encoder: audioEncoder });
}

// Set up timeout for recording duration
const timeout = setTimeout(() => {
  console.log(`Recording duration reached (${duration}s), stopping...`);
  stop = true;
}, duration * 1000);

// Process streams
console.log('Recording started...');
const startTime = Date.now();
let videoPackets = 0;
let audioPackets = 0;

try {
  // Process video and audio in parallel
  const processVideo = async () => {
    // Create video processing pipeline
    const videoInputGenerator = input.packets(videoStream.index);
    const videoDecoderGenerator = videoDecoder.frames(videoInputGenerator);
    const videoFilterGenerator = videoFilter.frames(videoDecoderGenerator);
    const videoEncoderGenerator = videoEncoder.packets(videoFilterGenerator);

    for await (const packet of videoEncoderGenerator) {
      if (stop) break;
      await output.writePacket(packet, videoOutputIndex);
      videoPackets++;
    }
  };

  const processAudio = async () => {
    if (!audioStream || audioOutputIndex === -1 || !audioDecoder || !audioEncoder || !audioFilter) {
      return;
    }

    const audioInputGenerator = input.packets(audioStream.index);
    const audioDecoderGenerator = audioDecoder.frames(audioInputGenerator);
    const audioFilterGenerator = audioFilter.frames(audioDecoderGenerator);
    const audioEncoderGenerator = audioEncoder.packets(audioFilterGenerator);

    for await (const packet of audioEncoderGenerator) {
      if (stop) break;
      await output.writePacket(packet, audioOutputIndex);
      audioPackets++;
    }
  };

  // Run both in parallel
  await Promise.all([processVideo(), processAudio()]);
} finally {
  clearTimeout(timeout);
}

const elapsed = (Date.now() - startTime) / 1000;

console.log('Recording complete!');
console.log(`Duration: ${elapsed.toFixed(2)} seconds`);
console.log(`Video packets: ${videoPackets}`);
if (audioPackets > 0) {
  console.log(`Audio packets: ${audioPackets}`);
}
console.log(`Output file: ${outputFile}`);
if (hardware) {
  console.log(`Hardware used: ${hardware.deviceTypeName}`);
}
