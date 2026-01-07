import type { Frame } from '../lib/frame.js';
import type { Packet } from '../lib/packet.js';
import type { BitStreamFilterAPI } from './bitstream-filter.js';
import type { Decoder } from './decoder.js';
import type { Demuxer } from './demuxer.js';
import type { Encoder } from './encoder.js';
import type { FilterAPI } from './filter.js';
import type { Muxer } from './muxer.js';
export type StreamName = 'video' | 'audio';
export type NamedInputs<K extends StreamName = StreamName> = Pick<Record<StreamName, Demuxer>, K>;
export type NamedStages<K extends StreamName = StreamName> = Pick<Record<StreamName, (Decoder | FilterAPI | FilterAPI[] | Encoder | BitStreamFilterAPI | BitStreamFilterAPI[] | undefined)[] | 'passthrough'>, K>;
export type NamedOutputs<K extends StreamName = StreamName> = Pick<Record<StreamName, Muxer>, K>;
/**
 * Pipeline control interface for managing pipeline execution.
 * Allows graceful stopping and completion tracking of running pipelines.
 *
 * @example
 * ```typescript
 * const control = pipeline(input, decoder, encoder, output);
 *
 * // Stop after 10 seconds
 * setTimeout(() => control.stop(), 10000);
 *
 * // Wait for completion
 * await control.completion;
 * ```
 */
export interface PipelineControl {
    /**
     * Stop the pipeline gracefully.
     * The pipeline will stop processing after the current operation completes.
     */
    stop(): void;
    /**
     * Check if the pipeline has been stopped.
     *
     * @returns True if stop() has been called
     */
    isStopped(): boolean;
    /**
     * Promise that resolves when the pipeline completes.
     * Resolves when all processing is finished or the pipeline is stopped.
     */
    readonly completion: Promise<void>;
}
/**
 * Full transcoding pipeline: input → decoder → encoder → output.
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets to frames
 *
 * @param encoder - Encoder for encoding frames to packets
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * const control = pipeline(input, decoder, encoder, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, encoder: Encoder, output: Muxer): PipelineControl;
/**
 * Full transcoding pipeline with filter: input → decoder → filter → encoder → output.
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets to frames
 *
 * @param filter - Filter or filter chain for processing frames
 *
 * @param encoder - Encoder for encoding frames to packets
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * const control = pipeline(input, decoder, scaleFilter, encoder, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, filter: FilterAPI | FilterAPI[], encoder: Encoder, output: Muxer): PipelineControl;
/**
 * Transcoding with bitstream filter: input → decoder → encoder → bsf → output.
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param encoder - Encoder for encoding frames
 *
 * @param bsf - Bitstream filter for packet processing
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * const decoder = await Decoder.create(input.video());
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const bsf = await BitStreamFilterAPI.create('h264_mp4toannexb');
 * const control = pipeline(input, decoder, encoder, bsf, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, encoder: Encoder, bsf: BitStreamFilterAPI | BitStreamFilterAPI[], output: Muxer): PipelineControl;
/**
 * Full pipeline with filter and bsf: input → decoder → filter → encoder → bsf → output.
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param filter - Filter or filter chain
 *
 * @param encoder - Encoder for encoding frames
 *
 * @param bsf - Bitstream filter
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * const decoder = await Decoder.create(input.video());
 * const filter = FilterAPI.create('scale=640:480', { ... });
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const bsf = await BitStreamFilterAPI.create('h264_mp4toannexb');
 * const control = pipeline(input, decoder, filter, encoder, bsf, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, filter: FilterAPI | FilterAPI[], encoder: Encoder, bsf: BitStreamFilterAPI | BitStreamFilterAPI[], output: Muxer): PipelineControl;
/**
 * Decode + multiple filters + encode: input → decoder → filter1 → filter2 → encoder → output.
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param filter1 - First filter
 *
 * @param filter2 - Second filter
 *
 * @param encoder - Encoder for encoding frames
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * const decoder = await Decoder.create(input.video());
 * const scaleFilter = FilterAPI.create('scale=640:480', { ... });
 * const cropFilter = FilterAPI.create('crop=640:360', { ... });
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const control = pipeline(input, decoder, scaleFilter, cropFilter, encoder, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, filter1: FilterAPI, filter2: FilterAPI, encoder: Encoder, output: Muxer): PipelineControl;
/**
 * Stream copy pipeline: input → output (copies all streams).
 *
 * @param source - Media input source
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Copy all streams without re-encoding
 * const control = pipeline(input, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, output: Muxer): PipelineControl;
/**
 * Stream copy with bitstream filter: input → bsf → output.
 *
 * @param source - Media input source
 *
 * @param bsf - Bitstream filter for packet processing
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Convert H.264 stream format while copying
 * const bsf = await BitStreamFilterAPI.create('h264_mp4toannexb');
 * const control = pipeline(input, bsf, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: Demuxer, bsf: BitStreamFilterAPI | BitStreamFilterAPI[], output: Muxer): PipelineControl;
/**
 * Filter + encode + output: frames → filter → encoder → output.
 *
 * @param source - Frame source (async iterable)
 *
 * @param filter - Filter or filter chain
 *
 * @param encoder - Encoder for encoding frames
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Process frames from custom source
 * const frameSource = generateFrames(); // Your async frame generator
 * const filter = FilterAPI.create('scale=1920:1080', { ... });
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const control = pipeline(frameSource, filter, encoder, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: AsyncIterable<Frame | null>, filter: FilterAPI | FilterAPI[], encoder: Encoder, output: Muxer): PipelineControl;
/**
 * Encode + output: frames → encoder → output.
 *
 * @param source - Frame source (async iterable)
 *
 * @param encoder - Encoder for encoding frames
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Encode raw frames directly
 * const frameSource = generateFrames(); // Your async frame generator
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const control = pipeline(frameSource, encoder, output);
 * await control.completion;
 * ```
 */
