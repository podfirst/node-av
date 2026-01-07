// ============================================================================
// Implementation
// ============================================================================
/**
 * Pipeline implementation.
 *
 * Creates a processing pipeline from media components.
 * Automatically handles type conversions and proper flushing order.
 *
 * @param args - Variable arguments depending on pipeline type
 *
 * @returns PipelineControl if output is present, AsyncGenerator otherwise
 *
 * @example
 * ```typescript
 * // Simple pipeline
 * const control = pipeline(
 *   input,
 *   decoder,
 *   filter,
 *   encoder,
 *   output
 * );
 * await control.completion;
 *
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
export function pipeline(...args) {
    // Detect pipeline type based on first argument
    const firstArg = args[0];
    const secondArg = args[1];
    // Check for shared Demuxer + NamedStages pattern
    if (isDemuxer(firstArg) && isNamedStages(secondArg)) {
        // Convert shared input to NamedInputs based on stages keys
        const sharedInput = firstArg;
        const stages = secondArg;
        const namedInputs = {};
        // Create NamedInputs with shared input for all streams in stages
        for (const streamName of Object.keys(stages)) {
            namedInputs[streamName] = sharedInput;
        }
        if (args.length === 3) {
            // Full named pipeline with output(s)
            return runNamedPipeline(namedInputs, stages, args[2]);
        }
        else {
            // Partial named pipeline
            return runNamedPartialPipeline(namedInputs, stages);
        }
    }
    if (isNamedInputs(firstArg)) {
        // Named pipeline (2 or 3 arguments)
        if (args.length === 2) {
            // Partial named pipeline - return generators
            return runNamedPartialPipeline(args[0], args[1]);
        }
        else {
            // Full named pipeline with output
            return runNamedPipeline(args[0], args[1], args[2]);
        }
    }
    else if (isDemuxer(firstArg)) {
        // Check if this is a stream copy (Demuxer → Muxer)
        if (args.length === 2 && isMuxer(args[1])) {
            // Stream copy all streams
            return runDemuxerPipeline(args[0], args[1]);
        }
        else {
            // Simple pipeline starting with Demuxer
            return runSimplePipeline(args);
        }
    }
    else {
        // Simple pipeline (variable arguments)
        return runSimplePipeline(args);
    }
}
// ============================================================================
// PipelineControl Implementation
// ============================================================================
/**
 * Pipeline control implementation.
 *
 * @internal
 */
class PipelineControlImpl {
    _stopped = false;
    _completion;
    /**
     * @param executionPromise - Promise that resolves when pipeline completes
     *
     * @internal
     */
    constructor(executionPromise) {
        // Don't resolve immediately on stop, wait for the actual pipeline to finish
        this._completion = executionPromise;
    }
    /**
     * Stop the pipeline.
     *
     * @example
     * ```typescript
     * const control = pipeline(input, decoder, filter, encoder, output);
     * control.stop();
     * ```
     *
     * @see {@link PipelineControl.isStopped}
     */
    stop() {
        this._stopped = true;
    }
    /**
     * Check if pipeline is stopped.
     *
     * @returns True if stopped
     *
     * @example
     * ```typescript
     * const control = pipeline(input, decoder, filter, encoder, output);
     * const isStopped = control.isStopped();
     * ```
     *
     * @see {@link PipelineControl.stop}
     */
    isStopped() {
        return this._stopped;
    }
    /**
     * Get completion promise.
     */
    get completion() {
        return this._completion;
    }
}
// ============================================================================
// Demuxer Pipeline Implementation
// ============================================================================
/**
 * Run a demuxer pipeline for stream copy.
 *
 * @param input - Media input source
 *
 * @param output - Media output destination
 *
 * @returns Pipeline control interface
 *
 * @internal
 */
