import { WebSocket, WebSocketServer } from 'ws';

import { FMP4Stream } from '../../../src/index.js';

const port = 8080;

console.log('fMP4 Streaming Server');
console.log('================================');

// Create WebSocket server
const wss = new WebSocketServer({ port });

wss.on('listening', () => {
  console.log(`\n[WebSocket] Server is listening on ws://localhost:${port}`);
});

wss.on('connection', async (ws: WebSocket) => {
  console.log('\n[WebSocket] Client connected, waiting for URL...');

  let stream: FMP4Stream | null = null;

  // Wait for play message with URL and supported codecs from client
  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'play') {
        if (!message.url) {
          ws.send(JSON.stringify({ type: 'error', value: 'No URL provided' }));
          return;
        }

        if (!message.supportedCodecs) {
          ws.send(JSON.stringify({ type: 'error', value: 'No supported codecs provided' }));
          return;
        }

        console.log('[WebSocket] Received play request');
        console.log('  URL:', message.url);
        console.log('  Supported codecs:', message.supportedCodecs);

        // Create fMP4 stream with codec negotiation
        stream = FMP4Stream.create(message.url, {
          supportedCodecs: message.supportedCodecs,
          fragDuration: 1,
          hardware: 'auto',
          onData: (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk);
            }
          },
        });

        console.log('[Server] Starting streaming...');

        // Start streaming (opens input and starts pipeline)
        await stream.start();

        // Get codec info after start (input is now open)
        const codecString = stream.getCodecString();
        console.log('[Server] MSE codec string:', codecString);

        // Send codec string to client for addSourceBuffer
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'mse', value: codecString, resolution: stream.getResolution() }));
        }

        // Wait for user to stop or stream to end naturally
        // Note: stream.start() returns immediately, pipeline runs in background
      }
    } catch (error) {
      console.error('[WebSocket] Error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', value: String(error) }));
      }
    }
  });

  ws.on('close', async () => {
    console.log('[WebSocket] Client disconnected');
    await stream?.stop();
    stream = null;
  });

  ws.on('error', async (error: Error) => {
    console.error('[WebSocket] Error:', error);
    await stream?.stop();
    stream = null;
  });
});
