import { MediaStreamTrack, RTCIceCandidate, RTCPeerConnection, RTCRtpCodecParameters, RTCSessionDescription } from 'werift';
import { WebSocket, WebSocketServer } from 'ws';

import {
  AV_CODEC_ID_AV1,
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_OPUS,
  AV_CODEC_ID_PCM_ALAW,
  AV_CODEC_ID_PCM_MULAW,
  AV_CODEC_ID_VP8,
  AV_CODEC_ID_VP9,
  AV_SAMPLE_FMT_S16,
  Decoder,
  Encoder,
  FF_ENCODER_LIBOPUS,
  FilterAPI,
  FilterPreset,
  MediaInput,
  MediaOutput,
} from '../../../src/index.js';

import type { AVCodecID } from '../../../src/index.js';

const port = 8081;
const mtu = 1200;

console.log('WebRTC Streaming Server');
console.log('================================');

const isAudioWebRTCCompatible = (codecId: AVCodecID) => {
  switch (codecId) {
    case AV_CODEC_ID_PCM_ALAW:
    case AV_CODEC_ID_PCM_MULAW:
    case AV_CODEC_ID_OPUS:
      return true;
    default:
      return false;
  }
};

const getVideoCodecMimeType = (codecId: AVCodecID): string | null => {
  switch (codecId) {
    case AV_CODEC_ID_H264:
      return 'video/H264';
    case AV_CODEC_ID_HEVC:
      return 'video/H265';
    case AV_CODEC_ID_VP8:
      return 'video/VP8';
    case AV_CODEC_ID_VP9:
      return 'video/VP9';
    case AV_CODEC_ID_AV1:
      return 'video/AV1';
    default:
      return null;
  }
};

const getAudioCodecConfig = (codecId: AVCodecID) => {
  switch (codecId) {
    case AV_CODEC_ID_OPUS:
      return {
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        payloadType: 111,
      };
    case AV_CODEC_ID_PCM_MULAW:
      return {
        mimeType: 'audio/PCMU',
        clockRate: 8000,
        channels: 1,
        payloadType: 0,
      };
    case AV_CODEC_ID_PCM_ALAW:
      return {
        mimeType: 'audio/PCMA',
        clockRate: 8000,
        channels: 1,
        payloadType: 8,
      };
    default:
      return null;
  }
};

const createPC = (videoCodecId: AVCodecID, audioCodecId: AVCodecID | null) => {
  const videoMimeType = getVideoCodecMimeType(videoCodecId);
  if (!videoMimeType) {
    throw new Error(`Unsupported video codec: ${videoCodecId}`);
  }

  const codecs: { video: RTCRtpCodecParameters[]; audio: RTCRtpCodecParameters[] } = {
    video: [
      new RTCRtpCodecParameters({
        mimeType: videoMimeType,
        clockRate: 90000,
      }),
    ],
    audio: [
      new RTCRtpCodecParameters({
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        payloadType: 111,
      }),
    ],
  };

  if (audioCodecId) {
    const audioConfig = getAudioCodecConfig(audioCodecId);
    if (audioConfig) {
      codecs.audio = [new RTCRtpCodecParameters(audioConfig)];
    }
  }

  console.log('[WebRTC] Creating PeerConnection with codecs:', {
    video: codecs.video.map((c) => c.mimeType),
    audio: codecs.audio.map((c) => c.mimeType),
  });

  return new RTCPeerConnection({ codecs });
};

// Create WebSocket server
const wss = new WebSocketServer({ port });

wss.on('listening', () => {
  console.log(`\n[WebSocket] Server is listening for WebSocket connection on ws://localhost:${port}`);
});