function runDemuxerPipeline(input, output) {
    let control;
    // eslint-disable-next-line prefer-const
    control = new PipelineControlImpl(runDemuxerPipelineAsync(input, output, () => control?.isStopped() ?? false));
    return control;
}
/**
 * Run demuxer pipeline asynchronously.
 *
 * @param input - Media input source
 *
 * @param output - Media output destination
 *
 * @param shouldStop - Function to check if pipeline should stop
 *
 * @internal
 */
async function runDemuxerPipelineAsync(input, output, shouldStop) {
    // Get all streams from input
    const videoStream = input.video();
    const audioStream = input.audio();
    const streams = [];
    // Add video stream if present
    if (videoStream) {
        const outputIndex = output.addStream(videoStream);
        streams.push({ stream: videoStream, index: outputIndex });
    }
    // Add audio stream if present
    if (audioStream) {
        const outputIndex = output.addStream(audioStream);
        streams.push({ stream: audioStream, index: outputIndex });
    }
    // Add any other streams
    const allStreams = input.streams;
    for (const stream of allStreams) {
        // Skip if already added
        if (stream !== videoStream && stream !== audioStream) {
            const outputIndex = output.addStream(stream);
            streams.push({ stream, index: outputIndex });
        }
    }
    // Get iterator to properly clean up on stop
    const packetsIterable = input.packets();
    const iterator = packetsIterable[Symbol.asyncIterator]();
    try {
        // Copy all packets
        while (true) {
            // Check if we should stop before getting next item
            if (shouldStop()) {
                break;
            }
            const { value: packet, done } = await iterator.next();
            if (done)
                break;
            // Handle EOF signal (null packet from input means all streams are done)
            if (packet === null) {
                // Signal EOF for all streams
                for (const mapping of streams) {
                    await output.writePacket(null, mapping.index);
                }
                break;
            }
            try {
                // Find the corresponding output stream index
                const mapping = streams.find((s) => s.stream.index === packet.streamIndex);
                if (mapping) {
                    await output.writePacket(packet, mapping.index);
                }
            }
            finally {
                // Free the packet after use
                if (packet && typeof packet.free === 'function') {
                    packet.free();
                }
            }
        }
    }
    finally {
        // Always clean up the generator to prevent memory leaks
        if (iterator.return) {
            await iterator.return(undefined);
        }
    }
    await output.close();
}
// ============================================================================
// Simple Pipeline Implementation
// ============================================================================
/**
 * Run a simple linear pipeline.
 *
 * @param args - Pipeline arguments
 *
 * @returns Pipeline control or async generator
 *
 * @internal
 */
function runSimplePipeline(args) {
    const [source, ...stages] = args;
    // Check if last stage is Muxer (consumes stream)
    const lastStage = stages[stages.length - 1];
    const isOutput = isMuxer(lastStage);
    // Track metadata through pipeline
    const metadata = {};
    // Store Demuxer reference if we have one
    if (isDemuxer(source)) {
        metadata.demuxer = source;
    }
    // Build the pipeline generator
    // If output is present, exclude it from stages for processing
    const processStages = isOutput ? stages.slice(0, -1) : stages;
    // Process metadata first by walking through stages
    for (const stage of processStages) {
        if (isDecoder(stage)) {
            metadata.decoder = stage;
        }
        else if (isEncoder(stage)) {
            metadata.encoder = stage;
        }
        else if (isBitStreamFilterAPI(stage)) {
            metadata.bitStreamFilter = stage;
        }
    }
    // Convert Demuxer to packet stream if needed
    // If we have a decoder or BSF, filter packets by stream index
    let actualSource;
    if (isDemuxer(source)) {
        if (metadata.decoder) {
            // Filter packets for the decoder's stream
            const streamIndex = metadata.decoder.getStream().index;
            actualSource = source.packets(streamIndex);
        }
        else if (metadata.bitStreamFilter) {
            // Filter packets for the BSF's stream
            const streamIndex = metadata.bitStreamFilter.getStream().index;
            actualSource = source.packets(streamIndex);
        }
        else {
            // No decoder or BSF, pass all packets
            actualSource = source.packets();
        }
    }
    else {
        actualSource = source;
    }
    const generator = buildSimplePipeline(actualSource, processStages);
    // If output, consume the generator
    if (isOutput) {
        let control;
        // eslint-disable-next-line prefer-const
        control = new PipelineControlImpl(consumeSimplePipeline(generator, lastStage, metadata, () => control?.isStopped() ?? false));
        return control;
    }
    // Otherwise return the generator for further processing
    return generator;
}
/**
 * Build a simple pipeline generator.
 *
 * @param source - Source of packets or frames
 *
 * @param stages - Processing stages
 *
 * @yields {Packet | Frame} Processed packets or frames
 *
 * @internal
 */