export declare function pipeline(source: AsyncIterable<Frame | null>, encoder: Encoder, output: Muxer): PipelineControl;
/**
 * Partial pipeline: input → decoder (returns frames).
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @returns Async generator of frames
 *
 * @example
 * ```typescript
 * // Get decoded frames for custom processing
 * const decoder = await Decoder.create(input.video());
 * const frames = pipeline(input, decoder);
 * for await (const frame of frames) {
 *   // Process frame
 *   frame.free();
 * }
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder): AsyncGenerator<Frame | null>;
/**
 * Partial pipeline: input → decoder → filter (returns frames).
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param filter - Filter or filter chain
 *
 * @returns Async generator of frames
 *
 * @example
 * ```typescript
 * // Get filtered frames for custom processing
 * const decoder = await Decoder.create(input.video());
 * const filter = FilterAPI.create('scale=640:480', { ... });
 * const frames = pipeline(input, decoder, filter);
 * for await (const frame of frames) {
 *   // Process filtered frame
 *   frame.free();
 * }
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, filter: FilterAPI | FilterAPI[]): AsyncGenerator<Frame | null>;
/**
 * Partial pipeline: input → decoder → filter → encoder (returns packets).
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param filter - Filter or filter chain
 *
 * @param encoder - Encoder for encoding frames
 *
 * @returns Async generator of packets
 *
 * @example
 * ```typescript
 * // Get encoded packets for custom output handling
 * const decoder = await Decoder.create(input.video());
 * const filter = FilterAPI.create('scale=640:480', { ... });
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const packets = pipeline(input, decoder, filter, encoder);
 * for await (const packet of packets) {
 *   // Handle encoded packet
 *   packet.free();
 * }
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, filter: FilterAPI | FilterAPI[], encoder: Encoder): AsyncGenerator<Packet | null>;
/**
 * Partial pipeline: input → decoder → encoder (returns packets).
 *
 * @param source - Media input source
 *
 * @param decoder - Decoder for decoding packets
 *
 * @param encoder - Encoder for encoding frames
 *
 * @returns Async generator of packets
 *
 * @example
 * ```typescript
 * // Transcode to packets for custom output
 * const decoder = await Decoder.create(input.video());
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const packets = pipeline(input, decoder, encoder);
 * for await (const packet of packets) {
 *   // Handle transcoded packet
 *   packet.free();
 * }
 * ```
 */
export declare function pipeline(source: Demuxer, decoder: Decoder, encoder: Encoder): AsyncGenerator<Packet | null>;
/**
 * Partial pipeline: frames → filter (returns frames).
 *
 * @param source - Frame source (async iterable)
 *
 * @param filter - Filter or filter chain
 *
 * @returns Async generator of filtered frames
 *
 * @example
 * ```typescript
 * // Filter frames from custom source
 * const frameSource = generateFrames();
 * const filter = FilterAPI.create('scale=640:480', { ... });
 * const filteredFrames = pipeline(frameSource, filter);
 * for await (const frame of filteredFrames) {
 *   // Process filtered frame
 *   frame.free();
 * }
 * ```
 */
export declare function pipeline(source: AsyncIterable<Frame | null>, filter: FilterAPI | FilterAPI[]): AsyncGenerator<Frame | null>;
/**
 * Partial pipeline: frames → encoder (returns packets).
 *
 * @param source - Frame source (async iterable)
 *
 * @param encoder - Encoder for encoding frames
 *
 * @returns Async generator of packets
 *
 * @example
 * ```typescript
 * // Encode frames to packets
 * const frameSource = generateFrames();
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const packets = pipeline(frameSource, encoder);
 * for await (const packet of packets) {
 *   // Handle encoded packet
 *   packet.free();
 * }
 * ```
 */
