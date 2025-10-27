import { WebSocket, WebSocketServer } from 'ws';

import { WebRTCSession } from '../../../src/index.js';

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

  let session: WebRTCSession | null = null;

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
        session = await WebRTCSession.create(message.url, {
          mtu: 1200,
          hardware: 'auto',
        });

        // Setup ICE candidate handler
        session.onIceCandidate = (candidate) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }));
          }
        };

        console.log('[WebRTC] Session created with codecs:', session.getCodecs());

        console.log('[WebSocket] Processing SDP offer');

        // Set offer and get answer
        const answer = await session.setOffer(message.value);

        console.log('[WebSocket] Created SDP answer', answer);
        ws.send(JSON.stringify({ type: 'webrtc/answer', value: answer }));

        // Start streaming
        console.log('[Server] Starting streaming...');

        session
          .start()
          .then(() => {
            console.log('[Server] Streaming complete');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'end' }));
            }
          })
          .catch((error) => {
            console.error('[Server] Streaming error:', error);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', value: String(error) }));
            }
          })
          .finally(() => {
            session?.dispose();
            session = null;
          });
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

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    session?.dispose();
    session = null;
  });

  ws.on('error', (error: Error) => {
    console.error('[WebSocket] Error:', error);
    session?.dispose();
    session = null;
  });
});