async function* buildSimplePipeline(source, stages) {
    let stream = source;
    for (const stage of stages) {
        if (isDecoder(stage)) {
            stream = stage.frames(stream);
        }
        else if (isEncoder(stage)) {
            stream = stage.packets(stream);
        }
        else if (isFilterAPI(stage)) {
            stream = stage.frames(stream);
        }
        else if (isBitStreamFilterAPI(stage)) {
            stream = stage.packets(stream);
        }
        else if (Array.isArray(stage)) {
            // Chain multiple filters or BSFs
            for (const filter of stage) {
                if (isFilterAPI(filter)) {
                    stream = filter.frames(stream);
                }
                else if (isBitStreamFilterAPI(filter)) {
                    stream = filter.packets(stream);
                }
            }
        }
    }
    yield* stream;
}
/**
 * Consume a simple pipeline stream and write to output.
 *
 * @param stream - Stream of packets or frames
 *
 * @param output - Media output destination
 *
 * @param metadata - Stream metadata
 *
 * @param shouldStop - Function to check if pipeline should stop
 *
 * @internal
 */
async function consumeSimplePipeline(stream, output, metadata, shouldStop) {
    // Add stream to output if we have encoder or decoder info
    let streamIndex = 0;
    if (metadata.encoder) {
        // Encoding path
        if (metadata.decoder) {
            // Have decoder - use its stream for metadata/properties
            const originalStream = metadata.decoder.getStream();
            streamIndex = output.addStream(originalStream, { encoder: metadata.encoder });
        }
        else {
            // Encoder-only mode (e.g., frame generator) - no input stream
            streamIndex = output.addStream(metadata.encoder);
        }
    }
    else if (metadata.decoder) {
        // Stream copy - use decoder's original stream
        const originalStream = metadata.decoder.getStream();
        streamIndex = output.addStream(originalStream);
    }
    else if (metadata.bitStreamFilter) {
        // BSF without encoder/decoder - use BSF's original stream
        const originalStream = metadata.bitStreamFilter.getStream();
        streamIndex = output.addStream(originalStream);
    }
    else {
        // For direct Demuxer → Muxer, we redirect to runDemuxerPipeline
        // This case shouldn't happen in simple pipeline
        throw new Error('Cannot determine stream configuration. This is likely a bug in the pipeline.');
    }
    // Get iterator to properly clean up on stop
    const iterator = stream[Symbol.asyncIterator]();
    try {
        // Process stream
        while (true) {
            // Check if we should stop before getting next item
            if (shouldStop()) {
                break;
            }
            const { value: item, done } = await iterator.next();
            if (done)
                break;
            // Handle EOF signal
            if (item === null) {
                await output.writePacket(null, streamIndex);
                break;
            }
            // Use explicit resource management for the item
            try {
                if (isPacket(item) || item === null) {
                    await output.writePacket(item, streamIndex);
                }
                else {
                    throw new Error('Cannot write frames directly to Muxer. Use an encoder first.');
                }
            }
            finally {
                // Free the packet/frame after use
                if (item && typeof item.free === 'function') {
                    item.free();
                }
            }
        }
    }
    finally {
        // Always clean up the generator to prevent memory leaks
        if (iterator.return) {
            await iterator.return(undefined);
        }
    }
    await output.close();
}
// ============================================================================
// Named Pipeline Implementation
// ============================================================================
/**
 * Run a named partial pipeline.
 *
 * @param inputs - Named input sources
 *
 * @param stages - Named processing stages
 *
 * @returns Record of async generators
 *
 * @internal
 */
