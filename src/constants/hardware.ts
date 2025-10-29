/**
 * Auto-generated FFmpeg hardware device type constants
 * Generated from FFmpeg source code (hwcontext.c)
 * DO NOT EDIT MANUALLY
 */

// Brand symbol for type safety
const __hw_device_type_brand = Symbol('__hw_device_type_brand');

// Hardware device type with type safety
export type FFHWDeviceType = string & { readonly [__hw_device_type_brand]: 'hw_device_type' };

// ============================================================================
// HARDWARE DEVICE TYPES (16 total)
// ============================================================================

export const FF_HWDEVICE_TYPE_AMF = 'amf' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_CUDA = 'cuda' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_D3D11VA = 'd3d11va' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_D3D12VA = 'd3d12va' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_DRM = 'drm' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_DXVA2 = 'dxva2' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_MEDIACODEC = 'mediacodec' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_NONE = 'none' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_OHCODEC = 'ohcodec' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_OPENCL = 'opencl' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_QSV = 'qsv' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_RKMPP = 'rkmpp' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_VAAPI = 'vaapi' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_VDPAU = 'vdpau' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_VIDEOTOOLBOX = 'videotoolbox' as FFHWDeviceType;
export const FF_HWDEVICE_TYPE_VULKAN = 'vulkan' as FFHWDeviceType;