wss.on('connection', async (ws: WebSocket) => {
  console.log('\n[WebSocket] Client connected, waiting for URL...');

  let streamActive = false;
  let pc: RTCPeerConnection | null = null;
  const candidatesQueue: RTCIceCandidate[] = [];

  let videoTrack: MediaStreamTrack | undefined;
  let audioTrack: MediaStreamTrack | undefined;

  // Step 1: Wait for Offer/URL from client
  const { inputUrl, sdp } = await new Promise<{ inputUrl: string; sdp: string }>((resolve, reject) => {
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'webrtc/offer') {
          if (!message.value) {
            reject(new Error('No SDP provided'));
            return;
          }

          if (!message.url) {
            reject(new Error('No URL provided'));
            return;
          }

          console.log('[WebSocket] Received URL from client:', message.url);
          console.log('[WebSocket] Received SDP offer from client:', message.value);

          resolve({ inputUrl: message.url, sdp: message.value });
        } else if (message.type === 'webrtc/candidate') {
          console.log('[WebSocket] Received ICE candidate from client', message.value);
          if (pc) {
            pc.addIceCandidate(new RTCIceCandidate({ candidate: message.value }));
          } else {
            candidatesQueue.push(new RTCIceCandidate({ candidate: message.value }));
          }
        }
      } catch (error) {
        reject(error);
      }
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
      streamActive = false;
      reject(new Error('Client disconnected'));
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocket] Error:', error);
      streamActive = false;
      reject(error);
    });
  });

  // Step 2: Open MediaInput
  const isRtsp = inputUrl.toLowerCase().startsWith('rtsp://');
  const input = await MediaInput.open(inputUrl, {
    options: isRtsp ? { rtsp_transport: 'tcp' } : undefined,
  });

  // Step 3: Detect codecs from input
  const videoStream = input.video();
  if (!videoStream) {
    throw new Error('No video stream found');
  }

  const audioStream = input.audio();
  const videoCodecId = videoStream.codecpar.codecId;
  const audioCodecId = audioStream?.codecpar.codecId ?? null;

  console.log('[Server] Detected codecs:', {
    video: videoCodecId,
    audio: audioCodecId,
  });

  // Step 4: Create PeerConnection with detected codecs
  pc = createPC(videoCodecId, audioCodecId);

  pc.onIceCandidate.subscribe((candidate) => {
    if (candidate?.candidate) {
      ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate.candidate }));
    }
  });

  pc.connectionStateChange.subscribe((state) => {
    console.log('[WebRTC] Connection state changed:', state);
  });

  pc.iceConnectionStateChange.subscribe((state) => {
    console.log('[WebRTC] ICE connection state changed:', state);
  });

  pc.onTransceiverAdded.subscribe((transceiver) => {
    if (transceiver.kind === 'video') {
      videoTrack = new MediaStreamTrack({ kind: 'video' });
      transceiver.sender.replaceTrack(videoTrack);
      transceiver.setDirection('sendonly');
    } else if (transceiver.kind === 'audio') {
      audioTrack = new MediaStreamTrack({ kind: 'audio' });
      transceiver.sender.replaceTrack(audioTrack);
      transceiver.setDirection('sendonly');
    }
  });

  for (const candidate of candidatesQueue) {
    pc.addIceCandidate(candidate);
  }

  candidatesQueue.length = 0;

  await pc.setRemoteDescription(new RTCSessionDescription(sdp, 'offer'));
  const answer = await pc.createAnswer();
  pc.setLocalDescription(answer);

  // Step 5: Send Answer back to client
  console.log('[WebSocket] Sending SDP answer to client:', pc.localDescription?.sdp);
  ws.send(JSON.stringify({ type: 'webrtc/answer', value: pc.localDescription?.sdp }));
  streamActive = true;

  // Step 6: Start streaming loop
  try {
    console.log('[Server] Starting streaming with input:', inputUrl);

    let audioDecoder: Decoder | null = null;
    let audioFilter: FilterAPI | null = null;
    let audioEncoder: Encoder | null = null;
    let audioOutput: MediaOutput | null = null;

    if (audioStream) {
      if (!isAudioWebRTCCompatible(audioStream.codecpar.codecId)) {
        console.log('[Server] Audio codec not WebRTC compatible, setting up transcoding pipeline...');

        audioDecoder = await Decoder.create(audioStream);

        const targetSampleRate = 48000;
        const filterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_S16, targetSampleRate, 'stereo').asetnsamples(960).build();

        audioFilter = FilterAPI.create(filterChain, {
          timeBase: audioStream.timeBase,
        });

        audioEncoder = await Encoder.create(FF_ENCODER_LIBOPUS, {
          timeBase: { num: 1, den: targetSampleRate },
          options: {
            application: 'lowdelay',
            // frame_duration: 20,
            min_comp: 0,
          },
        });
      }

      audioOutput = await MediaOutput.open(
        {
          write: (buffer: Buffer) => {
            if (ws.readyState !== WebSocket.OPEN) {
              return buffer.length;
            }

            audioTrack?.writeRtp(buffer);
            return buffer.length;
          },
        },
        {
          format: 'rtp',
          bufferSize: mtu,
          options: {
            pkt_size: mtu,
          },
        },
      );
    }

    await using aOutput = audioOutput;
    await using vOutput = await MediaOutput.open(
      {
        write: (buffer: Buffer) => {
          if (ws.readyState !== WebSocket.OPEN) {
            return buffer.length;
          }

          videoTrack?.writeRtp(buffer);
          return buffer.length;
        },
      },
      {
        format: 'rtp',
        bufferSize: mtu,
        options: {
          pkt_size: mtu,
        },
      },
    );

    const videoStreamIndex = vOutput.addStream(videoStream);
    const audioStreamIndex = audioEncoder && aOutput ? aOutput.addStream(audioEncoder) : aOutput && audioStream ? aOutput.addStream(audioStream) : null;

    const hasAudio = audioStreamIndex !== null && aOutput !== null && audioStream !== undefined;

    console.log('[Server] Starting streaming loop');

    for await (using packet of input.packets()) {
      if (!streamActive) {
        console.log('[Server] Client disconnected, stopping stream');
        break;
      }

      if (packet.streamIndex === videoStream.index) {
        await vOutput.writePacket(packet, videoStreamIndex);
      } else if (hasAudio && packet.streamIndex === audioStream.index) {
        if (audioDecoder === null || audioFilter === null || audioEncoder === null) {
          await aOutput.writePacket(packet, audioStreamIndex);
          continue;
        } else {
          using decodedFrame = await audioDecoder.decode(packet);
          if (!decodedFrame) {
            continue;
          }

          using filteredFrame = await audioFilter.process(decodedFrame);
          if (!filteredFrame) {
            continue;
          }

          using encodedPacket = await audioEncoder.encode(filteredFrame);
          if (!encodedPacket) {
            continue;
          }

          // Write encoded audio packet to output
          await aOutput.writePacket(encodedPacket, audioStreamIndex);
        }
      }
    }

    console.log('[Server] Streaming complete, flushing...');

    if (audioDecoder && audioFilter && audioEncoder && hasAudio) {
      for await (using frame of audioDecoder.flushFrames()) {
        using filteredFrame = await audioFilter.process(frame);
        if (!filteredFrame) {
          continue;
        }

        using encodedPacket = await audioEncoder.encode(filteredFrame);
        if (encodedPacket) {
          await aOutput.writePacket(encodedPacket, audioStreamIndex);
        }
      }

      for await (using frame of audioFilter.flushFrames()) {
        using encodedPacket = await audioEncoder.encode(frame);
        if (encodedPacket) {
          await aOutput.writePacket(encodedPacket, audioStreamIndex);
        }
      }

      for await (using packet of audioEncoder.flushPackets()) {
        await aOutput.writePacket(packet, audioStreamIndex);
      }
    }

    console.log('[Server] Output closed');

    // Send end signal
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
    }
  } catch (error) {
    console.error('[Server] Error:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', value: String(error) }));
    }
  }
});
