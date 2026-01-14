#if defined(_WIN32)

#include "device.h"

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <dshow.h>
#include <dvdmedia.h>  // For VIDEOINFOHEADER2, FORMAT_VideoInfo2
#include <initguid.h>
#include <map>
#include <set>
#include <stdexcept>

#pragma comment(lib, "strmiids.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")

namespace ffmpeg {

// DirectShow subtype to FFmpeg codec/format mapping
// Note: We can't use std::map with GUID directly, so we use a lookup function
struct SubtypeMapping {
    GUID guid;
    const char* name;
    bool isCodec;
};

static const SubtypeMapping kSubtypeMappings[] = {
    { MEDIASUBTYPE_MJPG, "mjpeg", true },
    { MEDIASUBTYPE_H264, "h264", true },
    { MEDIASUBTYPE_YUY2, "yuyv422", false },
    { MEDIASUBTYPE_UYVY, "uyvy422", false },
    { MEDIASUBTYPE_NV12, "nv12", false },
    { MEDIASUBTYPE_RGB24, "rgb24", false },
    { MEDIASUBTYPE_RGB32, "bgra", false },
    { MEDIASUBTYPE_I420, "yuv420p", false },
    { MEDIASUBTYPE_IYUV, "yuv420p", false },
    { MEDIASUBTYPE_YV12, "yuv420p", false },
};

static const SubtypeMapping* FindSubtypeMapping(const GUID& subtype) {
    for (size_t i = 0; i < sizeof(kSubtypeMappings) / sizeof(kSubtypeMappings[0]); i++) {
        if (IsEqualGUID(subtype, kSubtypeMappings[i].guid)) {
            return &kSubtypeMappings[i];
        }
    }
    return nullptr;
}

// Helper to convert wide string to UTF-8
static std::string WideToUtf8(const wchar_t* wide) {
    if (!wide) return "";
    int len = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 0) return "";
    std::string result(len - 1, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, &result[0], len, nullptr, nullptr);
    return result;
}

// Helper to escape device name for FFmpeg dshow
static std::string EscapeDeviceName(const std::string& name) {
    std::string result;
    for (char c : name) {
        if (c == ':' || c == '\\' || c == '"') {
            result += '\\';
        }
        result += c;
    }
    return result;
}

// COM initializer RAII helper
class ComInitializer {
public:
    ComInitializer() {
        hr_ = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    }
    ~ComInitializer() {
        if (SUCCEEDED(hr_)) {
            CoUninitialize();
        }
    }
    bool succeeded() const { return SUCCEEDED(hr_); }
private:
    HRESULT hr_;
};

// COM pointer release helper
template<typename T>
static void SafeRelease(T** ptr) {
    if (*ptr) {
        (*ptr)->Release();
        *ptr = nullptr;
    }
}

std::vector<DeviceInfoNative> Device::ListDevicesNative(const std::string& mediaTypeFilter) {
    std::vector<DeviceInfoNative> devices;
    ComInitializer com;

    if (!com.succeeded()) {
        throw std::runtime_error("COM initialization failed");
    }

    auto enumCategory = [&](const CLSID& category, const std::string& mediaType) {
        ICreateDevEnum* devEnum = nullptr;
        IEnumMoniker* enumMoniker = nullptr;
        IMoniker* moniker = nullptr;

        HRESULT hr = CoCreateInstance(CLSID_SystemDeviceEnum, nullptr,
            CLSCTX_INPROC_SERVER, IID_ICreateDevEnum, (void**)&devEnum);
        if (FAILED(hr)) return;

        hr = devEnum->CreateClassEnumerator(category, &enumMoniker, 0);
        if (hr != S_OK) {
            SafeRelease(&devEnum);
            return;  // No devices or error
        }

        ULONG fetched;
        while (enumMoniker->Next(1, &moniker, &fetched) == S_OK) {
            IPropertyBag* propBag = nullptr;
            hr = moniker->BindToStorage(0, 0, IID_IPropertyBag, (void**)&propBag);

            if (SUCCEEDED(hr)) {
                VARIANT varName, varPath;
                VariantInit(&varName);
                VariantInit(&varPath);

                DeviceInfoNative info;
                info.platform = "dshow";
                info.mediaTypes.push_back(mediaType);

                // Get friendly name
                if (SUCCEEDED(propBag->Read(L"FriendlyName", &varName, 0)) &&
                    varName.vt == VT_BSTR) {
                    info.name = WideToUtf8(varName.bstrVal);
                }

                // Get device path (unique ID)
                if (SUCCEEDED(propBag->Read(L"DevicePath", &varPath, 0)) &&
                    varPath.vt == VT_BSTR) {
                    info.id = WideToUtf8(varPath.bstrVal);
                } else {
                    // Fallback to name as ID if no path
                    info.id = info.name;
                }

                // FFmpeg device string
                std::string escapedName = EscapeDeviceName(info.name);
                if (mediaType == "video") {
                    info.ffmpegDevice = "video=" + escapedName;
                } else {
                    info.ffmpegDevice = "audio=" + escapedName;
                }

                devices.push_back(info);

                VariantClear(&varName);
                VariantClear(&varPath);
                SafeRelease(&propBag);
            }

            SafeRelease(&moniker);
        }

        SafeRelease(&enumMoniker);
        SafeRelease(&devEnum);
    };

    if (mediaTypeFilter.empty() || mediaTypeFilter == "video") {
        enumCategory(CLSID_VideoInputDeviceCategory, "video");
    }
    if (mediaTypeFilter.empty() || mediaTypeFilter == "audio") {
        enumCategory(CLSID_AudioInputDeviceCategory, "audio");
    }

    return devices;
}

