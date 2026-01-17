/**
 * Native bindings loader
 *
 * This module loads the native C++ bindings compiled by node-gyp.
 * All native classes are accessed through this single entry point.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { type } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Get the asar.unpacked equivalent of a path.
 * Electron unpacks native modules to app.asar.unpacked/ instead of app.asar/
 * but __dirname resolves to app.asar/, causing existsSync() to fail.
 */
function getUnpackedPath(p) {
    return p.replace(/\.asar([/\\])/g, '.asar.unpacked$1');
}
/**
 * Load the native binding
 *
 * @returns The loaded native binding interface
 *
 * @internal
 */
function loadBinding() {
    const require = createRequire(import.meta.url);
    const errors = [];
    // Detect platform
    const platform = process.platform;
    const arch = process.arch;
    const platformArch = `${platform}-${arch}`;
    const loadLocal = process.env.AV_FROM_SOURCE === '1';
    // Local build directory (--build-from-source)
    try {
        const releasePath = resolve(__dirname, '..', '..', 'build', 'Release', 'node-av.node');
        const binaryPath = resolve(__dirname, '..', '..', 'binary', 'node-av.node');
        const rootPath = resolve(__dirname, '..', '..', 'node-av.node');
        // Include asar.unpacked paths for Electron packaged apps
        const localPath = [
            releasePath,
            getUnpackedPath(releasePath),
            binaryPath,
            getUnpackedPath(binaryPath),
            rootPath,
            getUnpackedPath(rootPath),
        ];
        for (const path of localPath) {
            if (existsSync(path)) {
                try {
                    return require(path);
                }
                catch (err) {
                    errors.push(new Error(`Local build loading from ${path} failed: ${err}`));
                }
            }
        }
    }
    catch (err) {
        errors.push(new Error(`Local build loading failed: ${err}`));
    }
    if (!loadLocal) {
        // PodFirst: Try loading from binary folder (downloaded from GitHub releases)
        // This is the preferred method when using the fork via git reference
        // Check both regular and asar.unpacked paths (Electron extracts native modules to .unpacked)
        const binaryNodePath = resolve(__dirname, '..', '..', 'binary', 'node-av.node');
        const unpackedBinaryPath = getUnpackedPath(binaryNodePath);
        for (const nodePath of [binaryNodePath, unpackedBinaryPath]) {
            if (existsSync(nodePath)) {
                try {
                    return require(nodePath);
                }
                catch (err) {
                    errors.push(new Error(`Binary folder loading from ${nodePath} failed: ${err}`));
                }
            }
        }
        // Fallback: Try npm packages (for backwards compatibility)
        // For Windows, detect MinGW vs MSVC environment
        if (platform === 'win32') {
            const useMingW = type() !== 'Windows_NT';
            if (useMingW) {
                try {
                    const packageName = `@seydx/node-av-${platformArch}-mingw`;
                    return require(`${packageName}/node-av.node`);
                }
                catch (err) {
                    errors.push(new Error(`MinGW package not found or loading failed: ${err}`));
                }
            }
            // Fallback to MSVC
            try {
                const packageName = `@seydx/node-av-${platformArch}-msvc`;
                return require(`${packageName}/node-av.node`);
            }
            catch (err) {
                errors.push(new Error(`MSVC package not found or loading failed: ${err}`));
            }
        }
        else {
            // Non-Windows platforms
            try {
                const packageName = `@seydx/node-av-${platformArch}`;
                return require(`${packageName}/node-av.node`);
            }
            catch (err) {
                errors.push(new Error(`Platform package not found or loading failed: ${err}`));
            }
        }
    }
    // All attempts failed
    const errorMessages = errors.map((e) => e.message).join('\n  ');
    // prettier-ignore
    throw new Error(`Could not load the node-av native binding for ${platformArch}.\n` +
        `Errors:\n  ${errorMessages}\n\n`);
}
// Load the native binding with fallback logic
const bindings = loadBinding();
export { bindings };
//# sourceMappingURL=binding.js.map