function runNamedPartialPipeline(inputs, stages) {
    const result = {};
    for (const [streamName, streamStages] of Object.entries(stages)) {
        const input = inputs[streamName];
        if (!input) {
            throw new Error(`No input found for stream: ${streamName}`);
        }
        // Get the appropriate stream based on the stream name
        let stream = null;
        switch (streamName) {
            case 'video':
                stream = input.video() ?? null;
                break;
            case 'audio':
                stream = input.audio() ?? null;
                break;
            default:
                // This should never happen
                throw new Error(`Invalid stream name: ${streamName}. Must be 'video' or 'audio'.`);
        }
        if (!stream) {
            throw new Error(`No ${streamName} stream found in input.`);
        }
        // Normalize stages: if array contains only undefined, treat as passthrough
        // Also filter out undefined entries from the array
        let normalizedStages = streamStages;
        if (Array.isArray(streamStages)) {
            const definedStages = streamStages.filter((stage) => stage !== undefined);
            if (definedStages.length === 0) {
                normalizedStages = 'passthrough';
            }
            else {
                normalizedStages = definedStages;
            }
        }
        if (normalizedStages === 'passthrough') {
            // Direct passthrough - return input packets for this specific stream
            result[streamName] = (async function* () {
                for await (const packet of input.packets(stream.index)) {
                    yield packet;
                }
            })();
        }
        else {
            // Process the stream - pass packets for this specific stream only
            // Build pipeline for this stream (can return frames or packets)
            const metadata = {};
            const stages = normalizedStages;
            result[streamName] = buildFlexibleNamedStreamPipeline(input.packets(stream.index), stages, metadata);
        }
    }
    return result;
}
/**
 * Run a named pipeline with outputs.
 *
 * @param inputs - Named input sources
 *
 * @param stages - Named processing stages
 *
 * @param output - Output destination(s)
 *
 * @returns Pipeline control interface
 *
 * @internal
 */
function runNamedPipeline(inputs, stages, output) {
    let control;
    // eslint-disable-next-line prefer-const
    control = new PipelineControlImpl(runNamedPipelineAsync(inputs, stages, output, () => control?.isStopped() ?? false));
    return control;
}
/**
 * Run named pipeline asynchronously.
 *
 * @param inputs - Named input sources
 *
 * @param stages - Named processing stages
 *
 * @param output - Output destination(s)
 *
 * @param shouldStop - Function to check if pipeline should stop
 *
 * @internal
 */