DeviceCapabilitiesNative Device::ProbeCapabilitiesNative(const std::string& deviceId,
                                                          const std::string& platform) {
    DeviceCapabilitiesNative caps;
    ComInitializer com;

    if (platform != "dshow") {
        throw std::runtime_error("Invalid platform for Windows: " + platform);
    }

    if (!com.succeeded()) {
        throw std::runtime_error("COM initialization failed");
    }

    // Find the device by ID and bind to filter
    ICreateDevEnum* devEnum = nullptr;
    IEnumMoniker* enumMoniker = nullptr;
    IMoniker* moniker = nullptr;
    IBaseFilter* filter = nullptr;

    HRESULT hr = CoCreateInstance(CLSID_SystemDeviceEnum, nullptr,
        CLSCTX_INPROC_SERVER, IID_ICreateDevEnum, (void**)&devEnum);
    if (FAILED(hr)) {
        throw std::runtime_error("Failed to create device enumerator");
    }

    hr = devEnum->CreateClassEnumerator(CLSID_VideoInputDeviceCategory, &enumMoniker, 0);
    if (hr != S_OK) {
        SafeRelease(&devEnum);
        throw std::runtime_error("No video devices found");
    }

    bool found = false;
    ULONG fetched;
    while (enumMoniker->Next(1, &moniker, &fetched) == S_OK) {
        IPropertyBag* propBag = nullptr;
        if (SUCCEEDED(moniker->BindToStorage(0, 0, IID_IPropertyBag, (void**)&propBag))) {
            VARIANT varPath;
            VariantInit(&varPath);

            std::string thisId;
            if (SUCCEEDED(propBag->Read(L"DevicePath", &varPath, 0)) &&
                varPath.vt == VT_BSTR) {
                thisId = WideToUtf8(varPath.bstrVal);
            } else {
                VARIANT varName;
                VariantInit(&varName);
                if (SUCCEEDED(propBag->Read(L"FriendlyName", &varName, 0))) {
                    thisId = WideToUtf8(varName.bstrVal);
                }
                VariantClear(&varName);
            }
            VariantClear(&varPath);

            if (thisId == deviceId) {
                hr = moniker->BindToObject(0, 0, IID_IBaseFilter, (void**)&filter);
                found = true;
            }

            SafeRelease(&propBag);
        }
        SafeRelease(&moniker);
        if (found) break;
    }

    SafeRelease(&enumMoniker);
    SafeRelease(&devEnum);

    if (!found || !filter) {
        throw std::runtime_error("Device not found: " + deviceId);
    }

    // Get IAMStreamConfig from the filter's output pin
    IEnumPins* enumPins = nullptr;
    IPin* pin = nullptr;
    IAMStreamConfig* streamConfig = nullptr;

    hr = filter->EnumPins(&enumPins);
    if (SUCCEEDED(hr)) {
        while (enumPins->Next(1, &pin, nullptr) == S_OK) {
            PIN_DIRECTION dir;
            pin->QueryDirection(&dir);
            if (dir == PINDIR_OUTPUT) {
                if (SUCCEEDED(pin->QueryInterface(IID_IAMStreamConfig,
                    (void**)&streamConfig))) {
                    break;
                }
            }
            SafeRelease(&pin);
        }
        SafeRelease(&enumPins);
    }

    if (!streamConfig) {
        SafeRelease(&filter);
        throw std::runtime_error("Could not get stream config interface");
    }

    // Enumerate capabilities
    int count = 0, size = 0;
    hr = streamConfig->GetNumberOfCapabilities(&count, &size);

    if (SUCCEEDED(hr) && size == sizeof(VIDEO_STREAM_CONFIG_CAPS)) {
        std::set<std::string> seenModes;
        std::set<std::string> seenFormats;
        std::set<std::string> seenCodecs;

        for (int i = 0; i < count; i++) {
            AM_MEDIA_TYPE* pmt = nullptr;
            VIDEO_STREAM_CONFIG_CAPS scc;
            memset(&scc, 0, sizeof(scc));

            hr = streamConfig->GetStreamCaps(i, &pmt, (BYTE*)&scc);
            if (SUCCEEDED(hr) && pmt) {
                // Extract video info
                if (pmt->formattype == FORMAT_VideoInfo && pmt->pbFormat) {
                    VIDEOINFOHEADER* vih = (VIDEOINFOHEADER*)pmt->pbFormat;

                    VideoModeNative mode;
                    mode.width = vih->bmiHeader.biWidth;
                    mode.height = abs(vih->bmiHeader.biHeight);

                    // Frame rate from VIDEO_STREAM_CONFIG_CAPS
                    if (scc.MaxFrameInterval > 0) {
                        mode.minFps = 10000000.0 / scc.MaxFrameInterval;
                    } else {
                        mode.minFps = 1.0;
                    }
                    if (scc.MinFrameInterval > 0) {
                        mode.maxFps = 10000000.0 / scc.MinFrameInterval;
                    } else {
                        mode.maxFps = 30.0;
                    }

                    char modeKey[64];
                    snprintf(modeKey, sizeof(modeKey), "%dx%d@%.1f-%.1f",
                             mode.width, mode.height, mode.minFps, mode.maxFps);

                    if (seenModes.find(modeKey) == seenModes.end()) {
                        seenModes.insert(modeKey);
                        caps.modes.push_back(mode);
                    }
                } else if (pmt->formattype == FORMAT_VideoInfo2 && pmt->pbFormat) {
                    VIDEOINFOHEADER2* vih2 = (VIDEOINFOHEADER2*)pmt->pbFormat;

                    VideoModeNative mode;
                    mode.width = vih2->bmiHeader.biWidth;
                    mode.height = abs(vih2->bmiHeader.biHeight);

                    if (scc.MaxFrameInterval > 0) {
                        mode.minFps = 10000000.0 / scc.MaxFrameInterval;
                    } else {
                        mode.minFps = 1.0;
                    }
                    if (scc.MinFrameInterval > 0) {
                        mode.maxFps = 10000000.0 / scc.MinFrameInterval;
                    } else {
                        mode.maxFps = 30.0;
                    }

                    char modeKey[64];
                    snprintf(modeKey, sizeof(modeKey), "%dx%d@%.1f-%.1f",
                             mode.width, mode.height, mode.minFps, mode.maxFps);

                    if (seenModes.find(modeKey) == seenModes.end()) {
                        seenModes.insert(modeKey);
                        caps.modes.push_back(mode);
                    }
                }

                // Map subtype to format/codec
                const SubtypeMapping* mapping = FindSubtypeMapping(pmt->subtype);
                if (mapping) {
                    if (mapping->isCodec) {
                        seenCodecs.insert(mapping->name);
                    } else {
                        seenFormats.insert(mapping->name);
                    }
                }

                // Free media type
                if (pmt->cbFormat > 0 && pmt->pbFormat) {
                    CoTaskMemFree(pmt->pbFormat);
                }
                if (pmt->pUnk) {
                    pmt->pUnk->Release();
                }
                CoTaskMemFree(pmt);
            }
        }

        for (const auto& fmt : seenFormats) caps.pixelFormats.push_back(fmt);
        for (const auto& codec : seenCodecs) caps.videoCodecs.push_back(codec);
    }

    SafeRelease(&streamConfig);
    SafeRelease(&pin);
    SafeRelease(&filter);

    return caps;
}

} // namespace ffmpeg

#endif // _WIN32
