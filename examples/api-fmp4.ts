/**
 * High-Level API Example: Fragmented MP4 (fMP4) Streaming
 *
 * Shows how to create fMP4 streams from RTSP/file sources for WebSocket/HTTP streaming.
 * Demonstrates MP4 box parsing, codec negotiation, and hardware-accelerated transcoding.
 * Perfect for building adaptive streaming servers with MSE (Media Source Extensions).
 *
 * Usage: tsx examples/api-fmp4.ts <input> [options]
 *
 * Options:
 *   --duration <n>       Recording duration in seconds (default: 10)
 *   --codecs <list>      Comma-separated supported codec list (default: h264,h265,aac)
 *   --frag <n>           Fragment duration in microseconds (default: 1000000 = 1s)
 *   --buffer <n>         I/O buffer size in bytes (default: undefined)
 *   --box-mode           Enable box mode to receive complete MP4 boxes (default: true)
 *   --chunk-mode         Enable chunk mode to receive raw FFmpeg chunks
 *   --hw                 Enable hardware acceleration (auto-detect)
 *
 * Examples:
 *   tsx examples/api-fmp4.ts rtsp://camera.local/stream
 *   tsx examples/api-fmp4.ts rtsp://admin:pass@192.168.1.100/ch1 --duration 30 --hw
 *   tsx examples/api-fmp4.ts testdata/video.mp4 --codecs h264,aac --frag 2000000
 *   tsx examples/api-fmp4.ts rtsp://server/live --chunk-mode --buffer 8192
 */

import { AV_HWDEVICE_TYPE_NONE, FMP4_CODECS, FMP4Stream } from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

import type { FMP4Data } from '../src/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const inputUrl = args[0];

if (!inputUrl || inputUrl.startsWith('--')) {
  console.error('Usage: tsx examples/api-fmp4.ts <input> [options]');
  console.error('Options:');
  console.error('  --duration <n>       Recording duration in seconds (default: 10)');
  console.error('  --codecs <list>      Comma-separated supported codec list (default: h264,h265,aac)');
  console.error('  --frag <n>           Fragment duration in microseconds (default: 1000000 = 1s)');
  console.error('  --buffer <n>         I/O buffer size in bytes (default: 4096)');
  console.error('  --box-mode           Enable box mode to receive complete MP4 boxes (default: true)');
  console.error('  --chunk-mode         Enable chunk mode to receive raw FFmpeg chunks');
  console.error('  --hw                 Enable hardware acceleration (auto-detect)');
  process.exit(1);
}

// Parse options
const durationIndex = args.indexOf('--duration');
const duration = durationIndex !== -1 ? parseInt(args[durationIndex + 1]) : 10;

const codecsIndex = args.indexOf('--codecs');
const codecsList = codecsIndex !== -1 ? args[codecsIndex + 1] : 'h264,h265,aac';

const fragIndex = args.indexOf('--frag');
const fragDuration = fragIndex !== -1 ? parseInt(args[fragIndex + 1]) : 1000000;

const bufferIndex = args.indexOf('--buffer');
const bufferSize = bufferIndex !== -1 ? parseInt(args[bufferIndex + 1]) : undefined;

const chunkMode = args.includes('--chunk-mode');
const boxMode = !chunkMode || args.includes('--box-mode'); // Default to box mode

const useHardware = args.includes('--hw');

// Map codec names to FMP4_CODECS
const codecMap: Record<string, string> = {
  h264: FMP4_CODECS.H264,
  h265: FMP4_CODECS.H265,
  hevc: FMP4_CODECS.H265,
  av1: FMP4_CODECS.AV1,
  aac: FMP4_CODECS.AAC,
  flac: FMP4_CODECS.FLAC,
  opus: FMP4_CODECS.OPUS,
};

const supportedCodecs = codecsList
  .split(',')
  .map((c) => codecMap[c.trim().toLowerCase()])
  .filter(Boolean)
  .join(',');

prepareTestEnvironment();

console.log('='.repeat(60));
console.log('fMP4 Streaming Example');
console.log('='.repeat(60));
console.log(`Input: ${inputUrl}`);
console.log(`Duration: ${duration} seconds`);
console.log(`Supported codecs: ${supportedCodecs}`);
console.log(`Fragment duration: ${fragDuration} µs (${fragDuration / 1000000}s)`);
console.log(`Buffer size: ${bufferSize} bytes`);
console.log(`Mode: ${boxMode ? 'Box Mode (complete boxes)' : 'Chunk Mode (raw chunks)'}`);
console.log(`Hardware acceleration: ${useHardware ? 'Enabled (auto-detect)' : 'Disabled'}`);
console.log('='.repeat(60));

let stop = false;
let boxCount = 0;
let chunkCount = 0;
let ftypReceived = false;
let moovReceived = false;

console.log('\nCreating fMP4 stream...');

const onData = (data: Buffer, info: FMP4Data) => {
  if (stop) return;

  if (info.isComplete) {
    // Box mode: data contains complete boxes
    boxCount += info.boxes.length;

    for (const box of info.boxes) {
      // Track initialization segments
      if (box.type === 'ftyp' && !ftypReceived) {
        ftypReceived = true;
        console.log(`\n✓ Initialization Segment (${box.type}) received (${box.size} bytes)`);
        console.log(`Codec string for client: ${stream.getCodecString()}`);
      }
      if (box.type === 'moov' && !moovReceived) {
        moovReceived = true;
        console.log(`✓ Media metadata (${box.type}) received (${box.size} bytes)`);
      }

      // Log fragment info
      if (box.type === 'moof') {
        const mdat = info.boxes.find((b) => b.type === 'mdat');
        if (mdat) {
          const fragmentSize = box.size + mdat.size;
          console.log(`Fragment #${Math.floor(boxCount / 2)}: moof (${box.size}b) + mdat (${mdat.size}b) = ${fragmentSize} bytes`);
        } else {
          console.log(`Fragment #${Math.floor(boxCount / 2)}: moof (${box.size} bytes) - mdat pending...`);
        }
      } else if (box.type === 'mdat' && !info.boxes.some((b) => b.type === 'moof')) {
        // mdat without moof in same callback (was buffered separately)
        console.log(`  → mdat completed (${box.size} bytes)`);
      }
    }
  } else {
    // Chunk mode: data contains raw chunks
    chunkCount++;
    console.log(`Received chunk #${chunkCount} of size ${data.length} bytes`);
  }
};

const stream = FMP4Stream.create(inputUrl, {
  supportedCodecs,
  fragDuration,
  hardware: useHardware ? 'auto' : { deviceType: AV_HWDEVICE_TYPE_NONE },
  boxMode,
  bufferSize,
  onData: onData,
});

console.log('\nStarting stream...');
console.log('Press Ctrl+C to stop\n');

// Start streaming (returns immediately)
await stream.start();

// Wait for duration or SIGINT
await new Promise<void>((resolve) => {
  // Set up timeout for recording duration
  const timeout = setTimeout(async () => {
    console.log(`\nDuration reached (${duration}s), stopping...`);
    stop = true;
    await stream.stop();
    resolve();
  }, duration * 1000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, stopping...');
    stop = true;
    clearTimeout(timeout);
    await stream.stop();
    resolve();
  });
});
