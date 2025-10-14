#!/usr/bin/env node

/**
 * Generates src/ffmpeg/version.ts from externals/jellyfin-ffmpeg/FFMPEG_VERSION
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FFMPEG_VERSION_FILE = join(__dirname, '..', 'externals', 'jellyfin-ffmpeg', 'FFMPEG_VERSION');
const OUTPUT_FILE = join(__dirname, '..', 'src', 'ffmpeg', 'version.ts');

const main = () => {
  // Read FFmpeg version from file
  const ffmpegVersion = readFileSync(FFMPEG_VERSION_FILE, 'utf-8').trim();
  console.log(`FFmpeg version from file: ${ffmpegVersion}`);

  // Generate TypeScript file
  const content = `/**
 * FFmpeg Version
 * Auto-generated from externals/jellyfin-ffmpeg/FFMPEG_VERSION
 * DO NOT EDIT MANUALLY
 */

export const FFMPEG_VERSION = '${ffmpegVersion}';
`;

  // Write to file
  writeFileSync(OUTPUT_FILE, content);

  console.log(`✓ Generated ${OUTPUT_FILE} with version: ${ffmpegVersion}`);
};

main();
