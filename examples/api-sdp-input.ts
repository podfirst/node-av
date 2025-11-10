/**
 * SDP Generation Example - High Level API
 *
 * Demonstrates generating SDP (Session Description Protocol) from media inputs.
 * Supports file paths, URLs, and RTSP streams.
 *
 * Usage: tsx examples/api-sdp-input.ts <input> [rtsp_transport]
 * Example: tsx examples/api-sdp-input.ts testdata/video.mp4
 * Example: tsx examples/api-sdp-input.ts rtsp://camera.local/stream tcp
 *
 * Note: For RTSP streams, specify tcp or udp as second argument (default: tcp)
 */

import { Demuxer, FFmpegError, StreamingUtils } from '../src/index.js';

/**
 * Generate SDP from media input
 */
async function generateSdp(inputUrl: string, rtspTransport = 'tcp'): Promise<void> {
  console.log(`Opening input: ${inputUrl}`);
  console.log(`RTSP transport: ${rtspTransport}\n`);

  // Determine if input is RTSP
  const isRtsp = inputUrl.startsWith('rtsp://');

  // Configure options for RTSP streams
  const options = isRtsp
    ? {
        flags: 'low_delay',
        fflags: 'nobuffer',
        rtsp_transport: rtspTransport,
        analyzeduration: 0,
        probesize: 32,
      }
    : {};

  await using input = await Demuxer.open(inputUrl, { options });

  console.log('Generating SDP...\n');
  const sdp = StreamingUtils.createSdp([input.getFormatContext()]);

  console.log('Generated SDP:');
  console.log('='.repeat(60));
  console.log(sdp);
  console.log('='.repeat(60));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: tsx examples/sdp.ts <input> [rtsp_transport]');
    console.log('');
    console.log('Arguments:');
    console.log('  input           - Media file, URL, or RTSP stream');
    console.log('  rtsp_transport  - RTSP transport: tcp or udp (default: tcp)');
    console.log('');
    console.log('Examples:');
    console.log('  tsx examples/sdp.ts input.mp4');
    console.log('  tsx examples/sdp.ts rtsp://camera.local/stream');
    console.log('  tsx examples/sdp.ts rtsp://camera.local/stream udp');
    process.exit(1);
  }

  const [inputUrl, rtspTransport = 'tcp'] = args;

  try {
    await generateSdp(inputUrl, rtspTransport);
    process.exit(0);
  } catch (error) {
    if (error instanceof FFmpegError) {
      console.error(`FFmpeg Error: ${error.message} (code: ${error.code})`);
    } else {
      console.error('Error:', error.message ?? error);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
