#!/usr/bin/env node

/**
 * Synchronizes FFmpeg version from externals/jellyfin-ffmpeg/FFMPEG_VERSION to package.json
 * This ensures consistency across the codebase
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FFMPEG_VERSION_FILE = join(__dirname, '..', 'externals', 'jellyfin-ffmpeg', 'FFMPEG_VERSION');
const PACKAGE_JSON_FILE = join(__dirname, '..', 'package.json');

const main = () => {
  // Read FFmpeg version from file
  const ffmpegVersion = readFileSync(FFMPEG_VERSION_FILE, 'utf-8').trim();
  console.log(`FFmpeg version from file: ${ffmpegVersion}`);

  // Read package.json
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_FILE, 'utf-8'));

  // Update ffmpegVersion field
  packageJson.ffmpegVersion = ffmpegVersion;

  // Write back to package.json
  writeFileSync(PACKAGE_JSON_FILE, JSON.stringify(packageJson, null, 2) + '\n');

  console.log(`✓ Updated package.json ffmpegVersion to: ${ffmpegVersion}`);
};

main();
