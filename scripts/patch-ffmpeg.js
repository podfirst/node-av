#!/usr/bin/env node

/**
 * Apply FFmpeg patches using quilt
 * This script applies all patches from externals/jellyfin-ffmpeg/debian/patches
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JELLYFIN_FFMPEG_PATH = join(__dirname, '..', 'externals', 'jellyfin-ffmpeg');

const main = () => {
  console.log('Applying FFmpeg patches with quilt...');

  // Check if jellyfin-ffmpeg directory exists
  if (!existsSync(JELLYFIN_FFMPEG_PATH)) {
    console.error(`Error: jellyfin-ffmpeg directory not found at ${JELLYFIN_FFMPEG_PATH}`);
    process.exit(1);
  }

  // Check if debian/patches directory exists
  const patchesDir = join(JELLYFIN_FFMPEG_PATH, 'debian', 'patches');
  if (!existsSync(patchesDir)) {
    console.error(`Error: patches directory not found at ${patchesDir}`);
    process.exit(1);
  }

  try {
    // Change to jellyfin-ffmpeg directory and apply patches
    console.log(`Working directory: ${JELLYFIN_FFMPEG_PATH}`);
    console.log('Running: quilt push -a\n');

    execSync('quilt upgrade || true && quilt pop -af || true && quilt push -a', {
      cwd: JELLYFIN_FFMPEG_PATH,
      stdio: 'inherit',
      env: {
        ...process.env,
        QUILT_PATCHES: patchesDir,
      },
    });

    console.log('\n✓ All patches applied successfully!');
  } catch (error) {
    console.error('\n✗ Failed to apply patches');
    console.error(error.message);
    process.exit(1);
  }
};

main();