async function runNamedPipelineAsync(inputs, stages, output, shouldStop) {
    // Check if all inputs reference the same Demuxer instance
    const inputValues = Object.values(inputs);
    const allSameInput = inputValues.length > 1 && inputValues.every((input) => input === inputValues[0]);
    // Track metadata for each stream
    const streamMetadata = {};
    // Process each named stream into generators
    const processedStreams = {};
    // If all inputs are the same instance, use Demuxer's built-in parallel packet generators
    if (allSameInput) {
        const sharedInput = inputValues[0];
        // Single pass: collect metadata and build pipelines directly using input.packets(streamIndex)
        for (const [streamName, streamStages] of Object.entries(stages)) {
            const metadata = {};
            streamMetadata[streamName] = metadata;
            // Normalize stages
            let normalizedStages = streamStages;
            if (Array.isArray(streamStages)) {
                const definedStages = streamStages.filter((stage) => stage !== undefined);
                if (definedStages.length === 0) {
                    normalizedStages = 'passthrough';
                }
                else {
                    normalizedStages = definedStages;
                }
            }
            // Determine stream index and build pipeline
            let streamIndex;
            if (normalizedStages !== 'passthrough') {
                const stages = normalizedStages;
                // Set stream type
                metadata.type = streamName;
                // Populate metadata by walking through ALL stages
                for (const stage of stages) {
                    if (isDecoder(stage)) {
                        metadata.decoder = stage;
                        streamIndex ??= stage.getStream().index;
                    }
                    else if (isBitStreamFilterAPI(stage)) {
                        metadata.bitStreamFilter = stage;
                        streamIndex ??= stage.getStream().index;
                    }
                    else if (isEncoder(stage)) {
                        metadata.encoder = stage;
                    }
                }
                // If no decoder/BSF, use stream name to determine index
                if (streamIndex === undefined) {
                    const stream = streamName === 'video' ? sharedInput.video() : sharedInput.audio();
                    if (!stream) {
                        throw new Error(`No ${streamName} stream found in input.`);
                    }
                    streamIndex = stream.index;
                }
                // Build pipeline with packets from this specific stream
                processedStreams[streamName] = buildNamedStreamPipeline(sharedInput.packets(streamIndex), stages, metadata);
            }
            else {
                // Passthrough - use Demuxer's built-in stream filtering
                metadata.type = streamName;
                metadata.demuxer = sharedInput;
                const stream = streamName === 'video' ? sharedInput.video() : sharedInput.audio();
                if (!stream) {
                    throw new Error(`No ${streamName} stream found in input for passthrough.`);
                }
                streamIndex = stream.index;
                // Direct passthrough using input.packets(streamIndex)
                processedStreams[streamName] = sharedInput.packets(streamIndex);
            }
        }
    }
    else {
        // Original logic: separate inputs or single input
        for (const [streamName, streamStages] of Object.entries(stages)) {
            const metadata = {};
            streamMetadata[streamName] = metadata;
            const input = inputs[streamName];
            if (!input) {
                throw new Error(`No input found for stream: ${streamName}`);
            }
            // Normalize stages: if array contains only undefined, treat as passthrough
            // Also filter out undefined entries from the array
            let normalizedStages = streamStages;
            if (Array.isArray(streamStages)) {
                const definedStages = streamStages.filter((stage) => stage !== undefined);
                if (definedStages.length === 0) {
                    normalizedStages = 'passthrough';
                }
                else {
                    normalizedStages = definedStages;
                }
            }
            if (normalizedStages === 'passthrough') {
                // Direct passthrough - no processing
                let stream = null;
                switch (streamName) {
                    case 'video':
                        stream = input.video() ?? null;
                        metadata.type = 'video';
                        break;
                    case 'audio':
                        stream = input.audio() ?? null;
                        metadata.type = 'audio';
                        break;
                }
                if (!stream) {
                    throw new Error(`No ${streamName} stream found in input for passthrough.`);
                }
                processedStreams[streamName] = input.packets(stream.index);
                metadata.demuxer = input; // Track Demuxer for passthrough
            }
            else {
                // Process the stream - normalizedStages is guaranteed to be an array here
                const stages = normalizedStages;
                // Pre-populate metadata by walking through stages
                for (const stage of stages) {
                    if (isDecoder(stage)) {
                        metadata.decoder = stage;
                    }
                    else if (isEncoder(stage)) {
                        metadata.encoder = stage;
                    }
                    else if (isBitStreamFilterAPI(stage)) {
                        metadata.bitStreamFilter = stage;
                    }
                }
                // Get packets - filter by stream index based on decoder, BSF, or stream type
                let packets;
                if (metadata.decoder) {
                    const streamIndex = metadata.decoder.getStream().index;
                    packets = input.packets(streamIndex);
                }
                else if (metadata.bitStreamFilter) {
                    const streamIndex = metadata.bitStreamFilter.getStream().index;
                    packets = input.packets(streamIndex);
                }
                else {
                    // No decoder or BSF - determine stream by name
                    let stream = null;
                    switch (streamName) {
                        case 'video':
                            stream = input.video() ?? null;
                            break;
                        case 'audio':
                            stream = input.audio() ?? null;
                            break;
                    }
                    if (!stream) {
                        throw new Error(`No ${streamName} stream found in input.`);
                    }
                    packets = input.packets(stream.index);
                }
                // Build pipeline for this stream
                processedStreams[streamName] = buildNamedStreamPipeline(packets, stages, metadata);
            }
        }
    }
    // Write to output(s)
    if (isMuxer(output)) {
        // Always write streams in parallel - Muxer's SyncQueue handles interleaving internally
        const streamIndices = {};
        // Add all streams to output first
        for (const [name, meta] of Object.entries(streamMetadata)) {
            if (meta.encoder) {
                // Encoding path
                if (meta.decoder) {
                    // Have decoder - use its stream for metadata/properties
                    const originalStream = meta.decoder.getStream();
                    streamIndices[name] = output.addStream(originalStream, { encoder: meta.encoder });
                }
                else {
                    // Encoder-only mode (e.g., frame generator) - no input stream
                    streamIndices[name] = output.addStream(meta.encoder);
                }
            }
            else if (meta.decoder) {
                // Stream copy - use decoder's original stream
                const originalStream = meta.decoder.getStream();
                streamIndices[name] = output.addStream(originalStream);
            }
            else if (meta.bitStreamFilter) {
                // BSF - use BSF's original stream
                const originalStream = meta.bitStreamFilter.getStream();
                streamIndices[name] = output.addStream(originalStream);
            }
            else if (meta.demuxer) {
                // Passthrough from Demuxer
                const stream = name.includes('video') ? meta.demuxer.video() : meta.demuxer.audio();
                if (!stream) {
                    throw new Error(`No matching stream found in Demuxer for ${name}`);
                }
                streamIndices[name] = output.addStream(stream);
            }
            else {
                throw new Error(`Cannot determine stream configuration for ${name}. This is likely a bug in the pipeline.`);
            }
        }
        // Write all streams in parallel - Muxer's SyncQueue handles interleaving
        const promises = [];
        for (const [name, stream] of Object.entries(processedStreams)) {
            const streamIndex = streamIndices[name];
            if (streamIndex !== undefined) {
                promises.push(consumeStreamInParallel(stream, output, streamIndex, shouldStop));
            }
        }
        await Promise.all(promises);
        await output.close();
    }
    else {
        // Multiple outputs - write each stream to its output
        const outputs = output;
        const promises = [];
        for (const [streamName, stream] of Object.entries(processedStreams)) {
            const streamOutput = outputs[streamName];
            const metadata = streamMetadata[streamName];
            if (streamOutput && metadata) {
                promises.push(consumeNamedStream(stream, streamOutput, metadata, shouldStop));
            }
        }
        await Promise.all(promises);
    }
}
/**
 * Build a flexible named stream pipeline.
 *
 * @param source - Source packets
 *
 * @param stages - Processing stages
 *
 * @param metadata - Stream metadata
 *
 * @yields {Packet | Frame} Processed packets or frames
 *
 * @internal
 */
