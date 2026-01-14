#if defined(__linux__)

#include "device.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/ioctl.h>
#include <linux/videodev2.h>
#include <cstring>
#include <map>
#include <set>
#include <stdexcept>

namespace ffmpeg {

// V4L2 fourcc to FFmpeg pixel format mapping
struct PixelFormatMapping {
    uint32_t v4l2_fmt;
    const char* name;
    bool isCodec;
};

static const PixelFormatMapping kPixelFormatMappings[] = {
    { V4L2_PIX_FMT_YUYV, "yuyv422", false },
    { V4L2_PIX_FMT_UYVY, "uyvy422", false },
    { V4L2_PIX_FMT_YUV420, "yuv420p", false },
    { V4L2_PIX_FMT_YVU420, "yuv420p", false },
    { V4L2_PIX_FMT_NV12, "nv12", false },
    { V4L2_PIX_FMT_NV21, "nv21", false },
    { V4L2_PIX_FMT_RGB24, "rgb24", false },
    { V4L2_PIX_FMT_BGR24, "bgr24", false },
    { V4L2_PIX_FMT_RGB32, "rgba", false },
    { V4L2_PIX_FMT_BGR32, "bgra", false },
    { V4L2_PIX_FMT_GREY, "gray", false },
    { V4L2_PIX_FMT_MJPEG, "mjpeg", true },
    { V4L2_PIX_FMT_H264, "h264", true },
    { V4L2_PIX_FMT_HEVC, "hevc", true },
};

static const PixelFormatMapping* FindPixelFormatMapping(uint32_t v4l2_fmt) {
    for (size_t i = 0; i < sizeof(kPixelFormatMappings) / sizeof(kPixelFormatMappings[0]); i++) {
        if (kPixelFormatMappings[i].v4l2_fmt == v4l2_fmt) {
            return &kPixelFormatMappings[i];
        }
    }
    return nullptr;
}

std::vector<DeviceInfoNative> Device::ListDevicesNative(const std::string& mediaTypeFilter) {
    std::vector<DeviceInfoNative> devices;

    // V4L2 only handles video devices (audio uses ALSA)
    if (!mediaTypeFilter.empty() && mediaTypeFilter != "video") {
        return devices;
    }

    // Scan /dev/video* devices
    for (int i = 0; i < 64; i++) {
        char devpath[32];
        snprintf(devpath, sizeof(devpath), "/dev/video%d", i);

        int fd = open(devpath, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;

        struct v4l2_capability cap;
        memset(&cap, 0, sizeof(cap));

        if (ioctl(fd, VIDIOC_QUERYCAP, &cap) == -1) {
            close(fd);
            continue;
        }

        // Must be a capture device
        if (!(cap.capabilities & V4L2_CAP_VIDEO_CAPTURE)) {
            close(fd);
            continue;
        }

        DeviceInfoNative info;
        info.id = devpath;
        info.name = reinterpret_cast<const char*>(cap.card);
        info.ffmpegDevice = devpath;
        info.platform = "v4l2";
        info.mediaTypes.push_back("video");

        devices.push_back(info);
        close(fd);
    }

    return devices;
}

DeviceCapabilitiesNative Device::ProbeCapabilitiesNative(const std::string& deviceId,
                                                          const std::string& platform) {
    DeviceCapabilitiesNative caps;

    if (platform != "v4l2") {
        throw std::runtime_error("Invalid platform for Linux: " + platform);
    }

    int fd = open(deviceId.c_str(), O_RDONLY | O_NONBLOCK);
    if (fd < 0) {
        throw std::runtime_error("Cannot open device: " + deviceId);
    }

    std::set<std::string> seenModes;
    std::set<std::string> seenFormats;
    std::set<std::string> seenCodecs;

    // Enumerate formats
    struct v4l2_fmtdesc fmt;
    memset(&fmt, 0, sizeof(fmt));
    fmt.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;

    while (ioctl(fd, VIDIOC_ENUM_FMT, &fmt) == 0) {
        // Map pixel format
        const PixelFormatMapping* mapping = FindPixelFormatMapping(fmt.pixelformat);
        if (mapping) {
            if (mapping->isCodec) {
                seenCodecs.insert(mapping->name);
            } else {
                seenFormats.insert(mapping->name);
            }
        } else {
            // Try to create a fourcc string for unknown formats
            char fourcc[5] = {0};
            fourcc[0] = static_cast<char>(fmt.pixelformat & 0xFF);
            fourcc[1] = static_cast<char>((fmt.pixelformat >> 8) & 0xFF);
            fourcc[2] = static_cast<char>((fmt.pixelformat >> 16) & 0xFF);
            fourcc[3] = static_cast<char>((fmt.pixelformat >> 24) & 0xFF);

            // Only add if it looks like a printable fourcc
            bool printable = true;
            for (int i = 0; i < 4; i++) {
                if (fourcc[i] < 32 || fourcc[i] > 126) {
                    printable = false;
                    break;
                }
            }
            if (printable) {
                seenFormats.insert(std::string(fourcc));
            }
        }

        // Enumerate frame sizes for this format
        struct v4l2_frmsizeenum frmsize;
        memset(&frmsize, 0, sizeof(frmsize));
        frmsize.pixel_format = fmt.pixelformat;

        if (ioctl(fd, VIDIOC_ENUM_FRAMESIZES, &frmsize) == 0) {
            if (frmsize.type == V4L2_FRMSIZE_TYPE_DISCRETE) {
                // Discrete sizes - enumerate all of them
                for (frmsize.index = 0;
                     ioctl(fd, VIDIOC_ENUM_FRAMESIZES, &frmsize) == 0;
                     frmsize.index++) {

                    // Get frame intervals for this size
                    struct v4l2_frmivalenum frmival;
                    memset(&frmival, 0, sizeof(frmival));
                    frmival.pixel_format = fmt.pixelformat;
                    frmival.width = frmsize.discrete.width;
                    frmival.height = frmsize.discrete.height;

                    double minFps = 0, maxFps = 0;

                    if (ioctl(fd, VIDIOC_ENUM_FRAMEINTERVALS, &frmival) == 0) {
                        if (frmival.type == V4L2_FRMIVAL_TYPE_DISCRETE) {
                            for (frmival.index = 0;
                                 ioctl(fd, VIDIOC_ENUM_FRAMEINTERVALS, &frmival) == 0;
                                 frmival.index++) {
                                if (frmival.discrete.numerator > 0) {
                                    double fps = static_cast<double>(frmival.discrete.denominator) /
                                                 static_cast<double>(frmival.discrete.numerator);
                                    if (minFps == 0 || fps < minFps) minFps = fps;
                                    if (fps > maxFps) maxFps = fps;
                                }
                            }
                        } else if (frmival.type == V4L2_FRMIVAL_TYPE_STEPWISE ||
                                   frmival.type == V4L2_FRMIVAL_TYPE_CONTINUOUS) {
                            // Stepwise/continuous - use min and max
                            if (frmival.stepwise.max.numerator > 0) {
                                minFps = static_cast<double>(frmival.stepwise.max.denominator) /
                                         static_cast<double>(frmival.stepwise.max.numerator);
                            }
                            if (frmival.stepwise.min.numerator > 0) {
                                maxFps = static_cast<double>(frmival.stepwise.min.denominator) /
                                         static_cast<double>(frmival.stepwise.min.numerator);
                            }
                        }
                    }

                    // Default frame rates if not detected
                    if (minFps == 0) minFps = 1.0;
                    if (maxFps == 0) maxFps = 30.0;

                    VideoModeNative mode;
                    mode.width = static_cast<int>(frmsize.discrete.width);
                    mode.height = static_cast<int>(frmsize.discrete.height);
                    mode.minFps = minFps;
                    mode.maxFps = maxFps;

                    char modeKey[64];
                    snprintf(modeKey, sizeof(modeKey), "%dx%d@%.1f-%.1f",
                             mode.width, mode.height, mode.minFps, mode.maxFps);

                    if (seenModes.find(modeKey) == seenModes.end()) {
                        seenModes.insert(modeKey);
                        caps.modes.push_back(mode);
                    }
                }
            } else if (frmsize.type == V4L2_FRMSIZE_TYPE_STEPWISE ||
                       frmsize.type == V4L2_FRMSIZE_TYPE_CONTINUOUS) {
                // Stepwise - create representative modes at common resolutions
                struct Resolution {
                    int width;
                    int height;
                };
                static const Resolution commonResolutions[] = {
                    {640, 480},
                    {1280, 720},
                    {1920, 1080},
                    {2560, 1440},
                    {3840, 2160},
                };

                for (size_t r = 0; r < sizeof(commonResolutions) / sizeof(commonResolutions[0]); r++) {
                    int w = commonResolutions[r].width;
                    int h = commonResolutions[r].height;

                    if (w >= static_cast<int>(frmsize.stepwise.min_width) &&
                        w <= static_cast<int>(frmsize.stepwise.max_width) &&
                        h >= static_cast<int>(frmsize.stepwise.min_height) &&
                        h <= static_cast<int>(frmsize.stepwise.max_height)) {

                        VideoModeNative mode;
                        mode.width = w;
                        mode.height = h;
                        mode.minFps = 1.0;
                        mode.maxFps = 30.0;

                        char modeKey[64];
                        snprintf(modeKey, sizeof(modeKey), "%dx%d@%.1f-%.1f",
                                 mode.width, mode.height, mode.minFps, mode.maxFps);

                        if (seenModes.find(modeKey) == seenModes.end()) {
                            seenModes.insert(modeKey);
                            caps.modes.push_back(mode);
                        }
                    }
                }
            }
        }

        fmt.index++;
    }

    close(fd);

    // Copy to output vectors
    for (const auto& f : seenFormats) caps.pixelFormats.push_back(f);
    for (const auto& c : seenCodecs) caps.videoCodecs.push_back(c);

    return caps;
}

} // namespace ffmpeg

#endif // __linux__
