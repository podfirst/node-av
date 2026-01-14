#include "device.h"

namespace ffmpeg {

Napi::FunctionReference Device::constructor;

Napi::Object Device::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "Device", {
        StaticMethod<&Device::ListDevices>("listDevices"),
        StaticMethod<&Device::ProbeCapabilities>("probeCapabilities"),
        StaticMethod<&Device::ProbeCapabilitiesAsync>("probeCapabilitiesAsync"),
        StaticMethod<&Device::GetPlatform>("getPlatform"),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("Device", func);
    return exports;
}

Device::Device(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Device>(info) {
    // Constructor does nothing - all methods are static
}

Napi::Value Device::GetPlatform(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

#if defined(__APPLE__)
    return Napi::String::New(env, "avfoundation");
#elif defined(_WIN32)
    return Napi::String::New(env, "dshow");
#elif defined(__linux__)
    return Napi::String::New(env, "v4l2");
#else
    return Napi::String::New(env, "unknown");
#endif
}

Napi::Value Device::ListDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string mediaTypeFilter;
    if (info.Length() > 0 && info[0].IsString()) {
        mediaTypeFilter = info[0].As<Napi::String>().Utf8Value();
    }

    try {
        std::vector<DeviceInfoNative> devices = ListDevicesNative(mediaTypeFilter);

        Napi::Array result = Napi::Array::New(env, devices.size());
        for (size_t i = 0; i < devices.size(); i++) {
            Napi::Object deviceObj = Napi::Object::New(env);
            deviceObj.Set("id", Napi::String::New(env, devices[i].id));
            deviceObj.Set("name", Napi::String::New(env, devices[i].name));
            deviceObj.Set("ffmpegDevice", Napi::String::New(env, devices[i].ffmpegDevice));
            deviceObj.Set("platform", Napi::String::New(env, devices[i].platform));

            Napi::Array mediaTypes = Napi::Array::New(env, devices[i].mediaTypes.size());
            for (size_t j = 0; j < devices[i].mediaTypes.size(); j++) {
                mediaTypes.Set(static_cast<uint32_t>(j), Napi::String::New(env, devices[i].mediaTypes[j]));
            }
            deviceObj.Set("mediaTypes", mediaTypes);

            result.Set(static_cast<uint32_t>(i), deviceObj);
        }

        return result;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value Device::ProbeCapabilities(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Device object required").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object deviceObj = info[0].As<Napi::Object>();

    if (!deviceObj.Has("id") || !deviceObj.Has("platform")) {
        Napi::TypeError::New(env, "Device object must have 'id' and 'platform' properties").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string deviceId = deviceObj.Get("id").As<Napi::String>().Utf8Value();
    std::string platform = deviceObj.Get("platform").As<Napi::String>().Utf8Value();

    try {
        DeviceCapabilitiesNative caps = ProbeCapabilitiesNative(deviceId, platform);

        Napi::Object result = Napi::Object::New(env);

        // Modes
        Napi::Array modes = Napi::Array::New(env, caps.modes.size());
        for (size_t i = 0; i < caps.modes.size(); i++) {
            Napi::Object mode = Napi::Object::New(env);
            mode.Set("width", Napi::Number::New(env, caps.modes[i].width));
            mode.Set("height", Napi::Number::New(env, caps.modes[i].height));
            mode.Set("minFps", Napi::Number::New(env, caps.modes[i].minFps));
            mode.Set("maxFps", Napi::Number::New(env, caps.modes[i].maxFps));
            modes.Set(static_cast<uint32_t>(i), mode);
        }
        result.Set("modes", modes);

        // Pixel formats
        Napi::Array pixelFormats = Napi::Array::New(env, caps.pixelFormats.size());
        for (size_t i = 0; i < caps.pixelFormats.size(); i++) {
            pixelFormats.Set(static_cast<uint32_t>(i), Napi::String::New(env, caps.pixelFormats[i]));
        }
        result.Set("pixelFormats", pixelFormats);

        // Video codecs
        Napi::Array videoCodecs = Napi::Array::New(env, caps.videoCodecs.size());
        for (size_t i = 0; i < caps.videoCodecs.size(); i++) {
            videoCodecs.Set(static_cast<uint32_t>(i), Napi::String::New(env, caps.videoCodecs[i]));
        }
        result.Set("videoCodecs", videoCodecs);

        return result;
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

// Async worker for ProbeCapabilitiesAsync
class ProbeCapabilitiesWorker : public Napi::AsyncWorker {
public:
    ProbeCapabilitiesWorker(Napi::Env env, const std::string& deviceId,
                            const std::string& platform)
        : Napi::AsyncWorker(env),
          deviceId_(deviceId),
          platform_(platform),
          deferred_(Napi::Promise::Deferred::New(env)) {}

    void Execute() override {
        try {
            caps_ = Device::ProbeCapabilitiesNative(deviceId_, platform_);
        } catch (const std::exception& e) {
            SetError(e.what());
        }
    }

    void OnOK() override {
        Napi::HandleScope scope(Env());
        Napi::Object result = Napi::Object::New(Env());

        // Modes
        Napi::Array modes = Napi::Array::New(Env(), caps_.modes.size());
        for (size_t i = 0; i < caps_.modes.size(); i++) {
            Napi::Object mode = Napi::Object::New(Env());
            mode.Set("width", Napi::Number::New(Env(), caps_.modes[i].width));
            mode.Set("height", Napi::Number::New(Env(), caps_.modes[i].height));
            mode.Set("minFps", Napi::Number::New(Env(), caps_.modes[i].minFps));
            mode.Set("maxFps", Napi::Number::New(Env(), caps_.modes[i].maxFps));
            modes.Set(static_cast<uint32_t>(i), mode);
        }
        result.Set("modes", modes);

        // Pixel formats
        Napi::Array pixelFormats = Napi::Array::New(Env(), caps_.pixelFormats.size());
        for (size_t i = 0; i < caps_.pixelFormats.size(); i++) {
            pixelFormats.Set(static_cast<uint32_t>(i), Napi::String::New(Env(), caps_.pixelFormats[i]));
        }
        result.Set("pixelFormats", pixelFormats);

        // Video codecs
        Napi::Array videoCodecs = Napi::Array::New(Env(), caps_.videoCodecs.size());
        for (size_t i = 0; i < caps_.videoCodecs.size(); i++) {
            videoCodecs.Set(static_cast<uint32_t>(i), Napi::String::New(Env(), caps_.videoCodecs[i]));
        }
        result.Set("videoCodecs", videoCodecs);

        deferred_.Resolve(result);
    }

    void OnError(const Napi::Error& error) override {
        deferred_.Reject(error.Value());
    }

    Napi::Promise GetPromise() { return deferred_.Promise(); }

private:
    std::string deviceId_;
    std::string platform_;
    DeviceCapabilitiesNative caps_;
    Napi::Promise::Deferred deferred_;
};

Napi::Value Device::ProbeCapabilitiesAsync(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Device object required").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    Napi::Object deviceObj = info[0].As<Napi::Object>();

    if (!deviceObj.Has("id") || !deviceObj.Has("platform")) {
        Napi::TypeError::New(env, "Device object must have 'id' and 'platform' properties").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string deviceId = deviceObj.Get("id").As<Napi::String>().Utf8Value();
    std::string platform = deviceObj.Get("platform").As<Napi::String>().Utf8Value();

    auto* worker = new ProbeCapabilitiesWorker(env, deviceId, platform);
    auto promise = worker->GetPromise();
    worker->Queue();

    return promise;
}

} // namespace ffmpeg