async function* buildFlexibleNamedStreamPipeline(source, stages, metadata) {
    let stream = source;
    for (const stage of stages) {
        if (isDecoder(stage)) {
            metadata.decoder = stage;
            stream = stage.frames(stream);
        }
        else if (isEncoder(stage)) {
            metadata.encoder = stage;
            stream = stage.packets(stream);
        }
        else if (isFilterAPI(stage)) {
            stream = stage.frames(stream);
        }
        else if (isBitStreamFilterAPI(stage)) {
            metadata.bitStreamFilter = stage;
            stream = stage.packets(stream);
        }
        else if (Array.isArray(stage)) {
            // Chain multiple filters or BSFs
            for (const filter of stage) {
                if (isFilterAPI(filter)) {
                    stream = filter.frames(stream);
                }
                else if (isBitStreamFilterAPI(filter)) {
                    stream = filter.packets(stream);
                }
            }
        }
    }
    // Yield whatever the pipeline produces (frames or packets)
    yield* stream;
}
/**
 * Build a named stream pipeline.
 *
 * @param source - Source packets
 *
 * @param stages - Processing stages
 *
 * @param metadata - Stream metadata
 *
 * @yields {Packet} Processed packets
 *
 * @internal
 */
async function* buildNamedStreamPipeline(source, stages, metadata) {
    let stream = source;
    for (const stage of stages) {
        if (isDecoder(stage)) {
            metadata.decoder = stage;
            stream = stage.frames(stream);
        }
        else if (isEncoder(stage)) {
            metadata.encoder = stage;
            stream = stage.packets(stream);
        }
        else if (isFilterAPI(stage)) {
            stream = stage.frames(stream);
        }
        else if (isBitStreamFilterAPI(stage)) {
            metadata.bitStreamFilter = stage;
            stream = stage.packets(stream);
        }
        else if (Array.isArray(stage)) {
            // Chain multiple filters or BSFs
            for (const filter of stage) {
                if (isFilterAPI(filter)) {
                    stream = filter.frames(stream);
                }
                else if (isBitStreamFilterAPI(filter)) {
                    stream = filter.packets(stream);
                }
            }
        }
    }
    // Ensure we're yielding packets
    for await (const item of stream) {
        if (isPacket(item) || item === null) {
            yield item;
        }
        else {
            throw new Error('Named pipeline must end with packets (use encoder after filters)');
        }
    }
}
/**
 * Consume a stream in parallel (for passthrough pipelines).
 * Stream index is already added to output.
 *
 * @param stream - Stream of packets
 *
 * @param output - Media output destination
 *
 * @param streamIndex - Pre-allocated stream index in output
 *
 * @param shouldStop - Function to check if pipeline should stop
 *
 * @internal
 */
