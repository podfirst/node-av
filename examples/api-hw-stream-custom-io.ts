/**
 * High-Level API Example: Hardware-Accelerated Streaming with Custom IO
 *
 * Shows how to capture and transcode streams with hardware acceleration.
 * Demonstrates real-time video processing with automatic hardware detection.
 * Includes a Custom IO for receiving and processing RTP packets.
 *
 * Usage: tsx examples/api-hw-stream-custom-io.ts <path> [options]
 *
 * Options:
 *   --max-duration   <n>     Max duration in seconds (default: 10)
 *   --iter-type      <type>  Type of iterator to use: 1 for scheduler, 2 for generator, 3 for full async/await, 4 for simple (default: 4)
 *
 * Examples:
 *   tsx examples/api-hw-stream-custom-io.ts testdata/video.mp4 --max-duration 20 --iter-type 1
 *   tsx examples/api-hw-stream-custom-io.ts /path/to/file.mp4 --max-duration 30
 */

import { RtpPacket } from 'werift';

import {
  AV_SAMPLE_FMT_FLTP,
  Codec,
  Decoder,
  Demuxer,
  Encoder,
  FF_ENCODER_AAC,
  FF_ENCODER_LIBX265,
  FilterAPI,
  FilterPreset,
  HardwareContext,
  Muxer,
} from '../src/index.js';
import { prepareTestEnvironment } from './index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath || filePath.startsWith('--')) {
  console.error('Usage: tsx examples/api-hw-stream-custom-io.ts <path> [options]');
  console.error('Options:');
  console.error('  --max-duration <n>  Max duration in seconds (default: 10)');
  console.error('  --iter-type <type>  Type of iterator to use: 1 for scheduler, 4 for simple (default: 4)');
  process.exit(1);
}

// Parse options
const maxDurationIndex = args.indexOf('--max-duration');
const maxDuration = maxDurationIndex !== -1 ? parseInt(args[maxDurationIndex + 1]) : 10;

const iterTypeIndex = args.indexOf('--iter-type');
const iterType = iterTypeIndex !== -1 ? parseInt(args[iterTypeIndex + 1]) : 4;

let stop = false;

prepareTestEnvironment();

console.log(`Input: ${filePath}`);
console.log(`Max Duration: ${maxDuration} seconds`);

const isRtsp = filePath.startsWith('rtsp://') || filePath.startsWith('rtsps://');

// Open RTSP stream
console.log('Connecting to RTSP stream...');
await using input = await Demuxer.open(filePath, {
  options: {
    rtsp_transport: isRtsp ? 'tcp' : undefined,
    flags: 'nodelay',
    fflags: 'nobuffer',
    analyzeduration: 0,
    probesize: 32,
    timeout: 5000000,
  },
});

// Get streams
const videoStream = input.video();
if (!videoStream) {
  throw new Error('No video stream found in file source');
}

const audioStream = input.audio();
if (!audioStream) {
  throw new Error('No audio stream found in file source');
}

