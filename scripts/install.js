#!/usr/bin/env node

/**
 * Post-install script for platform-specific packages.
 * Extracts the compressed .node binary from the ZIP file.
 */

import { createWriteStream, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Open } from 'unzipper';

const __dirname = dirname(fileURLToPath(import.meta.url));
const zipPath = join(__dirname, 'node-av.node.zip');
const targetPath = join(__dirname, 'node-av.node');

async function extractBinary() {
  // Skip if already extracted
  if (existsSync(targetPath)) {
    console.log('Binary already extracted, skipping...');
    return;
  }

  // Skip if ZIP doesn't exist (dev mode or manual installation)
  if (!existsSync(zipPath)) {
    console.warn('Warning: node-av.node.zip not found, skipping extraction');
    return;
  }

  try {
    console.log('Extracting node-av binary from ZIP...');

    const directory = await Open.file(zipPath);

    // Find the .node file in the ZIP
    const nodeFile = directory.files.find((file) => file.path.endsWith('.node'));

    if (!nodeFile) {
      throw new Error('No .node file found in ZIP archive');
    }

    // Extract to target path
    await new Promise((resolve, reject) => {
      nodeFile.stream().pipe(createWriteStream(targetPath)).on('finish', resolve).on('error', reject);
    });

    console.log('Binary extracted successfully');

    // Clean up ZIP file after extraction to save space
    unlinkSync(zipPath);
    console.log('Cleaned up ZIP file');
  } catch (error) {
    console.error('Failed to extract binary:', error.message);
    // Don't throw - allow installation to continue even if extraction fails
    // This prevents blocking npm install in edge cases
    process.exit(0);
  }
}

extractBinary().catch((error) => {
  console.error('Unexpected error during binary extraction:', error);
  process.exit(0);
});
