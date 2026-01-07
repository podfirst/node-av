var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { FilterPreset } from './filter-presets.js';
import { FilterAPI } from './filter.js';
import { WhisperDownloader } from './utilities/whisper-model.js';
/**
 * High-level Whisper transcriber for automatic speech recognition.
 *
 * Provides streaming audio transcription using OpenAI's Whisper model via whisper.cpp.
 * Supports GPU acceleration, VAD (Voice Activity Detection), and real-time processing.
 * Built on FFmpeg's whisper filter with automatic frame metadata extraction.
 *
 * Features:
 * - Real-time streaming transcription
 * - GPU acceleration (CUDA/Vulkan/Metal)
 * - Voice Activity Detection for better segmentation
 * - Automatic language detection
 * - Type-safe transcription segments
 * - Frame-based API for flexible integration
 *
 * @example
 * ```typescript
 * import { Demuxer, Decoder, WhisperTranscriber } from 'node-av/api';
 * import { WhisperDownloader } from 'node-av/api/utilities/whisper-model';
 *
 * // Download model
 * const modelPath = await WhisperDownloader.downloadModel({
 *   model: 'base.en',
 *   outputPath: './models'
 * });
 *
 * // Open audio and create decoder
 * await using input = await Demuxer.open('podcast.mp3');
 * using decoder = await Decoder.create(input.audio());
 *
 * // Create transcriber
 * await using transcriber = await WhisperTranscriber.create({
 *   model: modelPath,
 *   language: 'en'
 * });
 *
 * // Transcribe using decoded frames
 * for await (const segment of transcriber.transcribe(decoder.frames(input.packets()))) {
 *   const timestamp = `[${(segment.start / 1000).toFixed(1)}s - ${(segment.end / 1000).toFixed(1)}s]`;
 *   console.log(`${timestamp}: ${segment.text}`);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Real-time microphone transcription with VAD
 * import { Demuxer, Decoder, WhisperTranscriber } from 'node-av/api';
 * import { WhisperDownloader } from 'node-av/api/utilities/whisper-model';
 *
 * // Download VAD model
 * const vadPath = await WhisperDownloader.downloadVADModel('silero-v5.1.2', './models');
 *
 * // Setup transcriber with VAD
 * await using transcriber = await WhisperTranscriber.create({
 *   model: './models/ggml-medium.bin',
 *   language: 'en',
 *   queue: 10,
 *   vadModel: vadPath,
 *   vadThreshold: 0.5
 * });
 *
 * // Live transcription from decoded audio frames
 * using decoder = await Decoder.create(microphoneStream);
 * for await (const segment of transcriber.transcribe(decoder.frames(microphonePackets))) {
 *   if (segment.turn) {
 *     console.log('\n--- New speaker turn ---');
 *   }
 *   console.log(segment.text);
 * }
 * ```
 *
 * @see {@link WhisperDownloader} For downloading Whisper and VAD models
 * @see {@link Decoder} For audio decoding
 * @see {@link Demuxer} For reading media files
 */