// Display input information
console.log('Input Information:');
console.log(`Video: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
console.log(`Codec: ${videoStream.codecpar.codecId}`);
console.log(`Format: ${videoStream.codecpar.format}`);
console.log(`Time base: ${videoStream.timeBase.num}/${videoStream.timeBase.den}`);
console.log(`Frame rate: ${videoStream.avgFrameRate.num}/${videoStream.avgFrameRate.den}`);

console.log(`Audio: ${audioStream.codecpar.sampleRate}Hz, ${audioStream.codecpar.channels} channels`);
console.log(`Audio codec: ${audioStream.codecpar.codecId}`);

// Auto-detect hardware
console.log('Detecting hardware acceleration...');
using hardware = HardwareContext.auto();
if (hardware) {
  console.log(`Using hardware: ${hardware.deviceTypeName}`);
} else {
  console.log('No hardware acceleration available, using software');
}

console.log('Creating video decoder...');
using videoDecoder = await Decoder.create(videoStream, {
  hardware,
  exitOnError: false,
});

// Create filter
const videoFilterChain = FilterPreset.chain(hardware)
  .custom(hardware ? 'hwdownload,format=nv12,format=yuv420p' : undefined)
  .build();

console.log(`Creating filter: ${videoFilterChain}...`);
using videoFilter = FilterAPI.create(videoFilterChain, {
  framerate: videoStream.avgFrameRate,
  hardware,
});

// Create encoder
const encoderCodec = hardware?.getEncoderCodec('hevc') ?? Codec.findEncoderByName(FF_ENCODER_LIBX265);
if (!encoderCodec) {
  throw new Error('No suitable HEVC encoder found');
}

console.log(`Creating encoder: ${encoderCodec.name}...`);
using videoEncoder = await Encoder.create(encoderCodec, {
  decoder: videoDecoder,
  filter: videoFilter,
  bitrate: '2M',
  gopSize: 60,
});

let receivedRTPPackets = 0;
await using videoOutput = await Muxer.open(
  {
    write: (data) => {
      receivedRTPPackets++;
      const rtpPacket = RtpPacket.deSerialize(data);
      console.log(`RTP video packet received: pt=${rtpPacket.header.payloadType}, seq=${rtpPacket.header.sequenceNumber}, timestamp=${rtpPacket.header.timestamp}`);
      return data.length;
    },
  },
  {
    input,
    format: 'rtp',
    useAsyncWrite: false,
    useSyncQueue: false,
    copyInitialNonkeyframes: true,
    maxPacketSize: 1300,
    options: {
      packet_size: 1300,
    },
  },
);

using audioDecoder = await Decoder.create(audioStream, {
  exitOnError: false,
});

const audioFilterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_FLTP, 44100, 'stereo').asetnsamples(1024).build();
using audioFilter = FilterAPI.create(audioFilterChain);

using audioEncoder = await Encoder.create(FF_ENCODER_AAC, {
  decoder: audioDecoder,
  filter: audioFilter,
});

await using audioOutput = await Muxer.open(
  {
    write: (data) => {
      receivedRTPPackets++;
      const rtpPacket = RtpPacket.deSerialize(data);
      console.log(`RTP audio packet received: pt=${rtpPacket.header.payloadType}, seq=${rtpPacket.header.sequenceNumber}, timestamp=${rtpPacket.header.timestamp}`);
      return data.length;
    },
  },
  {
    input,
    format: 'rtp',
    useAsyncWrite: false,
    useSyncQueue: false,
    copyInitialNonkeyframes: true,
    options: {
      packet_size: 1300,
    },
  },
);

const audioOutputIndex = audioOutput.addStream(audioStream);

// Add video stream
const videoOutputIndex = videoOutput.addStream(videoEncoder, { inputStream: videoStream });

// Set up timeout for stream duration
const timeout = setTimeout(() => {
  stop = true;
}, maxDuration * 1000);

// Process streams
console.log('Stream started...');
const startTime = Date.now();
let videoPackets = 0;
let audioPackets = 0;

try {
  if (iterType === 1) {
    const videoScheduler = videoDecoder.pipeTo(videoFilter).pipeTo(videoEncoder).pipeTo(videoOutput, videoOutputIndex);
    const audioScheduler = audioEncoder ? audioDecoder.pipeTo(audioFilter).pipeTo(audioEncoder).pipeTo(audioOutput, audioOutputIndex) : undefined;

    for await (const packet of input.packets()) {
      if (stop) break;
      if (!packet) {
        break;
      }
      if (packet.streamIndex === videoStream.index) {
        const now = performance.now();
        console.log('Sending packet to video scheduler, pts:', packet.pts);
        await videoScheduler.send(packet);
        const end = performance.now();
        console.log(`Video packet processed in ${end - now} ms`);
        videoPackets++;
      } else if (audioScheduler && packet.streamIndex === audioStream?.index) {
        const now = performance.now();
        console.log('Sending packet to audio scheduler, pts:', packet.pts);
        await audioScheduler.send(packet);
        const end = performance.now();
        console.log(`Audio packet processed in ${end - now} ms`);
        audioPackets++;
      }
    }

    await Promise.all([videoScheduler.flush(), audioScheduler?.flush()]);
  } else if (iterType === 2) {
    const videoInputGenerator = input.packets(videoStream.index);
    const videoDecoderGenerator = videoDecoder.frames(videoInputGenerator);
    const videoFilterGenerator = videoFilter.frames(videoDecoderGenerator);
    const videoEncoderGenerator = videoEncoder.packets(videoFilterGenerator);

    const audioInputGenerator = audioStream ? input.packets(audioStream.index) : undefined;
    const audioDecoderGenerator = audioStream && audioDecoder ? audioDecoder.frames(audioInputGenerator!) : undefined;
    const audioFilterGenerator = audioStream && audioFilter ? audioFilter.frames(audioDecoderGenerator!) : undefined;
    const audioEncoderGenerator = audioStream && audioEncoder ? audioEncoder.packets(audioFilterGenerator!) : undefined;

    const processVideo = async () => {
      for await (using packet of videoEncoderGenerator) {
        if (stop) break;
        await videoOutput.writePacket(packet, videoOutputIndex);
        videoPackets++;
      }
    };

    const processAudio = async () => {
      if (audioOutputIndex === -1 || !audioEncoderGenerator || !audioOutput) {
        return;
      }
      for await (using packet of audioEncoderGenerator) {
        if (stop) break;
        await audioOutput.writePacket(packet, audioOutputIndex);
        audioPackets++;
      }
    };

    // Run both in parallel
    await Promise.all([processVideo(), processAudio()]);
  } else if (iterType === 3) {
    for await (using packet of input.packets()) {
      if (stop) break;
      if (!packet) {
        break;
      }
      if (packet.streamIndex === videoStream.index) {
        const frames = await videoDecoder.decodeAll(packet);
        for (using frame of frames) {
          const filteredFrames = await videoFilter.processAll(frame);
          for (using filteredFrame of filteredFrames) {
            const packets = await videoEncoder.encodeAll(filteredFrame);
            for (using packet of packets) {
              await videoOutput.writePacket(packet, videoOutputIndex);
              videoPackets++;
            }
          }
        }
      } else if (audioOutputIndex !== -1 && packet.streamIndex === audioStream?.index) {
        const frames = await audioDecoder.decodeAll(packet);
        for (using frame of frames) {
          const filteredFrames = await audioFilter.processAll(frame);
          for (using filteredFrame of filteredFrames) {
            const packets = await audioEncoder.encodeAll(filteredFrame);
            for (using packet of packets) {
              await audioOutput.writePacket(packet, audioOutputIndex);
              audioPackets++;
            }
          }
        }
      }
    }
  } else {
    for await (using packet of input.packets()) {
      if (stop) break;
      if (!packet) {
        break;
      }
      if (packet.streamIndex === videoStream.index) {
        using frame = await videoDecoder.decode(packet);
        if (frame) {
          using filteredFrame = await videoFilter.process(frame);
          if (filteredFrame) {
            using packet = await videoEncoder.encode(filteredFrame);
            if (packet) {
              await videoOutput.writePacket(packet, videoOutputIndex);
              videoPackets++;
            }
          }
        }
      } else if (audioOutputIndex !== -1 && packet.streamIndex === audioStream?.index) {
        using frame = await audioDecoder.decode(packet);
        if (frame) {
          using filteredFrame = await audioFilter.process(frame);
          if (filteredFrame) {
            using packet = await audioEncoder.encode(filteredFrame);
            if (packet) {
              await audioOutput.writePacket(packet, audioOutputIndex);
              audioPackets++;
            }
          }
        }
      }
    }

    // Flush
    for await (using frame of videoDecoder.flushFrames()) {
      using filteredFrame = await videoFilter.process(frame);
      if (filteredFrame) {
        using packet = await videoEncoder.encode(filteredFrame);
        if (packet) {
          await videoOutput.writePacket(packet, videoOutputIndex);
          videoPackets++;
        }
      }
    }

    for await (using frame of videoFilter.flushFrames()) {
      using packet = await videoEncoder.encode(frame);
      if (packet) {
        await videoOutput.writePacket(packet, videoOutputIndex);
        videoPackets++;
      }
    }

    for await (using frame of videoEncoder.flushPackets()) {
      await videoOutput.writePacket(frame, videoOutputIndex);
      videoPackets++;
    }

    for await (using frame of audioDecoder.flushFrames()) {
      using filteredFrame = await audioFilter.process(frame);
      if (filteredFrame) {
        using packet = await audioEncoder.encode(filteredFrame);
        if (packet) {
          await audioOutput.writePacket(packet, audioOutputIndex);
          audioPackets++;
        }
      }
    }

    for await (using frame of audioFilter.flushFrames()) {
      using packet = await audioEncoder.encode(frame);
      if (packet) {
        await audioOutput.writePacket(packet, audioOutputIndex);
        audioPackets++;
      }
    }

    for await (using frame of audioEncoder.flushPackets()) {
      await audioOutput.writePacket(frame, audioOutputIndex);
      audioPackets++;
    }
  }
} finally {
  clearTimeout(timeout);
}

const elapsed = (Date.now() - startTime) / 1000;

console.log('Done!');
console.log(`Duration: ${elapsed.toFixed(2)} seconds`);
console.log(`Video packets: ${videoPackets}`);
console.log(`Audio packets: ${audioPackets}`);
console.log(`RTP packets received: ${receivedRTPPackets}`);
if (hardware) {
  console.log(`Hardware used: ${hardware.deviceTypeName}`);
}
