/**
 * Test Hardware Codec Support
 *
 * Tests hardware support for various codecs: H.264, H.265, VP8, VP9, AV1, MJPEG
 *
 * Usage:
 *   tsx examples/api-hw-codecs.ts
 */

import { AV_CODEC_ID_AV1, AV_CODEC_ID_H264, AV_CODEC_ID_HEVC, AV_CODEC_ID_MJPEG, AV_CODEC_ID_VP8, AV_CODEC_ID_VP9, HardwareContext } from '../src/index.js';

console.log('Testing Hardware Codec Support\n');

using hardware = HardwareContext.auto();

if (!hardware) {
  console.log('No hardware acceleration available');
  process.exit(0);
}

console.log(`Hardware detected: ${hardware.deviceTypeName}\n`);

const codecs = [
  { name: 'H.264', id: AV_CODEC_ID_H264 },
  { name: 'H.265/HEVC', id: AV_CODEC_ID_HEVC },
  { name: 'VP8', id: AV_CODEC_ID_VP8 },
  { name: 'VP9', id: AV_CODEC_ID_VP9 },
  { name: 'AV1', id: AV_CODEC_ID_AV1 },
  { name: 'MJPEG', id: AV_CODEC_ID_MJPEG },
];

console.log('Testing Decoder Support:');
console.log('========================');
for (const codec of codecs) {
  const supported = hardware.testDecoder(codec.id);
  console.log(`${codec.name.padEnd(15)} ${supported ? '✓ Supported' : '✗ Not supported'}`);
}

console.log('\nTesting Encoder Support:');
console.log('========================');
for (const codec of codecs) {
  const encoderCodec = hardware.getEncoderCodec(codec.id, true);
  if (encoderCodec) {
    console.log(`${codec.name.padEnd(15)} ✓ Encoder: ${encoderCodec.name}`);
  } else {
    console.log(`${codec.name.padEnd(15)} ✗ No encoder available`);
  }
}
