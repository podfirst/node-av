/**
 * Native bindings loader
 *
 * This module loads the native C++ bindings compiled by node-gyp.
 * All native classes are accessed through this single entry point.
 */
import type { AVCodecID, AVError, AVHWDeviceType, AVLogLevel, AVMediaType, AVOptionSearchFlags, AVPixelFormat, AVSampleFormat, FFDecoderCodec, FFEncoderCodec } from '../constants/index.js';
import type { PosixError } from './error.js';
import type { NativeAudioFifo, NativeBitStreamFilter, NativeBitStreamFilterContext, NativeCodec, NativeCodecContext, NativeCodecParameters, NativeCodecParser, NativeDictionary, NativeFFmpegError, NativeFifo, NativeFilter, NativeFilterContext, NativeFilterGraph, NativeFilterInOut, NativeFormatContext, NativeFrame, NativeFrameUtils, NativeHardwareDeviceContext, NativeHardwareFramesContext, NativeInputFormat, NativeIOContext, NativeLog, NativeOption, NativeOutputFormat, NativePacket, NativeSoftwareResampleContext, NativeSoftwareScaleContext, NativeStream, NativeSyncQueue } from './native-types.js';
import type { ChannelLayout, DtsPredictState, IDimension, IRational } from './types.js';
type NativePacketConstructor = new () => NativePacket;
type NativeFrameConstructor = new () => NativeFrame;
interface NativeCodecConstructor {
    new (): NativeCodec;
    findDecoder(id: AVCodecID): NativeCodec | null;
    findEncoder(id: AVCodecID): NativeCodec | null;
    findDecoderByName(name: FFDecoderCodec): NativeCodec | null;
    findEncoderByName(name: FFEncoderCodec): NativeCodec | null;
    getCodecList(): NativeCodec[];
    iterateCodecs(opaque?: bigint | null): {
        codec: NativeCodec;
        opaque: bigint;
    } | null;
}
type NativeCodecContextConstructor = new () => NativeCodecContext;
type NativeCodecParametersConstructor = new () => NativeCodecParameters;
type NativeCodecParserConstructor = new () => NativeCodecParser;
type NativeFormatContextConstructor = new () => NativeFormatContext;
type NativeStreamConstructor = new () => NativeStream;
interface NativeInputFormatConstructor {
    new (): NativeInputFormat;
    findInputFormat(shortName: string): NativeInputFormat | null;
    probe(buffer: Buffer, filename?: string): NativeInputFormat | null;
    probeBuffer(ioContext: NativeIOContext, maxProbeSize?: number): Promise<NativeInputFormat | null>;
    probeBufferSync(ioContext: NativeIOContext, maxProbeSize?: number): NativeInputFormat | null;
}
interface NativeOutputFormatConstructor {
    new (): NativeOutputFormat;
    guessFormat(shortName: string | null, filename: string | null, mimeType: string | null): NativeOutputFormat | null;
}
type NativeIOContextConstructor = new () => NativeIOContext;
type NativeDictionaryConstructor = new () => NativeDictionary;
interface NativeFFmpegErrorConstructor {
    new (code?: number): NativeFFmpegError;
    strerror(errnum: number): string;
    getAverror(errorName: PosixError): AVError;
}
interface NativeFilterConstructor {
    new (): NativeFilter;
    getByName(name: string): NativeFilter | null;
    getList(): NativeFilter[];
}
type NativeFilterContextConstructor = new () => NativeFilterContext;
type NativeFilterGraphConstructor = new () => NativeFilterGraph;
type NativeFilterInOutConstructor = new () => NativeFilterInOut;
interface NativeBitStreamFilterConstructor {
    new (): NativeBitStreamFilter;
    getByName(name: string): NativeBitStreamFilter | null;
    iterate(): NativeBitStreamFilter[];
}
type NativeBitStreamFilterContextConstructor = new () => NativeBitStreamFilterContext;
type NativeAudioFifoConstructor = new () => NativeAudioFifo;
type NativeFifoConstructor = new () => NativeFifo;
type NativeSoftwareScaleContextConstructor = new () => NativeSoftwareScaleContext;
type NativeSoftwareResampleContextConstructor = new () => NativeSoftwareResampleContext;
type NativeFrameUtilsConstructor = new (width: number, height: number) => NativeFrameUtils;
interface NativeHardwareDeviceContextConstructor {
    new (): NativeHardwareDeviceContext;
    getTypeName(type: AVHWDeviceType): string | null;
    iterateTypes(): AVHWDeviceType[];
    findTypeByName(name: string): AVHWDeviceType;
}
type NativeHardwareFramesContextConstructor = new () => NativeHardwareFramesContext;
interface NativeLogConstructor {
    new (): NativeLog;
    setLevel(level: AVLogLevel): void;
    getLevel(): AVLogLevel;
    log(level: AVLogLevel, message: string): void;
    setCallback(callback: ((level: AVLogLevel, message: string) => void) | null, options?: any): void;
    resetCallback(): void;
}
interface NativeOptionStatic {
    next(obj: OptionCapableObject, prev?: NativeOption): NativeOption | null;
    find(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): NativeOption | null;
    find2(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): {
        option: NativeOption;
        isDifferentTarget: boolean;
    } | null;
    get(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): string | null;
    getInt(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): number | null;
    getDouble(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): number | null;
    getRational(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): IRational | null;
    getPixelFormat(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): AVPixelFormat | null;
    getSampleFormat(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): AVSampleFormat | null;
    getImageSize(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): IDimension | null;
    getChannelLayout(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): ChannelLayout | null;
    getDict(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): NativeDictionary | null;
    set(obj: OptionCapableObject, name: string, value: string, searchFlags?: AVOptionSearchFlags): number;
    setInt(obj: OptionCapableObject, name: string, value: number | bigint, searchFlags?: AVOptionSearchFlags): number;
    setDouble(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    setRational(obj: OptionCapableObject, name: string, value: {
        num: number;
        den: number;
    }, searchFlags?: AVOptionSearchFlags): number;
    setPixelFormat(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    setSampleFormat(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    setImageSize(obj: OptionCapableObject, name: string, width: number, height: number, searchFlags?: AVOptionSearchFlags): number;
    setChannelLayout(obj: OptionCapableObject, name: string, value: number, searchFlags?: AVOptionSearchFlags): number;
    setDict(obj: OptionCapableObject, name: string, value: NativeDictionary, searchFlags?: AVOptionSearchFlags): number;
    setBin(obj: OptionCapableObject, name: string, value: Buffer, searchFlags?: AVOptionSearchFlags): number;
    setDefaults(obj: OptionCapableObject): void;
    copy(dest: OptionCapableObject, src: OptionCapableObject): number;
    isSetToDefault(obj: OptionCapableObject, name: string, searchFlags?: AVOptionSearchFlags): boolean | null;
    serialize(obj: OptionCapableObject, optFlags?: number, flags?: number, keyValSep?: string, pairsSep?: string): string | null;
    free(obj: OptionCapableObject): void;
    show(obj: OptionCapableObject, reqFlags?: number, rejFlags?: number): number;
}
interface NativeSyncQueueConstructor {
    create(type: number, bufferSizeUs: number): NativeSyncQueue;
}
/**
 * The complete native binding interface
 */
export interface NativeBinding {
    Packet: NativePacketConstructor;
    Frame: NativeFrameConstructor;
    Codec: NativeCodecConstructor;
    CodecContext: NativeCodecContextConstructor;
    CodecParameters: NativeCodecParametersConstructor;
    CodecParser: NativeCodecParserConstructor;
    FormatContext: NativeFormatContextConstructor;
    Stream: NativeStreamConstructor;
    InputFormat: NativeInputFormatConstructor;
    OutputFormat: NativeOutputFormatConstructor;
    IOContext: NativeIOContextConstructor;
    Filter: NativeFilterConstructor;
    FilterContext: NativeFilterContextConstructor;
    FilterGraph: NativeFilterGraphConstructor;
    FilterInOut: NativeFilterInOutConstructor;
    BitStreamFilter: NativeBitStreamFilterConstructor;
    BitStreamFilterContext: NativeBitStreamFilterContextConstructor;
    AudioFifo: NativeAudioFifoConstructor;
    Fifo: NativeFifoConstructor;
    SoftwareScaleContext: NativeSoftwareScaleContextConstructor;
    SoftwareResampleContext: NativeSoftwareResampleContextConstructor;
    FrameUtils: NativeFrameUtilsConstructor;
    HardwareDeviceContext: NativeHardwareDeviceContextConstructor;
    HardwareFramesContext: NativeHardwareFramesContextConstructor;
    Dictionary: NativeDictionaryConstructor;
    FFmpegError: NativeFFmpegErrorConstructor;
    Log: NativeLogConstructor;
    Option: NativeOptionStatic;
    SyncQueue: NativeSyncQueueConstructor;
    getFFmpegInfo: () => {
        version: string;
        configuration: string;
        libraries: {
            avutil: string;
            avcodec: string;
            avformat: string;
            avfilter: string;
            avdevice: string;
            swscale: string;
            swresample: string;
        };
    };
    avGetBytesPerSample: (sampleFmt: AVSampleFormat) => number;
    avGetSampleFmtName: (sampleFmt: AVSampleFormat) => string | null;
    avGetSampleFmtFromName: (name: string) => AVSampleFormat;
    avGetPackedSampleFmt: (sampleFmt: AVSampleFormat) => AVSampleFormat;
    avGetPlanarSampleFmt: (sampleFmt: AVSampleFormat) => AVSampleFormat;
    avSampleFmtIsPlanar: (sampleFmt: AVSampleFormat) => boolean;
    avGetCodecName: (codecId: AVCodecID) => string | null;
    avGetCodecString: (codecpar: NativeCodecParameters, frameRate?: IRational) => string | null;
    avGetMimeTypeDash: (codecpar: NativeCodecParameters) => string | null;
    avGetPixFmtName: (pixFmt: AVPixelFormat) => string | null;
    avGetPixFmtFromName: (name: string) => AVPixelFormat;
    avIsHardwarePixelFormat: (pixFmt: AVPixelFormat) => boolean;
    avGetHardwareDeviceTypeName: (type: AVHWDeviceType) => string | null;
    avGetHardwareDeviceTypeFromName: (name: string) => AVHWDeviceType;
    avGetMediaTypeString: (mediaType: AVMediaType) => string | null;
    avImageAlloc: (width: number, height: number, pixFmt: AVPixelFormat, align: number) => {
        buffer: Buffer;
        size: number;
        linesizes: number[];
    } | number;
    avImageCopy2: (dstData: Buffer[], dstLinesizes: number[], srcData: Buffer[], srcLinesizes: number[], pixFmt: AVPixelFormat, width: number, height: number) => void;
    avImageGetBufferSize: (pixFmt: AVPixelFormat, width: number, height: number, align: number) => number;
    avImageCopyToBuffer: (dst: Buffer, dstSize: number, srcData: Buffer[] | null, srcLinesize: number[] | null, pixFmt: AVPixelFormat, width: number, height: number, align: number) => number;
    avImageCrop: (dstBuffer: Buffer, srcBuffer: Buffer, pixFmt: AVPixelFormat, srcWidth: number, srcHeight: number, cropX: number, cropY: number, cropWidth: number, cropHeight: number) => number;
    avTs2Str: (ts: bigint | number | null) => string;
    avTs2TimeStr: (ts: bigint | number | null, timeBase: IRational) => string;
    avCompareTs: (tsA: bigint | number | null, tbA: IRational, tsB: bigint | number | null, tbB: IRational) => number;
    avRescaleQ: (a: bigint | number | null, bq: IRational, cq: IRational) => bigint;
    avRescaleRnd: (a: bigint | number, b: bigint | number, c: bigint | number, rnd: number) => bigint;
    avRescaleDelta: (inTb: IRational, inTs: bigint | number, fsTb: IRational, duration: number, lastRef: {
        value: bigint;
    }, outTb: IRational) => bigint;
    avMulQ: (a: IRational, b: IRational) => IRational;
    avInvQ: (q: IRational) => IRational;
    avAddQ: (a: IRational, b: IRational) => IRational;
    avGcd: (a: bigint | number, b: bigint | number) => bigint;
    avRescaleQRnd: (a: bigint | number | null, bq: IRational, cq: IRational, rnd: number) => bigint;
    avGetAudioFrameDuration2: (codecpar: NativeCodecParameters, frameBytes: number) => number;
    avUsleep: (usec: number) => void;
    avSamplesAlloc: (nbChannels: number, nbSamples: number, sampleFmt: AVSampleFormat, align: number) => {
        data: Buffer[];
        linesize: number;
        size: number;
    } | number;
    avSamplesGetBufferSize: (nbChannels: number, nbSamples: number, sampleFmt: AVSampleFormat, align: number) => {
        size: number;
        linesize: number;
    } | number;
    avChannelLayoutDescribe: (channelLayout: Partial<ChannelLayout>) => string | null;
    avSdpCreate: (contexts: NativeFormatContext[]) => string | null;
    dtsPredict: (packet: NativePacket, stream: NativeStream, state: DtsPredictState) => DtsPredictState;
}
/**
 * Union type for all native FFmpeg objects that support AVOptions.
 *
 * These objects have an AVClass structure as their first member,
 * which enables the AVOption API for runtime configuration.
 */
export type OptionCapableObject = NativeCodecContext | NativeFormatContext | NativeFilterContext | NativeFilterGraph | NativeSoftwareScaleContext | NativeSoftwareResampleContext | NativeIOContext | NativeBitStreamFilterContext;
declare const bindings: NativeBinding;
export { bindings };
