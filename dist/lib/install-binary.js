#!/usr/bin/env node
/**
 * PodFirst: Download node-av.node binary from GitHub releases
 *
 * This script downloads the prebuilt native addon for the current platform
 * from GitHub releases when using the fork via git reference.
 */
import { chmodSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { type } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Open } from 'unzipper';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __require = createRequire(import.meta.url);
const releasesUrl = 'https://api.github.com/repos/podfirst/node-av/releases';
const pJson = __require('../../package.json');
// Platform detection
const platform = process.platform;
const arch = process.arch;
function getPlatformSuffix() {
    if (platform === 'win32') {
        // Use MinGW build by default (has device capture support)
        const useMingW = type() !== 'Windows_NT';
        return useMingW ? `win32-${arch}-mingw` : `win32-${arch}-msvc`;
    }
    return `${platform}-${arch}`;
}
const platformSuffix = getPlatformSuffix();
const binaryDir = resolve(__dirname, '..', '..', 'binary');
const binaryPath = resolve(binaryDir, 'node-av.node');
// Skip if binary already exists
if (existsSync(binaryPath)) {
    console.log(`[node-av] Binary already exists at ${binaryPath}`);
    process.exit(0);
}
// Skip if SKIP_BINARY is set
if (process.env.SKIP_BINARY === 'true') {
    console.log('[node-av] Skipping binary download (SKIP_BINARY=true)');
    process.exit(0);
}
async function getReleaseAssets(version) {
    const url = `${releasesUrl}/tags/v${version}`;
    console.log(`[node-av] Fetching release info from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return {
        assets: data.assets.map((asset) => ({
            name: asset.name,
            browser_download_url: asset.browser_download_url,
        })),
    };
}
async function downloadAndExtract(url, destPath) {
    console.log(`[node-av] Downloading from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    if (!response.body) {
        throw new Error('Response body is null');
    }
    mkdirSync(binaryDir, { recursive: true });
    const zipPath = `${destPath}.zip`;
    const writeStream = createWriteStream(zipPath);
    const reader = response.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            writeStream.write(value);
        }
    }
    finally {
        reader.releaseLock();
        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    }
    // Extract ZIP
    console.log(`[node-av] Extracting to ${destPath}...`);
    const directory = await Open.file(zipPath);
    if (!directory.files?.length) {
        throw new Error('No files found in ZIP archive');
    }
    // Find the node-av.node file in the archive
    const nodeFile = directory.files.find(f => f.path.endsWith('node-av.node'));
    if (!nodeFile) {
        throw new Error('node-av.node not found in ZIP archive');
    }
    await new Promise((resolve, reject) => {
        nodeFile.stream()
            .pipe(createWriteStream(destPath))
            .on('error', reject)
            .on('finish', resolve);
    });
    // Clean up ZIP
    rmSync(zipPath);
    // Make executable on Unix
    if (platform !== 'win32') {
        chmodSync(destPath, 0o755);
    }
    console.log(`[node-av] Binary installed at ${destPath}`);
}
async function main() {
    console.log(`[node-av] Platform: ${platform}/${arch} (${platformSuffix})`);
    const release = await getReleaseAssets(pJson.version);
    // Look for the platform-specific ZIP file
    // Format: node-av-{platform}-v{version}.zip
    const assetName = `node-av-${platformSuffix}-v${pJson.version}.zip`;
    const asset = release.assets.find(a => a.name === assetName);
    if (!asset) {
        console.warn(`[node-av] Warning: No prebuilt binary found for ${platformSuffix}`);
        console.warn(`[node-av] Available assets: ${release.assets.map(a => a.name).join(', ')}`);
        console.warn('[node-av] You may need to build from source.');
        process.exit(0);
    }
    await downloadAndExtract(asset.browser_download_url, binaryPath);
    console.log('[node-av] Done!');
}
main().catch((error) => {
    console.warn('[node-av] Warning: Failed to download binary:', error?.message ?? error);
    console.warn('[node-av] The package will continue without prebuilt binary.');
    process.exit(0);
});
//# sourceMappingURL=install-binary.js.map