async function consumeStreamInParallel(stream, output, streamIndex, shouldStop) {
    // Get iterator to properly clean up on stop
    const iterator = stream[Symbol.asyncIterator]();
    try {
        // Write all packets (including EOF null)
        while (true) {
            // Check if we should stop before getting next item
            if (shouldStop()) {
                break;
            }
            const { value: packet, done } = await iterator.next();
            if (done)
                break;
            try {
                await output.writePacket(packet, streamIndex);
            }
            finally {
                // Free the packet after use (but not null)
                if (packet && typeof packet.free === 'function') {
                    packet.free();
                }
            }
        }
    }
    finally {
        // Always clean up the generator to prevent memory leaks
        if (iterator.return) {
            await iterator.return(undefined);
        }
    }
    // Note: Don't close output here - it will be closed by the caller after all streams finish
}
/**
 * Consume a named stream and write to output.
 *
 * @param stream - Stream of packets
 *
 * @param output - Media output destination
 *
 * @param metadata - Stream metadata
 *
 * @param shouldStop - Function to check if pipeline should stop
 *
 * @internal
 */
async function consumeNamedStream(stream, output, metadata, shouldStop) {
    // Add stream to output
    let streamIndex = 0;
    if (metadata.encoder) {
        // Encoding path
        if (metadata.decoder) {
            // Have decoder - use its stream for metadata/properties
            const originalStream = metadata.decoder.getStream();
            streamIndex = output.addStream(originalStream, { encoder: metadata.encoder });
        }
        else {
            // Encoder-only mode (e.g., frame generator) - no input stream
            streamIndex = output.addStream(metadata.encoder);
        }
    }
    else if (metadata.decoder) {
        // Stream copy - use decoder's original stream
        const originalStream = metadata.decoder.getStream();
        streamIndex = output.addStream(originalStream);
    }
    else if (metadata.bitStreamFilter) {
        // BSF - use BSF's original stream
        const originalStream = metadata.bitStreamFilter.getStream();
        streamIndex = output.addStream(originalStream);
    }
    else if (metadata.demuxer) {
        // Passthrough from Demuxer - use type hint from metadata
        const inputStream = metadata.type === 'video' ? metadata.demuxer.video() : metadata.demuxer.audio();
        if (!inputStream) {
            throw new Error(`No ${metadata.type} stream found in Demuxer`);
        }
        streamIndex = output.addStream(inputStream);
    }
    else {
        // This should not happen with the new API
        throw new Error('Cannot determine stream configuration. This is likely a bug in the pipeline.');
    }
    // Store for later use
    metadata.streamIndex = streamIndex;
    // Get iterator to properly clean up on stop
    const iterator = stream[Symbol.asyncIterator]();
    try {
        // Write all packets (including EOF null)
        while (true) {
            // Check if we should stop before getting next item
            if (shouldStop()) {
                break;
            }
            const { value: packet, done } = await iterator.next();
            if (done)
                break;
            try {
                await output.writePacket(packet, streamIndex);
            }
            finally {
                // Free the packet after use (but not null)
                if (packet && typeof packet.free === 'function') {
                    packet.free();
                }
            }
        }
    }
    finally {
        // Always clean up the generator to prevent memory leaks
        if (iterator.return) {
            await iterator.return(undefined);
        }
    }
    // Note: Output is closed by the caller after all streams finish
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if object is named inputs.
 *
 * @param obj - Object to check
 *
 * @returns True if object is NamedInputs
 *
 * @internal
 */
function isNamedInputs(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj) && !isAsyncIterable(obj) && !isDemuxer(obj);
}
/**
 * Check if object is named stages.
 *
 * @param obj - Object to check
 *
 * @returns True if object is NamedStages
 *
 * @internal
 */
