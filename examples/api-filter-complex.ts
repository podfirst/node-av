/**
 * High-Level API Example: FilterComplexAPI
 *
 * Demonstrates the FilterComplexAPI for multi-input/output filtering operations.
 * Shows various filter_complex use cases including:
 * - Simple scaling
 * - Video overlay (picture-in-picture)
 * - Multiple outputs (adaptive bitrate streaming)
 * - Filter chains (effects)
 * - Logo/watermark overlay
 *
 * Usage: tsx examples/api-filter-complex.ts <input> <output-dir>
 * Example: tsx examples/api-filter-complex.ts testdata/demux.mp4 examples/.tmp/filter-complex
 */

import { readFile } from 'fs/promises';
import sharp from 'sharp';

import { AV_PIX_FMT_RGBA, Decoder, Demuxer, Encoder, EOF, FF_ENCODER_LIBX264, FFmpegError, FilterComplexAPI, Frame, Muxer, Rational } from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

prepareTestEnvironment();

const inputFile = process.argv[2];
const outputDir = process.argv[3];

if (!inputFile || !outputDir) {
  console.error('Usage: tsx examples/api-filter-complex.ts <input> <output-dir>');
  process.exit(1);
}

/**
 * Example 1: Simple filtering - Scale video to different size
 */
async function simpleScale() {
  console.log('\n=== Example 1: Simple Scale ===');

  await using input = await Demuxer.open(inputFile);
  await using output = await Muxer.open(`${outputDir}/1-scale.mp4`);

  const videoStream = input.video();
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  console.log(`Input: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);

  // Create decoder
  using decoder = await Decoder.create(videoStream);
  const streamIndex = videoStream.index;

  // Create filter complex with scale
  using complex = FilterComplexAPI.create('[0:v]scale=640:480,format=yuv420p[out]', {
    inputs: [{ label: '0:v' }],
    outputs: [{ label: 'out' }],
  });

  // Create encoder - it will get width/height/format from first frame
  using encoder = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder,
    filter: complex,
    bitrate: '1M',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  const outputStreamIndex = output.addStream(encoder);

  // Process frames using frames() API
  let frameCount = 0;
  for await (using frame of complex.frames('out', {
    '0:v': decoder.frames(input.packets(streamIndex)),
  })) {
    for await (using packet of encoder.packets(frame)) {
      await output.writePacket(packet, outputStreamIndex);
    }
    if (frame) frameCount++;
  }

  console.log(`Processed ${frameCount} frames, output: 640x480`);
}

/**
 * Example 2: Multiple inputs - Overlay two videos
 */
async function overlayVideos() {
  console.log('\n=== Example 2: Overlay Two Videos ===');

  await using input1 = await Demuxer.open(inputFile);
  await using input2 = await Demuxer.open(inputFile);
  await using output = await Muxer.open(`${outputDir}/2-overlay.mp4`);

  const stream1 = input1.video();
  const stream2 = input2.video();
  if (!stream1 || !stream2) {
    throw new Error('No video streams found');
  }

  // Create decoders
  using decoder1 = await Decoder.create(stream1);
  using decoder2 = await Decoder.create(stream2);
  const streamIndex1 = stream1.index;
  const streamIndex2 = stream2.index;

  // Overlay: scale second video to 320x240 and overlay at position (10, 10)
  // Add format filter to ensure compatible pixel format for encoder
  using complex = FilterComplexAPI.create('[1:v]scale=320:240[scaled];[0:v][scaled]overlay=x=10:y=10,format=yuv420p[out]', {
    inputs: [{ label: '0:v' }, { label: '1:v' }],
    outputs: [{ label: 'out' }],
  });

  // Create encoder - it will get width/height/format from first frame
  using encoder = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder: decoder1,
    filter: complex,
    bitrate: '2M',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  const outputStreamIndex = output.addStream(encoder);

  // Process frames using frames() API
  let frameCount = 0;
  for await (using frame of complex.frames('out', {
    '0:v': decoder1.frames(input1.packets(streamIndex1)),
    '1:v': decoder2.frames(input2.packets(streamIndex2)),
  })) {
    for await (using packet of encoder.packets(frame)) {
      await output.writePacket(packet, outputStreamIndex);
    }
    if (frame) frameCount++;
  }

  console.log(`Processed ${frameCount} frames with overlay`);
}

/**
 * Example 3: Multiple outputs - Split video for different encodings
 */
async function splitOutputs() {
  console.log('\n=== Example 3: Split to Multiple Outputs ===');

  await using input = await Demuxer.open(inputFile);
  await using outputHD = await Muxer.open(`${outputDir}/3-split-hd.mp4`);
  await using outputSD = await Muxer.open(`${outputDir}/3-split-sd.mp4`);

  const videoStream = input.video();
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  // Create decoder
  using decoder = await Decoder.create(videoStream);
  const streamIndex = videoStream.index;

  // Split and scale to different resolutions
  using complex = FilterComplexAPI.create('[0:v]split=2[a][b];[a]scale=1280:720,format=yuv420p[hd];[b]scale=640:480,format=yuv420p[sd]', {
    inputs: [{ label: '0:v' }],
    outputs: [{ label: 'hd' }, { label: 'sd' }],
  });

  // Create encoders - they will get width/height/format from first frame
  using encoderHD = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder,
    filter: complex,
    bitrate: '2M',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  using encoderSD = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder,
    filter: complex,
    bitrate: '500k',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  const streamIndexHD = outputHD.addStream(encoderHD);
  const streamIndexSD = outputSD.addStream(encoderSD);

  // Process both outputs - need manual process/receive for parallel outputs
  let hdCount = 0;
  let sdCount = 0;

  for await (using packet of input.packets(streamIndex)) {
    for await (using frame of decoder.frames(packet)) {
      // Send frame to input
      if (!frame) {
        await complex.flush('0:v');
      } else {
        await complex.process('0:v', frame);
      }

      // Receive from both outputs
      while (true) {
        using hdFrame = await complex.receive('hd');
        if (hdFrame && hdFrame !== EOF) {
          for await (using packet of encoderHD.packets(hdFrame)) {
            await outputHD.writePacket(packet, streamIndexHD);
          }
          hdCount++;
        } else {
          break;
        }
      }

      while (true) {
        using sdFrame = await complex.receive('sd');
        if (sdFrame && sdFrame !== EOF) {
          for await (using packet of encoderSD.packets(sdFrame)) {
            await outputSD.writePacket(packet, streamIndexSD);
          }
          sdCount++;
        } else {
          break;
        }
      }
    }
  }

  // Flush encoders (filter already flushed when decoder returned null)
  for await (using packet of encoderHD.packets(null)) {
    await outputHD.writePacket(packet, streamIndexHD);
  }

  for await (using packet of encoderSD.packets(null)) {
    await outputSD.writePacket(packet, streamIndexSD);
  }

  console.log(`HD: ${hdCount} frames (1280x720), SD: ${sdCount} frames (640x480)`);
}

/**
 * Example 4: Complex filter graph - Apply different effects
 */
async function complexEffects() {
  console.log('\n=== Example 4: Complex Filter Effects ===');

  await using input = await Demuxer.open(inputFile);
  await using output = await Muxer.open(`${outputDir}/4-effects.mp4`);

  const videoStream = input.video();
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  // Create decoder
  using decoder = await Decoder.create(videoStream);
  const streamIndex = videoStream.index;

  // Apply multiple effects in sequence
  using complex = FilterComplexAPI.create('[0:v]scale=640:480,hflip,negate,format=yuv420p[out]', {
    inputs: [{ label: '0:v' }],
    outputs: [{ label: 'out' }],
  });

  // Create encoder - it will get width/height/format from first frame
  using encoder = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder,
    filter: complex,
    bitrate: '1M',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  const outputStreamIndex = output.addStream(encoder);

  // Process frames using frames() API
  let frameCount = 0;
  for await (using frame of complex.frames('out', {
    '0:v': decoder.frames(input.packets(streamIndex)),
  })) {
    for await (using packet of encoder.packets(frame)) {
      await output.writePacket(packet, outputStreamIndex);
    }
    if (frame) frameCount++;
  }

  console.log(`Processed ${frameCount} frames with effects (scale + hflip + negate)`);
}

/**
 * Example 5: Logo overlay - Add watermark/logo to video
 *
 * Demonstrates how to overlay a static image (logo/watermark) onto a video.
 * Shows manual frame creation using Frame.fromBuffer() with sharp for image loading.
 * The logo is positioned at the bottom-right corner with 10px padding.
 * This is useful for branding, watermarking, or adding channel logos.
 */
async function logoOverlay() {
  console.log('\n=== Example 5: Logo Overlay (Watermark) ===');

  const logoFile = 'testdata/logo.png';

  await using videoInput = await Demuxer.open(inputFile);
  await using output = await Muxer.open(`${outputDir}/5-logo-overlay.mp4`);

  const videoStream = videoInput.video();
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);

  // Create video decoder
  using videoDecoder = await Decoder.create(videoStream);
  const videoStreamIndex = videoStream.index;

  // Load logo image using sharp and create frame manually
  // This demonstrates Frame.fromBuffer() for manual frame creation
  const logoImageBuffer = await readFile(logoFile);
  const logoMetadata = await sharp(logoImageBuffer).metadata();
  const logoWidth = logoMetadata.width;
  const logoHeight = logoMetadata.height;

  console.log(`Logo: ${logoWidth}x${logoHeight}`);

  // Convert PNG to raw RGBA buffer
  const logoRawBuffer = await sharp(logoImageBuffer)
    .ensureAlpha() // Ensure alpha channel
    .raw()
    .toBuffer();

  // Create frame manually and populate with buffer data
  using logoFrame = new Frame();
  logoFrame.alloc();
  logoFrame.width = logoWidth;
  logoFrame.height = logoHeight;
  logoFrame.format = AV_PIX_FMT_RGBA;
  logoFrame.timeBase = new Rational(1, 30);
  logoFrame.getBuffer();

  // Copy raw pixel data into frame
  const ret = logoFrame.fromBuffer(logoRawBuffer);
  FFmpegError.throwIfError(ret, 'Failed to create logo frame from buffer');

  console.log(`Created logo frame from buffer (${logoWidth}x${logoHeight} RGBA)`);

  // Scale logo to reasonable size (64px width, maintaining aspect ratio)
  // Then overlay at bottom-right corner with 10px padding
  // W = main video width, w = overlay width
  // H = main video height, h = overlay height
  //
  // Filter chain:
  // 1. Scale logo: [1:v]scale=64:-1[logo]
  // 2. Overlay: [0:v][logo]overlay=x=W-w-10:y=H-h-10

  // Position options (after logo is scaled):
  // - Top-left:     overlay=x=10:y=10
  // - Top-right:    overlay=x=W-w-10:y=10
  // - Bottom-left:  overlay=x=10:y=H-h-10
  // - Bottom-right: overlay=x=W-w-10:y=H-h-10
  // - Center:       overlay=x=(W-w)/2:y=(H-h)/2
  using complex = FilterComplexAPI.create('[1:v]scale=64:-1[logo];[0:v][logo]overlay=x=W-w-10:y=H-h-10,format=yuv420p[out]', {
    inputs: [{ label: '0:v' }, { label: '1:v' }],
    outputs: [{ label: 'out' }],
  });

  // Create encoder
  using encoder = await Encoder.create(FF_ENCODER_LIBX264, {
    decoder: videoDecoder,
    filter: complex,
    bitrate: '2M',
    maxBFrames: 0,
    options: { preset: 'ultrafast' },
  });

  const outputStreamIndex = output.addStream(encoder);

  // Process frames using frames() API
  // For logo overlay, we use a single frame for input 1 (logo) which will be reused
  let frameCount = 0;
  for await (using frame of complex.frames('out', {
    '0:v': videoDecoder.frames(videoInput.packets(videoStreamIndex)),
    '1:v': logoFrame, // Single frame - will be used for all video frames
  })) {
    for await (using packet of encoder.packets(frame)) {
      await output.writePacket(packet, outputStreamIndex);
    }
    if (frame) frameCount++;
  }

  // Free logo frame
  logoFrame.free();

  console.log(`Processed ${frameCount} frames with logo overlay (bottom-right)`);
}

console.log('FilterComplexAPI Examples');
console.log('Input:', inputFile);
console.log('Output Directory:', outputDir);

// Run examples
await simpleScale();
await overlayVideos();
await splitOutputs();
await complexEffects();
await logoOverlay();

console.log('\n✓ All examples completed successfully!');
