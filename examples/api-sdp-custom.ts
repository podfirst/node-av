#!/usr/bin/env tsx
/**
 * Example: Native FFmpeg SDP Generation for RTP/SRTP Input
 *
 * Demonstrates using FFmpeg's native SDP generator for RFC-compliant codec names
 */

import { StreamingUtils } from '../src/api/index.js';
import { AV_CODEC_ID_H264, AV_CODEC_ID_OPUS, AV_CODEC_ID_PCM_ALAW } from '../src/constants/constants.js';

console.log('=== Native FFmpeg SDP Generation Examples ===\n');

// Example 1: Single Opus audio stream with SRTP
console.log('1. Single Opus Audio Stream with SRTP Encryption:');
console.log('='.repeat(60));

const srtpKey = Buffer.alloc(16, 0x12);
const srtpSalt = Buffer.alloc(14, 0x34);

const sdp1 = StreamingUtils.createInputSDP([
  {
    port: 5004,
    codecId: AV_CODEC_ID_OPUS,
    payloadType: 111,
    clockRate: 48000,
    channels: 2,
    srtp: {
      key: srtpKey,
      salt: srtpSalt,
    },
  },
]);

console.log(sdp1);
console.log('');

// Example 2: Multi-stream (H.264 video + Opus audio)
console.log('2. Multi-Stream (H.264 Video + Opus Audio):');
console.log('='.repeat(60));

const sdp2 = StreamingUtils.createInputSDP(
  [
    {
      port: 5006,
      codecId: AV_CODEC_ID_H264,
      payloadType: 96,
      clockRate: 90000,
    },
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

console.log(sdp2);
console.log('');

// Example 3: Plain RTP (no encryption) with PCMA
console.log('3. Plain RTP - PCMA Audio (No Encryption):');
console.log('='.repeat(60));

const sdp3 = StreamingUtils.createInputSDP([
  {
    port: 6000,
    codecId: AV_CODEC_ID_PCM_ALAW,
    payloadType: 8,
    clockRate: 8000,
    channels: 1,
  },
]);

console.log(sdp3);
console.log('');

// Example 4: Custom fmtp parameters
console.log('4. Custom fmtp Parameters:');
console.log('='.repeat(60));

const sdp4 = StreamingUtils.createInputSDP(
  [
    {
      port: 5004,
      codecId: AV_CODEC_ID_OPUS,
      payloadType: 111,
      clockRate: 16000,
      channels: 1,
      fmtp: 'minptime=10;useinbandfec=1',
    },
  ],
  'Opus with Custom fmtp',
);

console.log(sdp4);
console.log('');

console.log('✅ All examples completed!');
console.log('Note: Codec names (H264, opus, PCMA) come directly from FFmpeg!');