export class WhisperTranscriber {
    options;
    isClosed = false;
    /**
     * @param options - Transcriber configuration
     *
     * Use {@link create} factory method instead
     *
     * @internal
     */
    constructor(options) {
        this.options = options;
    }
    /**
     * Create a Whisper transcriber instance.
     *
     * Initializes the transcriber with the specified model and configuration.
     * The transcriber can then process audio frames from any source.
     *
     * @param options - Transcriber configuration
     *
     * @returns Configured transcriber instance
     *
     * @throws {Error} If model file does not exist
     *
     * @throws {Error} If VAD model file does not exist (when vadModel specified)
     *
     * @example
     * ```typescript
     * import { WhisperTranscriber } from 'node-av/api';
     *
     * // Create transcriber with basic options
     * await using transcriber = await WhisperTranscriber.create({
     *   model: './models/ggml-base.en.bin',
     *   language: 'en'
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Create transcriber with GPU and VAD support
     * await using transcriber = await WhisperTranscriber.create({
     *   model: './models/ggml-base.bin',
     *   language: 'auto',
     *   useGpu: true,
     *   gpuDevice: 0,
     *   vadModel: './models/ggml-silero-v5.1.2.bin',
     *   vadThreshold: 0.5,
     *   queue: 10
     * });
     * ```
     */
    static async create(options) {
        const modelsToDownload = [options.model, options.vadModel].filter(Boolean);
        const [modelPath, vadModelPath] = await WhisperDownloader.downloadModels(modelsToDownload, options.modelDir);
        const fullOptions = {
            model: modelPath,
            vadModel: vadModelPath,
            modelDir: options.modelDir ?? WhisperDownloader.DEFAULT_MODEL_PATH,
            language: options.language ?? 'auto',
            queue: options.queue ?? 3,
            useGpu: options.useGpu ?? true,
            gpuDevice: options.gpuDevice ?? 0,
            vadThreshold: options.vadThreshold ?? 0.5,
            vadMinSpeechDuration: options.vadMinSpeechDuration ?? 0.1,
            vadMinSilenceDuration: options.vadMinSilenceDuration ?? 0.5,
        };
        return new WhisperTranscriber(fullOptions);
    }
    /**
     * Transcribe audio frames to text segments.
     *
     * Processes audio frames through the Whisper filter and yields transcribed segments.
     * Each segment contains start/end timestamps and the transcribed text.
     * Reads metadata directly from frame metadata tags (lavfi.whisper.text, lavfi.whisper.duration).
     *
     * The generator continues until the input stream ends or close() is called.
     * Always use with `for await...of` to properly handle async iteration.
     *
     * @param frames - Audio frames (from Decoder.frames()) or single frame to transcribe
     *
     * @yields {WhisperSegment} Transcribed audio segments with timing and text
     *
     * @throws {FFmpegError} If filter initialization fails
     *
     * @example
     * ```typescript
     * import { Demuxer, Decoder, WhisperTranscriber } from 'node-av/api';
     *
     * await using input = await Demuxer.open('podcast.mp3');
     * using decoder = await Decoder.create(input.audio());
     * await using transcriber = await WhisperTranscriber.create({
     *   model: './models/ggml-base.en.bin',
     *   language: 'en'
     * });
     *
     * // Transcribe decoded frames
     * for await (const segment of transcriber.transcribe(decoder.frames(input.packets()))) {
     *   console.log(`[${segment.start}ms]: ${segment.text}`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // With custom timing format
     * const audioFrames = decoder.frames(input.packets());
     * for await (const segment of transcriber.transcribe(audioFrames)) {
     *   const startSec = (segment.start / 1000).toFixed(2);
     *   const endSec = (segment.end / 1000).toFixed(2);
     *   console.log(`[${startSec}s - ${endSec}s]: ${segment.text}`);
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Process single frame
     * using frame = decoder.decodeSync(packet);
     * for await (const segment of transcriber.transcribe(frame)) {
     *   console.log(`Transcribed: ${segment.text}`);
     * }
     * ```
     */
    async *transcribe(frames) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const chain = FilterPreset.chain()
                .whisper({
                model: this.options.model,
                language: this.options.language,
                queue: this.options.queue,
                useGpu: this.options.useGpu,
                gpuDevice: this.options.gpuDevice,
                vadModel: this.options.vadModel,
                vadThreshold: this.options.vadThreshold,
                vadMinSpeechDuration: this.options.vadMinSpeechDuration,
                vadMinSilenceDuration: this.options.vadMinSilenceDuration,
            })
                .build();
            // Create filter API
            const filter = __addDisposableResource(env_1, FilterAPI.create(chain, {
                allowReinit: true,
                dropOnChange: false,
            }), false);
            // Track cumulative time for start/end timestamps
            let cumulativeTime = 0; // in milliseconds
            const filterGenerator = filter.frames(frames);
            // Decode and process frames through filter
            for await (const frame_1 of filterGenerator) {
                const env_2 = { stack: [], error: void 0, hasError: false };
                try {
                    const frame = __addDisposableResource(env_2, frame_1, false);
                    if (this.isClosed) {
                        break;
                    }
                    if (!frame?.isAudio()) {
                        continue;
                    }
                    // Get frame metadata
                    const metadata = frame.getMetadata();
                    const text = metadata.get('lavfi.whisper.text');
                    const durationStr = metadata.get('lavfi.whisper.duration');
                    if (text?.trim()) {
                        // Parse duration (in seconds)
                        const duration = durationStr ? parseFloat(durationStr) * 1000 : 0;
                        // Yield transcribed segment
                        yield {
                            start: cumulativeTime,
                            end: cumulativeTime + duration,
                            text: text.trim(),
                        };
                        // Update cumulative time
                        if (duration > 0) {
                            cumulativeTime += duration;
                        }
                    }
                }
                catch (e_1) {
                    env_2.error = e_1;
                    env_2.hasError = true;
                }
                finally {
                    __disposeResources(env_2);
                }
            }
        }
        catch (e_2) {
            env_1.error = e_2;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    /**
     * Close transcriber and clean up resources.
     *
     * Releases filter graph and stops frame processing.
     * Called automatically when using `await using` syntax.
     *
     * @example
     * ```typescript
     * // Automatic cleanup
     * {
     *   await using transcriber = await WhisperTranscriber.create(options);
     *   // Use transcriber
     * } // Automatically calls close()
     *
     * // Manual cleanup
     * const transcriber = await WhisperTranscriber.create(options);
     * try {
     *   // Use transcriber
     * } finally {
     *   await transcriber.close();
     * }
     * ```
     */
    close() {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
    }
    /**
     * Symbol.asyncDispose implementation for `await using` syntax.
     *
     * @internal
     */
    [Symbol.dispose]() {
        this.close();
    }
}
//# sourceMappingURL=whisper.js.map