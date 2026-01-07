import { AudioFifo } from '../lib/audio-fifo.js';
import { Frame } from '../lib/frame.js';
/**
 * Audio frame buffering utility for encoders with fixed frame size requirements.
 *
 * Many audio encoders (Opus, AAC, MP3, etc.) require frames with a specific number
 * of samples (frame_size). This class buffers incoming frames and outputs frames
 * with exactly the required size.
 *
 * Uses FFmpeg's AVAudioFifo internally for efficient sample buffering.
 *
 * @example
 * ```typescript
 * import { AudioFrameBuffer } from 'node-av/api';
 *
 * // Create buffer for 480-sample frames (e.g., Opus at 24kHz)
 * using buffer = AudioFrameBuffer.create(480, AV_SAMPLE_FMT_FLT, 48000, 'mono', 1);
 *
 * // Push variable-sized frames from filter
 * for await (const frame of filterOutput) {
 *   await buffer.push(frame);
 *
 *   // Pull fixed-size frames for encoder
 *   let outputFrame;
 *   while ((outputFrame = await buffer.pull()) !== null) {
 *     await encoder.encode(outputFrame);
 *     outputFrame.free();
 *   }
 * }
 *
 * // Flush remaining samples
 * let outputFrame;
 * while ((outputFrame = await buffer.pull()) !== null) {
 *   await encoder.encode(outputFrame);
 *   outputFrame.free();
 * }
 * ```
 */
