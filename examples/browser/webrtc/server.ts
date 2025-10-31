import { WebSocket, WebSocketServer } from 'ws';

import { WebRTCStream } from '../../../src/index.js';

const port = 8081;

console.log('WebRTC Streaming Server');
console.log('================================');

// Create WebSocket server
const wss = new WebSocketServer({ port });

wss.on('listening', () => {
  console.log(`\n[WebSocket] Server is listening on ws://localhost:${port}`);
});

wss.on('connection', async (ws: WebSocket) => {
  console.log('\n[WebSocket] Client connected, waiting for URL...');

  let session: WebRTCStream | null = null;

  // Step 1: Wait for URL from client
  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'webrtc/offer') {
        if (!message.url) {
          ws.send(JSON.stringify({ type: 'error', value: 'No URL provided' }));
          return;
        }

        if (!message.value) {
          ws.send(JSON.stringify({ type: 'error', value: 'No SDP offer provided' }));
          return;
        }

        console.log('[WebSocket] Received SDP offer with URL from client:', message.url, message.value);

        // Create WebRTC session
        session = WebRTCStream.create(message.url, {
          video: {
            mtu: 1200,
          },
          audio: {
            mtu: 1200,
          },
          hardware: 'auto',
          onIceCandidate: (candidate) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
            }
          },
          onClose(error) {
            if (error) {
              console.error('[WebRTC] Session closed with error:', error);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', value: String(error) }));
              }
            } else {
              console.log('[WebRTC] Session closed');
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'end' }));
              }
            }
          },
        });

        // Start streaming
        console.log('[Server] Starting streaming...');
        await session.start();

        console.log('[WebRTC] Session created with codecs:', session.getCodecs());

        console.log('[WebSocket] Processing SDP offer');

        // Set offer and get answer
        const answer = await session.setOffer(message.value);

        console.log('[WebSocket] Created SDP answer', answer);
        ws.send(JSON.stringify({ type: 'webrtc/answer', value: answer }));

        // Start streaming
        console.log('[Server] Starting streaming...');
      } else if (message.type === 'webrtc/candidate') {
        if (!session) {
          return;
        }
        console.log('[WebSocket] Received ICE candidate from client');
        session.addIceCandidate(message.value);
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
    await session?.stop();
    session = null;
  });

  ws.on('error', async (error: Error) => {
    console.error('[WebSocket] Error:', error);
    await session?.stop();
    session = null;
  });
});