export declare function pipeline(source: AsyncIterable<Frame | null>, encoder: Encoder): AsyncGenerator<Packet | null>;
/**
 * Partial pipeline: frames → filter → encoder (returns packets).
 *
 * @param source - Frame source (async iterable)
 *
 * @param filter - Filter or filter chain
 *
 * @param encoder - Encoder for encoding frames
 *
 * @returns Async generator of packets
 *
 * @example
 * ```typescript
 * // Process frames with filter and encode to packets
 * const frameSource = generateFrames();
 * const filter = FilterAPI.create('scale=640:480', { ... });
 * const encoder = await Encoder.create(FF_ENCODER_LIBX264, { ... });
 * const packets = pipeline(frameSource, filter, encoder);
 * for await (const packet of packets) {
 *   // Handle encoded packet
 *   packet.free();
 * }
 * ```
 */
export declare function pipeline(source: AsyncIterable<Frame | null>, filter: FilterAPI | FilterAPI[], encoder: Encoder): AsyncGenerator<Packet | null>;
/**
 * Named pipeline with shared input and single output.
 *
 * @param input - Shared input source (used for all streams)
 *
 * @param stages - Named processing stages for each stream
 *
 * @param output - Single output destination for all streams
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Named pipeline with shared input
 * const control = pipeline(
 *   input, // Automatically used for both video and audio
 *   {
 *     video: [videoDecoder, scaleFilter, videoEncoder],
 *     audio: [audioDecoder, volumeFilter, audioEncoder]
 *   },
 *   output
 * );
 * await control.completion;
 * ```
 */
export declare function pipeline<K extends StreamName>(input: Demuxer, stages: NamedStages<K>, output: Muxer): PipelineControl;
/**
 * Named pipeline with single output - all streams go to the same output.
 *
 * @param inputs - Named input sources (video/audio)
 *
 * @param stages - Named processing stages for each stream
 *
 * @param output - Single output destination for all streams
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Named pipeline for muxing
 * const control = pipeline(
 *   { video: videoInput, audio: audioInput },
 *   {
 *     video: [videoDecoder, scaleFilter, videoEncoder],
 *     audio: [audioDecoder, volumeFilter, audioEncoder]
 *   },
 *   output
 * );
 * await control.completion;
 * ```
 */
export declare function pipeline<K extends StreamName>(inputs: NamedInputs<K>, stages: NamedStages<K>, output: Muxer): PipelineControl;
/**
 * Named pipeline with shared input and multiple outputs.
 *
 * @param input - Shared input source (used for all streams)
 *
 * @param stages - Named processing stages for each stream
 *
 * @param outputs - Named output destinations
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Named pipeline with shared input and separate outputs
 * const control = pipeline(
 *   input, // Automatically used for both video and audio
 *   {
 *     video: [videoDecoder, scaleFilter, videoEncoder],
 *     audio: [audioDecoder, volumeFilter, audioEncoder]
 *   },
 *   { video: videoOutput, audio: audioOutput }
 * );
 * await control.completion;
 * ```
 */
export declare function pipeline<K extends StreamName>(input: Demuxer, stages: NamedStages<K>, outputs: NamedOutputs<K>): PipelineControl;
/**
 * Named pipeline with multiple outputs - each stream has its own output.
 *
 * @param inputs - Named input sources (video/audio)
 *
 * @param stages - Named processing stages for each stream
 *
 * @param outputs - Named output destinations
 *
 * @returns Pipeline control for managing execution
 *
 * @example
 * ```typescript
 * // Named pipeline for audio/video processing
 * const control = pipeline(
 *   { video: videoInput, audio: audioInput },
 *   {
 *     video: [videoDecoder, scaleFilter, videoEncoder],
 *     audio: [audioDecoder, volumeFilter, audioEncoder]
 *   },
 *   { video: videoOutput, audio: audioOutput }
 * );
 * await control.completion;
 * ```
 */
export declare function pipeline<K extends StreamName>(inputs: NamedInputs<K>, stages: NamedStages<K>, outputs: NamedOutputs<K>): PipelineControl;
/**
 * Partial named pipeline (returns generators for further processing).
 *
 * @param inputs - Named input sources
 *
 * @param stages - Named processing stages
 *
 * @returns Record of async generators for each stream
 *
 * @example
 * ```typescript
 * // Partial named pipeline
 * const generators = pipeline(
 *   { video: videoInput, audio: audioInput },
 *   {
 *     video: [videoDecoder, scaleFilter, videoEncoder],
 *     audio: [audioDecoder, volumeFilter, audioEncoder]
 *   }
 * );
 *
 * // Access individual generators
 * const videoGenerator = generators.video;
 * const audioGenerator = generators.audio;
 *
 * // Use the generators
 * for await (const packet of videoGenerator) {
 *   // Process video packet
 * }
 * for await (const packet of audioGenerator) {
 *   // Process audio packet
 * }
 * ```
 */
export declare function pipeline<K extends StreamName, T extends Packet | Frame | null = Packet | Frame | null>(inputs: NamedInputs<K>, stages: NamedStages<K>): Record<K, AsyncGenerator<T>>;