export class AudioFrameBuffer {
    fifo;
    frame;
    frameSize;
    nextPts = 0n;
    firstFramePts = null;
    /**
     * @param fifo - Underlying AudioFifo instance
     *
     * @param frameSize - Number of samples per output frame
     *
     * @param sampleFormat - Audio sample format
     *
     * @param sampleRate - Sample rate in Hz
     *
     * @param channelLayout - Channel layout
     *
     * @internal
     */
    constructor(fifo, frameSize, sampleFormat, sampleRate, channelLayout) {
        this.fifo = fifo;
        this.frameSize = frameSize;
        this.frame = new Frame();
        this.frame.alloc();
        this.frame.nbSamples = frameSize;
        this.frame.format = sampleFormat;
        this.frame.sampleRate = sampleRate;
        this.frame.channelLayout = channelLayout;
        this.frame.getBuffer(0); // Allocate buffer once
    }
    /**
     * Create an audio frame buffer.
     *
     * @param frameSize - Required frame size in samples
     *
     * @param sampleFormat - Audio sample format
     *
     * @param sampleRate - Sample rate in Hz
     *
     * @param channelLayout - Channel layout (e.g., 'mono', 'stereo')
     *
     * @param channels - Number of audio channels
     *
     * @returns Configured audio frame buffer
     *
     * @example
     * ```typescript
     * // For Opus encoder at 48kHz with 20ms frames
     * const buffer = AudioFrameBuffer.create(960, AV_SAMPLE_FMT_FLT, 48000, 'mono', 1);
     * ```
     */
    static create(frameSize, sampleFormat, sampleRate, channelLayout, channels) {
        const fifo = new AudioFifo();
        // Allocate FIFO with capacity for multiple frames
        fifo.alloc(sampleFormat, channels, frameSize * 4);
        return new AudioFrameBuffer(fifo, frameSize, sampleFormat, sampleRate, channelLayout);
    }
    /**
     * Get number of samples currently in buffer.
     *
     * @returns Number of buffered samples
     *
     * @example
     * ```typescript
     * console.log(`Buffer contains ${buffer.size} samples`);
     * ```
     */
    get size() {
        return this.fifo.size;
    }
    /**
     * Check if a complete frame is available.
     *
     * Returns true if the FIFO contains at least frameSize samples.
     *
     * @returns True if a full frame can be pulled
     *
     * @example
     * ```typescript
     * while (buffer.hasFrame()) {
     *   const frame = buffer.pull();
     *   // Process frame...
     * }
     * ```
     */
    hasFrame() {
        return this.fifo.size >= this.frameSize;
    }
    /**
     * Push an audio frame into the buffer asynchronously.
     *
     * The frame's samples are added to the internal FIFO.
     * Call hasFrame() and pull() to retrieve fixed-size output frames.
     *
     * @param frame - Audio frame to buffer
     *
     * @example
     * ```typescript
     * await buffer.push(filterFrame);
     * ```
     *
     * @see {@link pushSync} For synchronous version
     */
    async push(frame) {
        if (!frame.isAudio()) {
            throw new Error('AudioFrameBuffer.push() requires an audio frame');
        }
        if (this.firstFramePts === null) {
            // Always start PTS from 0 for encoder frames
            // Input frames may be in different timebase than encoder expects
            this.firstFramePts = 0n;
            this.nextPts = 0n;
        }
        // Write frame data to FIFO
        await this.fifo.write(frame.data, frame.nbSamples);
    }
    /**
     * Push an audio frame into the buffer synchronously.
     * Synchronous version of push.
     *
     * The frame's samples are added to the internal FIFO.
     * Call hasFrame() and pullSync() to retrieve fixed-size output frames.
     *
     * @param frame - Audio frame to buffer
     *
     * @example
     * ```typescript
     * buffer.pushSync(filterFrame);
     * ```
     *
     * @see {@link push} For async version
     */
    pushSync(frame) {
        if (!frame.isAudio()) {
            throw new Error('AudioFrameBuffer.pushSync() requires an audio frame');
        }
        if (this.firstFramePts === null) {
            // Always start PTS from 0 for encoder frames
            // Input frames may be in different timebase than encoder expects
            this.firstFramePts = 0n;
            this.nextPts = 0n;
        }
        // Write frame data to FIFO
        this.fifo.writeSync(frame.data, frame.nbSamples);
    }
    /**
     * Pull a fixed-size audio frame from the buffer asynchronously.
     *
     * Reads exactly frameSize samples from the FIFO and returns a cloned Frame.
     * Returns null if not enough samples are available.
     * Reuses internal frame buffer for efficiency (like Decoder does).
     *
     * @returns Audio frame with exactly frameSize samples, or null if insufficient samples
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * using frame = await buffer.pull();
     * if (frame) {
     *   await encoder.encode(frame);
     * }
     * ```
     *
     * @see {@link pullSync} For synchronous version
     */
    async pull() {
        if (!this.hasFrame()) {
            return null;
        }
        // Update PTS
        this.frame.pts = this.nextPts;
        // Read samples from FIFO into reusable frame
        await this.fifo.read(this.frame.data, this.frameSize);
        // Update PTS for next frame
        this.nextPts += BigInt(this.frameSize);
        // Clone frame for user (like Decoder does)
        const cloned = this.frame.clone();
        if (!cloned) {
            throw new Error('Failed to clone frame (out of memory)');
        }
        return cloned;
    }
    /**
     * Pull a fixed-size audio frame from the buffer synchronously.
     * Synchronous version of pull.
     *
     * Reads exactly frameSize samples from the FIFO and returns a cloned Frame.
     * Returns null if not enough samples are available.
     * Reuses internal frame buffer for efficiency (like Decoder does).
     *
     * @returns Audio frame with exactly frameSize samples, or null if insufficient samples
     *
     * @throws {Error} If frame cloning fails (out of memory)
     *
     * @example
     * ```typescript
     * using frame = buffer.pullSync();
     * if (frame) {
     *   encoder.encodeSync(frame);
     * }
     * ```
     *
     * @see {@link pull} For async version
     */
    pullSync() {
        if (!this.hasFrame()) {
            return null;
        }
        // Update PTS
        this.frame.pts = this.nextPts;
        // Read samples from FIFO into reusable frame
        this.fifo.readSync(this.frame.data, this.frameSize);
        // Update PTS for next frame
        this.nextPts += BigInt(this.frameSize);
        // Clone frame for user (like Decoder does)
        const cloned = this.frame.clone();
        if (!cloned) {
            throw new Error('Failed to clone frame (out of memory)');
        }
        return cloned;
    }
    /**
     * Reset the buffer, discarding all buffered samples.
     *
     * @example
     * ```typescript
     * buffer.reset();
     * ```
     */
    reset() {
        this.fifo.reset();
        this.nextPts = 0n;
        this.firstFramePts = null;
    }
    /**
     * Free the buffer and all resources.
     *
     * @example
     * ```typescript
     * buffer.free();
     * ```
     */
    [Symbol.dispose]() {
        this.frame.free();
        this.fifo[Symbol.dispose]();
    }
}
//# sourceMappingURL=audio-frame-buffer.js.map