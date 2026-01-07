#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { type } from 'node:os';
import { log, spawnRebuild, useGlobalFFmpeg } from './ffmpeg.js';

const require = createRequire(import.meta.url);

const tryLoadPrebuilt = () => {
  // Try to load from platform-specific package (optionalDependencies)
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    const useMingW = type() !== 'Windows_NT';
    if (useMingW) {
      try {
        const packageName = `@seydx/node-av-${platform}-${arch}-mingw`;
        // Check if the package is installed (don't check for .node file yet - it may be extracted by postinstall)
        const packageJsonPath = require.resolve(`${packageName}/package.json`);
        if (existsSync(packageJsonPath)) {
          log(`Using prebuilt binary from ${packageName}`);
          return true;
        }
      } catch {
        // Package not installed
      }
    }

    // Fallback to MSVC
    try {
      const packageName = `@seydx/node-av-${platform}-${arch}-msvc`;
      // Check if the package is installed (don't check for .node file yet - it may be extracted by postinstall)
      const packageJsonPath = require.resolve(`${packageName}/package.json`);
      if (existsSync(packageJsonPath)) {
        log(`Using prebuilt binary from ${packageName}`);
        return true;
      }
    } catch {
      // Package not installed
    }
  } else {
    const packageName = `@seydx/node-av-${platform}-${arch}`;

    try {
      // Check if the package is installed (don't check for .node file yet - it may be extracted by postinstall)
      const packageJsonPath = require.resolve(`${packageName}/package.json`);
      if (existsSync(packageJsonPath)) {
        log(`Using prebuilt binary from ${packageName}`);
        return true;
      }
    } catch {
      // Package not installed
    }
  }

  // Try local binary folder (for development)
  const localBinary = join(process.cwd(), 'binary', 'node-av.node');
  if (existsSync(localBinary)) {
    log('Using local binary from binary/node-av.node');
    return true;
  }

  return false;
};

const buildFromSource = () => {
  log('Building from source...');

  // Check for required build dependencies
  const missingDeps = [];

  try {
    require('node-addon-api');
  } catch {
    missingDeps.push('node-addon-api');
  }

  try {
    require('node-gyp');
  } catch {
    missingDeps.push('node-gyp');
  }

  if (missingDeps.length > 0) {
    log('');
    log(`Missing build dependencies: ${missingDeps.join(', ')}`);
    log('Please install:');
    log(`  npm install --save-dev ${missingDeps.join(' ')}`);
    log('');
    log('Then run npm install again.');
    process.exit(1);
  }

  log('Building native bindings...');

  const status = spawnRebuild();
  if (status !== 0) {
    log('');
    log('Build failed. Please ensure you have:');
    log('  - FFmpeg 7.1+ libraries and headers installed');
    log('  - Python 3.12+ installed');
    log('  - A C++ compiler with C++17 support');
    log('');
    log('See https://github.com/seydx/node-av for detailed requirements');
    process.exit(status);
  }

  log('Build completed successfully!');
};

(async () => {
  try {
    // PodFirst: Skip install script when using git reference (postinstall will download binary)
    if (process.env.SKIP_BINARY === 'true' || process.env.npm_package_resolved?.includes('github:')) {
      log('Skipping install check (binary will be downloaded in postinstall)');
      return;
    }

    const shouldBuildFromSource = process.env.npm_config_build_from_source === 'true';

    // Priority 1: User explicitly wants to build from source
    if (shouldBuildFromSource) {
      if (!useGlobalFFmpeg()) {
        log('--build-from-source specified but no FFmpeg libraries found');
        log('Please install FFmpeg 7.1+ with development headers');
        process.exit(1);
      }
      // Fall through to build logic below
    } else {
      // Priority 2: Try to use prebuilt binary if not forcing source build
      if (tryLoadPrebuilt()) {
        return;
      }
    }

    // Build from source (either requested or as fallback)
    if (useGlobalFFmpeg()) {
      // Determine why we're building
      if (shouldBuildFromSource) {
        log('Building from source as requested');
      } else {
        log('No prebuilt binary available for your platform');
        log('System FFmpeg detected, building from source automatically');
      }

      buildFromSource();
    } else {
      // No FFmpeg found and no prebuilt available
      log('⚠️  No prebuilt binary and no system FFmpeg found');
      log('See https://github.com/seydx/node-av for installation instructions');
      process.exit(1);
    }
  } catch (err) {
    console.error(`node-av: Installation error: ${err.message}`);
    process.exit(1);
  }
})();
