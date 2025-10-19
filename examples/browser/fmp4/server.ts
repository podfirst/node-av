/**
 * Browser fMP4 Streaming Example - WebSocket Server
 *
 * Demonstrates real-time fMP4 streaming to browsers using:
 * - WebSocket for bidirectional communication
 * - MediaOutput for fMP4 generation with IOOutputCallbacks
 * - MediaSource Extensions (MSE) in browser
 * - Stream copying (no transcoding)
 *
 * Usage:
 *   tsx examples/browser/fmp4/server.ts
 *
 * Then open http://localhost:8080 in your browser and enter a media URL
 * (file path, RTSP URL, HTTP URL, etc.)
 */

import { readFile } from 'fs/promises';
import { createServer } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

import {
  AV_CODEC_ID_AAC,
  AV_SAMPLE_FMT_FLTP,
  Decoder,
  Encoder,
  FF_ENCODER_AAC,
  FilterAPI,
  FilterPreset,
  MediaInput,
  MediaOutput,
  avGetCodecStringHls,
  avGetMimeTypeDash,
} from '../../../src/index.js';

import type { IOOutputCallbacks } from '../../../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const port = 8080;

console.log('fMP4 WebSocket Streaming Server');
console.log('================================');
console.log(`Port: ${port}`);
console.log('Waiting for browser connections...');

