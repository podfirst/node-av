#!/usr/bin/env node

/**
 * Generate TypeScript constants for all available FFmpeg hardware device types
 * This extracts hardware device names directly from FFmpeg source code (hwcontext.c)
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getFFmpegPath } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FFMPEG_PATH = getFFmpegPath('');
const HWCONTEXT_PATH = join(FFMPEG_PATH, 'libavutil', 'hwcontext.c');
const OUTPUT_PATH = join(__dirname, '..', 'src', 'constants', 'hardware.ts');

console.log(`Using FFmpeg source from: ${FFMPEG_PATH}`);
console.log(`Reading hardware device types from: ${HWCONTEXT_PATH}`);

/**
 * Extract all hardware device type names from hwcontext.c
 */
const extractHardwareDevices = () => {
  if (!existsSync(HWCONTEXT_PATH)) {
    throw new Error(`Could not find hwcontext.c at ${HWCONTEXT_PATH}`);
  }

  const content = readFileSync(HWCONTEXT_PATH, 'utf8');

  // Find hw_type_names array
  // Format: [AV_HWDEVICE_TYPE_NAME] = "name",
  const arrayPattern = /static const char \*const hw_type_names\[\] = \{([^}]+)\}/s;
  const arrayMatch = arrayPattern.exec(content);

  if (!arrayMatch) {
    throw new Error('Could not find hw_type_names array in hwcontext.c');
  }

  const arrayContent = arrayMatch[1];

  // Extract all device entries
  // Format: [AV_HWDEVICE_TYPE_CUDA] = "cuda",
  const entryPattern = /\[AV_HWDEVICE_TYPE_(\w+)\]\s*=\s*"(\w+)"/g;
  const devices = [];
  let match;

  while ((match = entryPattern.exec(arrayContent)) !== null) {
    const enumName = match[1]; // e.g., "CUDA"
    const stringName = match[2]; // e.g., "cuda"
    devices.push({ enumName, stringName });
  }

  console.log(`Found ${devices.length} hardware device types`);

  // Manually add NONE (not in hw_type_names array but commonly used)
  devices.push({ enumName: 'NONE', stringName: 'none' });

  return devices.sort((a, b) => a.stringName.localeCompare(b.stringName));
};

/**
 * Generate TypeScript file content
 */
const generateTypeScript = (devices) => {
  const lines = [];

  // Header
  lines.push('/**');
  lines.push(' * Auto-generated FFmpeg hardware device type constants');
  lines.push(' * Generated from FFmpeg source code (hwcontext.c)');
  lines.push(' * DO NOT EDIT MANUALLY');
  lines.push(' */');
  lines.push('');

  // Brand symbol for type safety
  lines.push('// Brand symbol for type safety');
  lines.push("const __hw_device_type_brand = Symbol('__hw_device_type_brand');");
  lines.push('');

  // Type definition
  lines.push('// Hardware device type with type safety');
  lines.push("export type FFHWDeviceType = string & { readonly [__hw_device_type_brand]: 'hw_device_type' };");
  lines.push('');

  // Constants
  lines.push('// ============================================================================');
  lines.push(`// HARDWARE DEVICE TYPES (${devices.length} total)`);
  lines.push('// ============================================================================');
  lines.push('');

  for (const { enumName, stringName } of devices) {
    const constName = `FF_HWDEVICE_TYPE_${enumName.toUpperCase()}`;
    lines.push(`export const ${constName} = '${stringName}' as FFHWDeviceType;`);
  }

  lines.push('');

  return lines.join('\n');
};

// Main execution
try {
  const devices = extractHardwareDevices();
  const content = generateTypeScript(devices);

  writeFileSync(OUTPUT_PATH, content, 'utf8');

  console.log(`\n✅ Generated ${OUTPUT_PATH}`);
  console.log(`   ${devices.length} hardware device types`);
} catch (error) {
  console.error('❌ Error generating hardware constants:', error.message);
  process.exit(1);
}
