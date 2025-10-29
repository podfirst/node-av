#!/usr/bin/env tsx
/**
 * Example: RTP/SRTP Input with MediaInput
 *
 * Demonstrates how to receive RTP packets (with optional SRTP encryption)
 * and decode them using MediaInput.openRTP() and StreamingUtils.
 */

import { StreamingUtils } from '../src/api/index.js';
import { AV_CODEC_ID_H264, AV_CODEC_ID_OPUS, AV_CODEC_ID_PCM_ALAW } from '../src/constants/constants.js';

function exampleSRTPInput() {
  console.log('=== SRTP Input Example ===\n');

  // Simulate SRTP keys (normally from HomeKit or WebRTC signaling)
  const srtpKey = Buffer.alloc(16, 0x12); // 16 bytes master key
  const srtpSalt = Buffer.alloc(14, 0x34); // 14 bytes salt

  // 1. Generate SDP for Opus @ 16kHz with SRTP encryption
  const sdp = StreamingUtils.createRTPInputSDP(
    [
      {
        port: 5004,
        codecId: AV_CODEC_ID_OPUS,
        payloadType: 111,
        clockRate: 16000,
        channels: 1,
        fmtp: 'minptime=10;useinbandfec=1',
        srtp: {
          key: srtpKey,
          salt: srtpSalt,
        },
      },
    ],
    'Test SRTP Stream',
  );

  console.log('Generated SDP:');
  console.log(sdp);
}

function examplePlainRTP() {
  console.log('\n=== Plain RTP Input Example (no encryption) ===\n');

  // 1. Generate SDP for PCMA @ 8kHz (plain RTP, no SRTP)
  const sdp = StreamingUtils.createRTPInputSDP(
    [
      {
        port: 6000,
        codecId: AV_CODEC_ID_PCM_ALAW,
        payloadType: 8,
        clockRate: 8000,
        channels: 1,
      },
    ],
    'Test RTP Stream',
  );

  console.log('Generated SDP:');
  console.log(sdp);
}

function multiSDPInpuit() {
  console.log('\n=== Multi-Stream RTP Example (Video + Audio) ===\n');

  // Generate SDP for Video (H.264) + Audio (Opus)
  const sdp = StreamingUtils.createRTPInputSDP(
    [
      // Stream 0: Video
      {
        port: 5006,
        codecId: AV_CODEC_ID_H264,
        payloadType: 96,
        clockRate: 90000,
      },
      // Stream 1: Audio
      {
        port: 5004,
        codecId: AV_CODEC_ID_OPUS,
        payloadType: 111,
        clockRate: 48000,
        channels: 2,
      },
    ],
    'Video+Audio Stream',
  );

  console.log('Generated Multi-Stream SDP:');
  console.log(sdp);
}

// Run examples
exampleSRTPInput();
examplePlainRTP();
multiSDPInpuit();
