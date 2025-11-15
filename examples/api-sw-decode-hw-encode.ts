/**
 * Software Decode + Hardware Encode Example
 *
 * This example demonstrates:
 * - Software decoding (CPU)
 * - Hardware-accelerated encoding (GPU)
 * - Frame transfer from CPU to GPU memory
 *
 * Use case: When you have complex input formats that need software decoding
 * but want fast hardware encoding (e.g., real-time streaming)
 *
 * Usage: tsx api-sw-decode-hw-encode.ts <input> <output>
 * Example: tsx examples/api-sw-decode-hw-encode.ts testdata/video.mp4 examples/.tmp/api-sw-decode-hw-encode.mp4
 */

import { Decoder, Demuxer, Encoder, FilterAPI, FilterPreset, HardwareContext, Muxer } from '../src/api/index.js';
import { AV_LOG_DEBUG, AV_PIX_FMT_NV12, Log } from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !outputFile) {
  console.log('Usage: tsx api-sw-decode-hw-encode.ts <input> <output>');
  console.log('Example: tsx api-sw-decode-hw-encode.ts input.mp4 output.mp4');
  process.exit(1);
}

prepareTestEnvironment();
Log.setLevel(AV_LOG_DEBUG);

console.log(`Input: ${inputFile}`);
console.log(`Output: ${outputFile}`);

// Check for hardware availability
const hw = HardwareContext.auto();
if (!hw) {
  throw new Error('No hardware acceleration available! This example requires hardware acceleration for encoding.');
}

console.log(`Hardware detected: ${hw.deviceTypeName}`);

// Open input file
await using input = await Demuxer.open(inputFile);
const videoStream = input.video();
const audioStream = input.audio();

if (!videoStream) {
  throw new Error('No video stream found in input file');
}

console.log('Input Information:');
console.log(`Format: ${input.formatLongName}`);
console.log(`Duration: ${input.duration.toFixed(2)} seconds`);
console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
if (audioStream) {
  console.log(`Audio: ${audioStream.codecpar.sampleRate}Hz, ${audioStream.codecpar.channels} channels`);
}

// Create software decoder
console.log('Setting up software decoder...');
using decoder = await Decoder.create(videoStream);

// Create filter to upload frames to hardware
console.log('Setting up hardware upload filter...');
const filterChain = FilterPreset.chain(hw).format(AV_PIX_FMT_NV12).hwupload().build();
using filter = FilterAPI.create(filterChain, {
  framerate: videoStream.avgFrameRate,
  hardware: hw,
});

// Create hardware encoder (GPU)
console.log('Setting up hardware encoder...');

// Select appropriate hardware encoder based on platform
const encoderCodec = hw.getEncoderCodec('h264');
if (!encoderCodec) {
  throw new Error(`Unsupported hardware type: ${hw.deviceTypeName}`);
}

// Hardware encoder needs hardware context (will take from filter)
using encoder = await Encoder.create(encoderCodec, {
  decoder,
  filter,
  bitrate: '4M',
  gopSize: 60,
});

// Create output using Muxer
await using output = await Muxer.open(outputFile);
const outputStreamIndex = output.addStream(encoder);

// Process video
console.log('Processing...');

let frameCount = 0;
let packetCount = 0;
const startTime = Date.now();

for await (using packet of input.packets(videoStream.index)) {
  // Software decode → Hardware upload → Hardware encode
  for await (using frame of decoder.frames(packet)) {
    // Upload to hardware (null passes through to flush filter)
    for await (using hwFrame of filter.frames(frame)) {
      if (hwFrame) frameCount++;

      // Hardware encode (null passes through to flush encoder)
      for await (using encodedPacket of encoder.packets(hwFrame)) {
        await output.writePacket(encodedPacket, outputStreamIndex);
        if (encodedPacket) packetCount++;
      }

      // Progress indicator
      if (frameCount % 30 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const fps = frameCount / elapsed;
        console.log(`Processed ${frameCount} frames @ ${fps.toFixed(1)} fps`);
      }
    }
  }
}

const elapsed = (Date.now() - startTime) / 1000;
const avgFps = frameCount / elapsed;

console.log('Done!');
console.log(`Frames processed: ${frameCount}`);
console.log(`Packets written: ${packetCount}`);
console.log(`Time: ${elapsed.toFixed(2)} seconds`);
console.log(`Average FPS: ${avgFps.toFixed(1)}`);
