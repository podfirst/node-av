#ifndef FFMPEG_DEVICE_H
#define FFMPEG_DEVICE_H

#include <napi.h>
#include <string>
#include <vector>
#include <set>

namespace ffmpeg {

// Native data structures for cross-platform device info
struct DeviceInfoNative {
    std::string id;
    std::string name;
    std::string ffmpegDevice;
    std::vector<std::string> mediaTypes;
    std::string platform;
};

struct VideoModeNative {
    int width;
    int height;
    double minFps;
    double maxFps;
};

struct DeviceCapabilitiesNative {
    std::vector<VideoModeNative> modes;
    std::vector<std::string> pixelFormats;
    std::vector<std::string> videoCodecs;
};

class Device : public Napi::ObjectWrap<Device> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Device(const Napi::CallbackInfo& info);
    ~Device() = default;

    // Platform-specific implementations (defined in platform files)
    // These are public so the async worker can call them
    static std::vector<DeviceInfoNative> ListDevicesNative(const std::string& mediaType);
    static DeviceCapabilitiesNative ProbeCapabilitiesNative(const std::string& deviceId,
                                                             const std::string& platform);

    static Napi::FunctionReference constructor;

private:
    // Static methods exposed to JS
    static Napi::Value ListDevices(const Napi::CallbackInfo& info);
    static Napi::Value ProbeCapabilities(const Napi::CallbackInfo& info);
    static Napi::Value ProbeCapabilitiesAsync(const Napi::CallbackInfo& info);
    static Napi::Value GetPlatform(const Napi::CallbackInfo& info);
};

} // namespace ffmpeg

#endif // FFMPEG_DEVICE_H