function isNamedStages(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return false;
    }
    // Check if object has at least one stream name key (video or audio)
    const keys = Object.keys(obj);
    return keys.length > 0 && keys.every((key) => key === 'video' || key === 'audio');
}
/**
 * Check if object is async iterable.
 *
 * @param obj - Object to check
 *
 * @returns True if object is AsyncIterable
 *
 * @internal
 */
function isAsyncIterable(obj) {
    return obj && typeof obj[Symbol.asyncIterator] === 'function';
}
/**
 * Check if object is Demuxer.
 *
 * @param obj - Object to check
 *
 * @returns True if object is Demuxer
 *
 * @internal
 */
function isDemuxer(obj) {
    return obj && typeof obj.packets === 'function' && typeof obj.video === 'function' && typeof obj.audio === 'function';
}
/**
 * Check if object is Decoder.
 *
 * @param obj - Object to check
 *
 * @returns True if object is Decoder
 *
 * @internal
 */
function isDecoder(obj) {
    return obj && typeof obj.decode === 'function' && typeof obj.flush === 'function';
}
/**
 * Check if object is Encoder.
 *
 * @param obj - Object to check
 *
 * @returns True if object is Encoder
 *
 * @internal
 */
function isEncoder(obj) {
    return obj && typeof obj.encode === 'function' && typeof obj.flush === 'function';
}
/**
 * Check if object is FilterAPI.
 *
 * @param obj - Object to check
 *
 * @returns True if object is FilterAPI
 *
 * @internal
 */
function isFilterAPI(obj) {
    return obj && typeof obj.process === 'function' && typeof obj.receive === 'function';
}
/**
 * Check if object is BitStreamFilterAPI.
 *
 * @param obj - Object to check
 *
 * @returns True if object is BitStreamFilterAPI
 *
 * @internal
 */
function isBitStreamFilterAPI(obj) {
    return obj && typeof obj.filter === 'function' && typeof obj.flushPackets === 'function' && typeof obj.reset === 'function';
}
/**
 * Check if object is Muxer.
 *
 * @param obj - Object to check
 *
 * @returns True if object is Muxer
 *
 * @internal
 */
function isMuxer(obj) {
    return obj && typeof obj.writePacket === 'function' && typeof obj.addStream === 'function';
}
/**
 * Check if object is Packet.
 *
 * @param obj - Object to check
 *
 * @returns True if object is Packet
 *
 * @internal
 */
function isPacket(obj) {
    return obj && 'streamIndex' in obj && 'pts' in obj && 'dts' in obj;
}
//# sourceMappingURL=pipeline.js.map