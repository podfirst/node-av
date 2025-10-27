/**
 * RTSP Stream Info Example - Low Level API
 *
 * Demonstrates retrieving detailed RTSP stream information including:
 * - Transport type (TCP/UDP)
 * - Stream direction (recvonly/sendonly/sendrecv)
 * - Codec information (ID, MIME type, payload type)
 * - Audio properties (sample rate, channels)
 * - Backchannel/talkback stream detection
 *
 * Usage: tsx examples/rtsp-stream-info.ts <rtsp_url> [rtsp_transport]
 * Example: tsx examples/rtsp-stream-info.ts rtsp://camera.local/stream
 */

import { Dictionary, FFmpegError, FormatContext, StreamingUtils } from '../src/index.js';

/**
 * Get and display RTSP stream information
 */
async function getRTSPStreamInfo(rtspUrl: string, rtspTransport = 'tcp'): Promise<void> {
  console.log('Opening RTSP stream...');
  console.log(`URL: ${rtspUrl}`);
  console.log(`Transport: ${rtspTransport}\n`);

  const ctx = new FormatContext();

  try {
    const options = {
      flags: 'low_delay',
      fflags: 'nobuffer',
      rtsp_transport: rtspTransport,
      analyzeduration: 0,
      probesize: 32,
    };

    const dict = Dictionary.fromObject(options);

    // Open RTSP stream
    let ret = await ctx.openInput(rtspUrl, null, dict);
    FFmpegError.throwIfError(ret, 'Failed to open RTSP stream');

    // Generate and display SDP
    const sdp = StreamingUtils.createSdp([ctx]);
    console.log('Generated SDP:');
    console.log('─'.repeat(60));
    console.log(sdp);
    console.log('─'.repeat(60));

    ret = await ctx.findStreamInfo();
    FFmpegError.throwIfError(ret, 'Failed to find stream info');

    console.log('\n✓ RTSP stream opened successfully\n');

    // Get RTSP stream information
    console.log('RTSP Stream Information:');
    console.log('='.repeat(60));

    const rtspStreams = ctx.getRTSPStreamInfo();

    if (!rtspStreams || rtspStreams.length === 0) {
      console.log('No RTSP stream information available');
      console.log('Note: This only works with RTSP input contexts');
      return;
    }

    console.log(`Found ${rtspStreams.length} stream(s):\n`);

    for (const stream of rtspStreams) {
      console.log(`Stream ${stream.streamIndex}:`);
      console.log(`  Control URL: ${stream.controlUrl}`);
      console.log(`  Transport: ${stream.transport}`);
      console.log(`  Direction: ${stream.direction}`);
      console.log(`  Payload Type: ${stream.payloadType}`);
      console.log(`  Codec ID: ${stream.codecId}`);
      console.log(`  MIME Type: ${stream.mimeType}`);

      // Audio-specific fields
      if (stream.sampleRate !== undefined && stream.channels !== undefined) {
        console.log(`  Sample Rate: ${stream.sampleRate} Hz`);
        console.log(`  Channels: ${stream.channels}`);
      }

      // Identify sendonly stream (backchannel)
      if (stream.direction === 'sendonly') {
        console.log('  → BACKCHANNEL (sendonly) - for talkback audio ←');
      }
      console.log('');
    }

    // Summary: Find and highlight backchannel stream
    const backchannelStream = rtspStreams.find((s) => s.direction === 'sendonly');

    if (backchannelStream) {
      console.log('='.repeat(60));
      console.log('✓ Backchannel Stream Detected');
      console.log('='.repeat(60));
      console.log(`Stream Index: ${backchannelStream.streamIndex}`);
      console.log(`Transport: ${backchannelStream.transport}`);
      console.log(`Codec: ${backchannelStream.mimeType}`);
      console.log(`Payload Type: ${backchannelStream.payloadType}`);
      if (backchannelStream.sampleRate) {
        console.log(`Audio Format: ${backchannelStream.sampleRate}Hz, ${backchannelStream.channels} channel(s)`);
      }
    } else {
      console.log('='.repeat(60));
      console.log('ℹ No backchannel stream found');
      console.log('='.repeat(60));
      console.log('This stream does not support talkback/backchannel audio.');
    }

    // Close
    await ctx.closeInput();
    console.log('\n✓ Closed RTSP connection');
  } catch (error) {
    throw new Error(`Failed to get RTSP stream info: ${error.message}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: tsx examples/rtsp-stream-info.ts <rtsp_url> [rtsp_transport]');
    console.log('');
    console.log('Arguments:');
    console.log('  rtsp_url        - RTSP stream URL');
    console.log('  rtsp_transport  - RTSP transport: tcp or udp (default: tcp)');
    console.log('');
    console.log('Examples:');
    console.log('  tsx examples/rtsp-stream-info.ts rtsp://camera.local/stream');
    console.log('  tsx examples/rtsp-stream-info.ts rtsp://camera.local/stream?backchannel=1');
    console.log('  tsx examples/rtsp-stream-info.ts rtsp://camera.local/stream udp');
    console.log('');
    console.log('Note: For cameras with backchannel/talkback support, add ?backchannel=1');
    process.exit(1);
  }

  const [rtspUrl, rtspTransport = 'tcp'] = args;

  // Validate RTSP URL
  if (!rtspUrl.startsWith('rtsp://')) {
    console.error('Error: URL must start with rtsp://');
    process.exit(1);
  }

  try {
    await getRTSPStreamInfo(rtspUrl, rtspTransport);
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    if (error instanceof FFmpegError) {
      console.error(`FFmpeg Error: ${error.message} (code: ${error.code})`);
    } else {
      console.error('Error:', error.message ?? error);
    }
    console.error('='.repeat(60));
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
