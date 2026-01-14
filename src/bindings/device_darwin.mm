#if defined(__APPLE__)

#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#include "device.h"
#include <map>
#include <stdexcept>

namespace ffmpeg {

// CoreVideo pixel format to FFmpeg name mapping
static const std::map<uint32_t, std::string> kPixelFormatMap = {
    { kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, "nv12" },
    { kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, "nv12" },
    { kCVPixelFormatType_420YpCbCr8Planar, "yuv420p" },
    { kCVPixelFormatType_420YpCbCr8PlanarFullRange, "yuv420p" },
    { kCVPixelFormatType_422YpCbCr8_yuvs, "yuyv422" },
    { kCVPixelFormatType_422YpCbCr8, "uyvy422" },
    { kCVPixelFormatType_32BGRA, "bgra" },
    { kCVPixelFormatType_32ARGB, "argb" },
    { kCVPixelFormatType_24RGB, "rgb24" },
    { kCVPixelFormatType_24BGR, "bgr24" },
    { kCVPixelFormatType_422YpCbCr10, "yuv422p10le" },
    { kCVPixelFormatType_444YpCbCr10, "yuv444p10le" },
};

// Helper to get FFmpeg device index from uniqueID
static int GetDeviceIndex(NSString* uniqueID, AVMediaType mediaType) {
    NSArray<AVCaptureDevice*>* devices = [AVCaptureDevice devicesWithMediaType:mediaType];
    int index = 0;
    for (AVCaptureDevice* device in devices) {
        if ([device.uniqueID isEqualToString:uniqueID]) {
            return index;
        }
        index++;
    }
    return -1;
}

std::vector<DeviceInfoNative> Device::ListDevicesNative(const std::string& mediaTypeFilter) {
    std::vector<DeviceInfoNative> devices;

    @autoreleasepool {
        // Get video devices
        if (mediaTypeFilter.empty() || mediaTypeFilter == "video") {
            NSArray<AVCaptureDevice*>* videoDevices =
                [AVCaptureDevice devicesWithMediaType:AVMediaTypeVideo];

            int videoIndex = 0;
            for (AVCaptureDevice* device in videoDevices) {
                DeviceInfoNative info;
                info.id = [device.uniqueID UTF8String];
                info.name = [device.localizedName UTF8String];

                // FFmpeg avfoundation uses numeric index
                info.ffmpegDevice = std::to_string(videoIndex);
                info.platform = "avfoundation";
                info.mediaTypes.push_back("video");

                devices.push_back(info);
                videoIndex++;
            }
        }

        // Get audio devices
        if (mediaTypeFilter.empty() || mediaTypeFilter == "audio") {
            NSArray<AVCaptureDevice*>* audioDevices =
                [AVCaptureDevice devicesWithMediaType:AVMediaTypeAudio];

            int audioIndex = 0;
            for (AVCaptureDevice* device in audioDevices) {
                DeviceInfoNative info;
                info.id = [device.uniqueID UTF8String];
                info.name = [device.localizedName UTF8String];

                // FFmpeg avfoundation uses "none:index" for audio-only
                info.ffmpegDevice = "none:" + std::to_string(audioIndex);
                info.platform = "avfoundation";
                info.mediaTypes.push_back("audio");

                devices.push_back(info);
                audioIndex++;
            }
        }
    }

    return devices;
}

DeviceCapabilitiesNative Device::ProbeCapabilitiesNative(const std::string& deviceId,
                                                          const std::string& platform) {
    DeviceCapabilitiesNative caps;

    if (platform != "avfoundation") {
        throw std::runtime_error("Invalid platform for macOS: " + platform);
    }

    @autoreleasepool {
        NSString* uniqueID = [NSString stringWithUTF8String:deviceId.c_str()];
        AVCaptureDevice* device = [AVCaptureDevice deviceWithUniqueID:uniqueID];

        if (!device) {
            throw std::runtime_error("Device not found: " + deviceId);
        }

        // Check if this is a video device
        if (![device hasMediaType:AVMediaTypeVideo]) {
            // Audio device - no video capabilities
            return caps;
        }

        // Track unique modes and formats
        std::set<std::string> seenModes;
        std::set<std::string> seenPixelFormats;

        for (AVCaptureDeviceFormat* format in device.formats) {
            CMFormatDescriptionRef desc = format.formatDescription;

            // Skip non-video formats
            if (CMFormatDescriptionGetMediaType(desc) != kCMMediaType_Video) {
                continue;
            }

            CMVideoDimensions dims = CMVideoFormatDescriptionGetDimensions(desc);

            // Get pixel format
            FourCharCode codecType = CMVideoFormatDescriptionGetCodecType(desc);
            auto it = kPixelFormatMap.find(codecType);
            if (it != kPixelFormatMap.end()) {
                seenPixelFormats.insert(it->second);
            } else {
                // Try to create a fourcc string for unknown formats
                char fourcc[5] = {0};
                fourcc[0] = static_cast<char>((codecType >> 24) & 0xFF);
                fourcc[1] = static_cast<char>((codecType >> 16) & 0xFF);
                fourcc[2] = static_cast<char>((codecType >> 8) & 0xFF);
                fourcc[3] = static_cast<char>(codecType & 0xFF);

                // Only add if it looks like a printable fourcc
                bool printable = true;
                for (int i = 0; i < 4; i++) {
                    if (fourcc[i] < 32 || fourcc[i] > 126) {
                        printable = false;
                        break;
                    }
                }
                if (printable) {
                    seenPixelFormats.insert(std::string(fourcc));
                }
            }

            // Get frame rate ranges
            for (AVFrameRateRange* range in format.videoSupportedFrameRateRanges) {
                VideoModeNative mode;
                mode.width = dims.width;
                mode.height = dims.height;
                mode.minFps = range.minFrameRate;
                mode.maxFps = range.maxFrameRate;

                // Deduplicate modes
                char modeKey[64];
                snprintf(modeKey, sizeof(modeKey), "%dx%d@%.1f-%.1f",
                         mode.width, mode.height, mode.minFps, mode.maxFps);

                if (seenModes.find(modeKey) == seenModes.end()) {
                    seenModes.insert(modeKey);
                    caps.modes.push_back(mode);
                }
            }
        }

        // Copy pixel formats to output
        for (const auto& fmt : seenPixelFormats) {
            caps.pixelFormats.push_back(fmt);
        }
    }

    return caps;
}

} // namespace ffmpeg

#endif // __APPLE__
