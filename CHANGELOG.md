# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes

- ⚠️ **Version 3.x is NOT compatible with version 2.x** due to FFmpeg major version upgrade
  - Native bindings rebuilt against FFmpeg 8.0.0 (was 7.1.2 in v2.x)

### Changed

- Updated FFmpeg from 7.1.2 to **8.0.0**

### Removed

- Deprecated FFmpeg 7.x APIs and constants that were removed in FFmpeg 8.0

### FFmpeg 8.0 Changelog

version `<next>`:
- ffprobe -codec option
- EXIF Metadata Parsing
- gfxcapture: Windows.Graphics.Capture based window/monitor capture
- hxvs demuxer for HXVS/HXVT IP camera format
- MPEG-H 3D Audio decoding via mpeghdec


version 8.0:
- Whisper filter
- Drop support for OpenSSL < 1.1.0
- Enable TLS peer certificate verification by default (on next major version bump)
- Drop support for OpenSSL < 1.1.1
- yasm support dropped, users need to use nasm
- VVC VAAPI decoder
- RealVideo 6.0 decoder
- OpenMAX encoders deprecated
- libx265 alpha layer encoding
- ADPCM IMA Xbox decoder
- Enhanced FLV v2: Multitrack audio/video, modern codec support
- Animated JPEG XL encoding (via libjxl)
- VVC in Matroska
- CENC AV1 support in MP4 muxer
- pngenc: set default prediction method to PAETH
- APV decoder and APV raw bitstream muxing and demuxing
- APV parser
- APV encoding support through a libopenapv wrapper
- VVC decoder supports all content of SCC (Screen Content Coding):
  IBC (Inter Block Copy), Palette Mode and ACT (Adaptive Color Transform
- G.728 decoder
- pad_cuda filter
- Sanyo LD-ADPCM decoder
- APV in MP4/ISOBMFF muxing and demuxing
- OpenHarmony hardware decoder/encoder
- Colordetect filter
- Add vf_scale_d3d11 filter
- No longer disabling GCC autovectorization, on X86, ARM and AArch64
- VP9 Vulkan hwaccel
- AV1 Vulkan encoder
- ProRes RAW decoder
- ProRes RAW Vulkan hwaccel
- ffprobe -codec option
- HDR10+ metadata passthrough when decoding/encoding with libaom-av1

### Note

- The Whisper filter from FFmpeg 8.0 is not yet available in this release and will be implemented in a future update

## [2.7.1] - 2025-10-07

### Added

- **Automatic Hardware Decoder Selection**: `Decoder.create()` now automatically selects hardware decoders when hardware context is provided
  - Mimics FFmpeg CLI behavior: "Selecting decoder 'hevc_qsv' because of requested hwaccel method qsv"
  - New `HardwareContext.getDecoderCodec()` method to find hardware-specific decoders (e.g., `hevc_qsv`)
  - Falls back to software decoder if no hardware decoder is available
  - Works with both async `create()` and sync `createSync()` methods

### Changed

- **QSV Filter Support**: `FilterPresets` now uses `vpp_qsv` filter for Intel Quick Sync Video instead of `scale_qsv`

## [2.7.0] - 2025-10-07

### Added

- **Hardware Frame Allocation Control**: Added `extraHWFrames` option to `DecoderOptions` and `FilterOptions` for controlling hardware frame buffer size
  - Low-level access via `codecContext.extraHWFrames` and `filterContext.extraHWFrames`

### Changed

- **High-Level API Error Handling**: All high-level API methods now return `null` instead of throwing errors when resources are closed
  - Affected methods: `decode()`, `encode()`, `process()`, `flush()` and their sync variants
  - Generator methods (`frames()`, `packets()`, etc.) now exit gracefully when `closed`/`isClosed` flag is set
  - Improves error handling in cleanup scenarios

- **BitStreamFilterAPI Lifecycle Management**:
  - Renamed `dispose()` method to `close()` for consistency with other high-level APIs
  - Added `isBitstreamFilterOpen` getter to check filter state
  - Symbol.dispose still supported for automatic cleanup with `using` statement

- **Consistent Closed State Behavior**:
  - Methods check closed state and return `null` instead of throwing exceptions
  - Generator loops respect closed state

### Fixed

- **Log Callback Event Loop**: Fixed Node.js process not exiting when using `Log.setCallback()`
  - ThreadSafeFunction is now unref'd to prevent keeping event loop alive
  - Proper cleanup order in `SetCallback()` and `ResetCallback()`

- **VideoToolbox Patch**: Fixed "Duplicated pixel format" error in hardware acceleration
  - Corrected patch 1006 to avoid duplicate `AV_PIX_FMT_BGRA` entries in `supported_formats[]`
  - Added `AV_PIX_FMT_GRAY8` and `AV_PIX_FMT_RGB24` to VideoToolbox format support

## [2.6.0] - 2025-09-29

### Added

#### Frame Processing Utilities

Added `FrameUtils` class for efficient image processing of NV12 video frames. This native implementation provides crop, resize, and format conversion operations with internal resource pooling for improved performance in streaming scenarios.

**Usage:**
```typescript
import { FrameUtils } from 'node-av/lib';

// Initialize once for your input dimensions
const processor = new FrameUtils(1920, 1080);

// Process frames with various operations
const output = processor.process(nv12Buffer, {
  crop: { left: 100, top: 100, width: 640, height: 480 },
  resize: { width: 1280, height: 720 },
  format: { to: 'rgba' }
});

processor.close();

// Automatic cleanup with using statement
{
  using processor = new FrameUtils(320, 180);
  // Process frames...
} // Automatically disposed
```

## [2.5.0] - 2025-09-26

### Added

- **FFmpeg Binary Access**: New `node-av/ffmpeg` entry point provides easy access to FFmpeg binaries
  - `ffmpegPath()` - Get path to FFmpeg executable
  - `isFfmpegAvailable()` - Check if FFmpeg binary is available
  - Automatic download and installation of platform-specific FFmpeg binaries from GitHub releases


## [2.4.0] - 2025-09-25

### Added

#### Windows Build Improvements
- Added Windows MSVC builds alongside existing MinGW builds for better compatibility
- Now distributes both `@seydx/node-av-win32-x64-msvc` and `@seydx/node-av-win32-x64-mingw` packages

#### FFmpeg Binary Distribution
- Now includes standalone FFmpeg v7.1.2 binaries as release assets for all supported platforms:
  - **Jellyfin builds**: `ffmpeg-v7.1.2-{platform}-jellyfin.zip` (Windows MinGW, Linux, macOS)
  - **MSVC builds**: `ffmpeg-v7.1.2-win-{arch}.zip` (Windows MSVC only)

### Changed

#### FFmpeg Upgrade
- Updated FFmpeg from 7.1 to **7.1.2** with latest performance improvements and bug fixes

## [2.1.0] - 2025-09-18

### Added

#### Synchronous Methods for All Async Operations

Added synchronous variants for all async methods to eliminate AsyncWorker overhead and achieve near-native FFmpeg performance. Every async method now has a corresponding `Sync` suffix variant.

**Performance Improvements:**
- Eliminates N-API AsyncWorker overhead for CPU-bound operations
- Near-native FFmpeg performance for sequential processing

**Usage:**

```typescript
// Async version (non-blocking, good for concurrent operations)
const frame = await decoder.decode(packet);
for await (const packet of input.packets()) { /* ... */ }

// Sync version (faster for sequential processing)
const frame = decoder.decodeSync(packet);
for (const packet of input.packetsSync()) { /* ... */ }
```

## [2.0.0] - 2025-09-13

### Changed

#### Breaking Changes

##### Encoder Hardware Context Removal
The `hardware` option has been removed from `Encoder.create()`. Hardware context is now automatically detected from input frames.

```typescript
// Before (v1.x)
const hw = HardwareContext.auto();
const encoderCodec = hw.getEncoderCodec('h264'); // e.g., returns FF_ENCODER_H264_VIDEOTOOLBOX
const encoder = await Encoder.create(encoderCodec.name, streamInfo, {
  hardware: hw,
  bitrate: 5000000
});

// After (v2.0)
const hw = HardwareContext.auto();
const encoderCodec = hw.getEncoderCodec('h264');
const encoder = await Encoder.create(encoderCodec, {
  bitrate: 5000000
});
// Hardware context automatically detected from input frames

// Or using typed constants directly:
import { FF_ENCODER_H264_VIDEOTOOLBOX } from '@seydx/av/constants';
const encoder = await Encoder.create(FF_ENCODER_H264_VIDEOTOOLBOX, { bitrate: 5000000 });
```

##### FilterPreset Hardware Support
`HardwareFilterPresets` class has been removed. Use `FilterPreset` with `chain()` for hardware acceleration.

```typescript
// Before (v1.x)
const hw = HardwareContext.auto();
const hwFilter = new HardwareFilterPresets(hw);
const filter = hwFilter.scale(1920, 1080);

// After (v2.0)
const hw = HardwareContext.auto();
const filterChain = FilterPreset.chain(hw).scale(1920, 1080).build(); // Pass hardware context to chain
```

##### MediaOutput Automatic Management
No longer need to manually manage headers and trailers.

```typescript
// Before (v1.x)
const output = await MediaOutput.create('output.mp4');
await output.writeHeader();
// ... write packets ...
await output.writeTrailer();
await output.close();

// After (v2.0)
await using output = await MediaOutput.create('output.mp4');
// ... write packets ...
// Header/trailer handled automatically, close on dispose
```

### Added

- More Filter presets
- Better error messages throughout the API

### Fixed

- Video duration calculation issues (was showing 10000+ seconds instead of actual duration)
- Memory management in filter buffer handling
- Dictionary.fromObject to properly handle number values
- Codec context initialization and cleanup

### Removed

- `HardwareFilterPresets` class (replaced by enhanced `FilterPreset`)
- Manual `writeHeader()` and `writeTrailer()` requirements in MediaOutput
- Unused stream information types from type exports

## [1.0.0] - 2025-08-30

- Initial Release