// Create HTTP server to serve HTML
const httpServer = createServer(async (req, res) => {
  if (req.url === '/') {
    try {
      const html = await readFile(resolve(__dirname, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (_error) {
      res.writeHead(500);
      res.end('Error loading index.html');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', async (ws: WebSocket) => {
  console.log('\n[WebSocket] Client connected, waiting for play signal...');

  let streamActive = false;
  let shouldClose = false;
  let inputUrl = '';

  // Wait for play signal with URL from client
  const playPromise = new Promise<void>((resolve) => {
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'play' && message.url) {
          console.log('[WebSocket] Received play signal with URL:', message.url);
          inputUrl = message.url;
          streamActive = true;
          resolve();
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    streamActive = false;
    shouldClose = true;
  });

  ws.on('error', (error: Error) => {
    console.error('[WebSocket] Error:', error);
    streamActive = false;
    shouldClose = true;
  });

  // Wait for play signal with URL
  await playPromise;

  if (shouldClose) {
    console.log('[WebSocket] Connection closed before streaming started');
    return;
  }

  if (!inputUrl) {
    console.error('[WebSocket] No input URL provided');
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'No input URL provided' }));
    }
    return;
  }

  try {
    // Open input from URL provided by client
    console.log('[Server] Opening input:', inputUrl);

    // Detect if RTSP and add options
    const isRtsp = inputUrl.toLowerCase().startsWith('rtsp://');
    await using input = await MediaInput.open(inputUrl, {
      options: isRtsp ? { rtsp_transport: 'tcp' } : undefined,
    });

    const videoStream = input.video();
    if (!videoStream) {
      throw new Error('No video stream found');
    }

    console.log('[Server] Input video:', {
      width: videoStream.codecpar.width,
      height: videoStream.codecpar.height,
      codec: videoStream.codecpar.codecId,
      format: videoStream.codecpar.format,
    });

    let audioDecoder: Decoder | null = null;
    let audioFilter: FilterAPI | null = null;
    let audioEncoder: Encoder | null = null;

    const audioStream = input.audio();
    if (audioStream) {
      console.log('[Server] Input audio:', {
        codec: audioStream.codecpar.codecId,
        channels: audioStream.codecpar.channels,
        sampleRate: audioStream.codecpar.sampleRate,
      });

      if (audioStream.codecpar.codecId !== AV_CODEC_ID_AAC) {
        audioDecoder = await Decoder.create(audioStream);

        const targetSampleRate = 48000;
        const filterChain = FilterPreset.chain().aformat(AV_SAMPLE_FMT_FLTP, targetSampleRate, 'stereo').asetnsamples(1024).build();
        audioFilter = FilterAPI.create(filterChain, {
          timeBase: audioStream.timeBase,
        });

        audioEncoder = await Encoder.create(FF_ENCODER_AAC, {
          timeBase: { num: 1, den: targetSampleRate },
        });
      }
    }

    let codecInfoSent = false;
    let firstChunk = true;

    const cb: IOOutputCallbacks = {
      write: (buffer: Uint8Array) => {
        if (ws.readyState !== WebSocket.OPEN) {
          return buffer.length;
        }

        // Send codec info after first chunk (init segment started)
        if (firstChunk && !codecInfoSent) {
          firstChunk = false;
          const outputVideoStream = output.video();
          const outputAudioStream = output.audio();

          if (outputVideoStream) {
            const videoCodecString = avGetCodecStringHls(outputVideoStream.codecpar);
            const audioCodecString = outputAudioStream ? avGetCodecStringHls(outputAudioStream.codecpar) : null;

            // Combine video and audio codec strings
            const codecStrings = audioCodecString ? `${videoCodecString},${audioCodecString}` : videoCodecString;

            const mimeType = avGetMimeTypeDash(outputVideoStream.codecpar);
            const fullCodec = `${mimeType}; codecs="${codecStrings}"`;

            console.log('[Server] Video codec:', videoCodecString);
            if (audioCodecString) {
              console.log('[Server] Audio codec:', audioCodecString);
            }
            console.log('[Server] Full codec string:', fullCodec);

            ws.send(
              JSON.stringify({
                type: 'codec',
                mimeType,
                videoCodec: videoCodecString,
                audioCodec: audioCodecString,
                codecString: codecStrings,
                fullCodec,
                width: outputVideoStream.codecpar.width,
                height: outputVideoStream.codecpar.height,
                hasAudio: !!outputAudioStream,
              }),
            );

            codecInfoSent = true;
          }
        }

        // Send chunk directly - frontend will assemble segments
        ws.send(JSON.stringify({ type: 'chunk', size: buffer.length }));
        ws.send(buffer);

        return buffer.length;
      },
    };

    await using output = await MediaOutput.open(cb, {
      format: 'mp4',
      options: {
        movflags: '+frag_keyframe+separate_moof+default_base_moof+empty_moov',
        frag_duration: 1,
      },
    });

    const videoStreamIndex = output.addStream(videoStream);
    const audioStreamIndex = audioEncoder ? output.addStream(audioEncoder) : audioStream ? output.addStream(audioStream) : null;

    console.log('[Server] Starting encoding pipeline...');

    for await (using packet of input.packets()) {
      if (!streamActive) {
        console.log('[Server] Client disconnected, stopping stream');
        break;
      }

      if (packet.streamIndex === videoStream.index) {
        // Write packet to output to generate fMP4
        await output.writePacket(packet, videoStreamIndex);
      } else if (packet.streamIndex === audioStream?.index) {
        if (!audioDecoder || !audioFilter || !audioEncoder) {
          // Stream copy audio
          await output.writePacket(packet, audioStreamIndex!);
          continue;
        }

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
        await output.writePacket(encodedPacket, audioStreamIndex!);
      }
    }

    console.log('[Server] Streaming complete, flushing...');

    if (audioDecoder && audioFilter && audioEncoder) {
      for await (using packet of audioDecoder.flushFrames()) {
        using filteredFrame = await audioFilter.process(packet);
        if (!filteredFrame) {
          continue;
        }

        using encodedPacket = await audioEncoder.encode(filteredFrame);
        if (encodedPacket) {
          await output.writePacket(encodedPacket, audioStreamIndex!);
        }
      }

      for await (using frame of audioFilter.flushFrames()) {
        using encodedPacket = await audioEncoder.encode(frame);
        if (encodedPacket) {
          await output.writePacket(encodedPacket, audioStreamIndex!);
        }
      }

      for await (using packet of audioEncoder.flushPackets()) {
        await output.writePacket(packet, audioStreamIndex!);
      }
    }

    // Close output - remaining data will be written via callback
    await output.close();

    console.log('[Server] Output closed');

    // Send end signal
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
    }
  } catch (error) {
    console.error('[Server] Error:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: String(error) }));
    }
  }
});

// Start server
httpServer.listen(port, () => {
  console.log(`\nServer running at http://localhost:${port}`);
  console.log('Open this URL in your browser to start streaming\n');
});
