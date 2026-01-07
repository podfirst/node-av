/**
 * Model type for Whisper downloads
 */
export type WhisperModelType = 'ggml' | 'vad';
/**
 * Options for downloading a Whisper model
 */
export interface DownloadOptions {
    model: WhisperModelName | WhisperVADModelName;
    outputPath?: string;
    type?: WhisperModelType;
}
/**
 * Standard GGML Whisper models
 */
export declare const WHISPER_MODELS: readonly ["tiny", "tiny.en", "tiny-q5_1", "tiny.en-q5_1", "tiny-q8_0", "base", "base.en", "base-q5_1", "base.en-q5_1", "base-q8_0", "small", "small.en", "small.en-tdrz", "small-q5_1", "small.en-q5_1", "small-q8_0", "medium", "medium.en", "medium-q5_0", "medium.en-q5_0", "medium-q8_0", "large-v1", "large-v2", "large-v2-q5_0", "large-v2-q8_0", "large-v3", "large-v3-q5_0", "large-v3-turbo", "large-v3-turbo-q5_0", "large-v3-turbo-q8_0"];
/**
 * Whisper VAD (Voice Activity Detection) models
 */
export declare const WHISPER_VAD_MODELS: readonly ["silero-v5.1.2", "silero-v6.2.0"];
export type WhisperModelName = (typeof WHISPER_MODELS)[number];
export type WhisperVADModelName = (typeof WHISPER_VAD_MODELS)[number];
/**
 * Whisper.cpp model downloader utilities.
 *
 * Provides static methods for downloading GGML and VAD models from HuggingFace,
 * validating model names, and checking model availability. Supports automatic
 * model type detection and prevents concurrent downloads of the same model.
 *
 * @example
 * ```typescript
 * import { WhisperDownloader } from 'node-av';
 *
 * // Download a GGML model
 * const modelPath = await WhisperDownloader.downloadModel({
 *   model: 'base',
 *   outputPath: './models'
 * });
 *
 * // Download a VAD model
 * const vadPath = await WhisperDownloader.downloadVADModel('silero-v5.1.2', './models');
 *
 * // Check available models
 * const categories = WhisperDownloader.getModelsByCategory();
 * console.log(categories); // Map { 'tiny' => ['tiny', 'tiny.en', ...], ... }
 * ```
 */
export declare class WhisperDownloader {
    static readonly DEFAULT_MODEL_PATH: string;
    private static readonly DEFAULT_SRC;
    private static readonly DEFAULT_PFX;
    private static readonly TDRZ_SRC;
    private static readonly TDRZ_PFX;
    private static readonly VAD_SRC;
    private static readonly VAD_PFX;
    private static readonly activeDownloads;
    private constructor();
    /**
     * Check if a model name is a valid GGML model.
     *
     * Validates whether the provided string matches one of the available
     * GGML Whisper model names.
     *
     * @param model - Model name to validate
     *
     * @returns True if the model is a valid GGML model name
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * console.log(WhisperDownloader.isValidModel('base'));      // true
     * console.log(WhisperDownloader.isValidModel('large-v3'));  // true
     * console.log(WhisperDownloader.isValidModel('invalid'));   // false
     * ```
     */
    static isValidModel(model: string): model is WhisperModelName;
    /**
     * Check if a model name is a valid VAD model.
     *
     * Validates whether the provided string matches one of the available
     * Silero VAD model names.
     *
     * @param model - Model name to validate
     *
     * @returns True if the model is a valid VAD model name
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * console.log(WhisperDownloader.isValidVADModel('silero-v5.1.2')); // true
     * console.log(WhisperDownloader.isValidVADModel('invalid'));       // false
     * ```
     */
    static isValidVADModel(model: string): model is WhisperVADModelName;
    /**
     * Get all available GGML models grouped by category.
     *
     * Returns a map of model categories (tiny, base, small, medium, large)
     * with their corresponding model variants.
     *
     * @returns Map of category names to model name arrays
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * const categories = WhisperDownloader.getModelsByCategory();
     * console.log(categories.get('base'));
     * // ['base', 'base.en', 'base-q5_1', 'base.en-q5_1', 'base-q8_0']
     *
     * // List all categories
     * for (const [category, models] of categories) {
     *   console.log(`${category}: ${models.length} variants`);
     * }
     * ```
     */
    static getModelsByCategory(): Map<string, string[]>;
    /**
     * Get the download URL for a model.
     *
     * Constructs the HuggingFace download URL for a given model name.
     * Automatically detects whether it's a GGML or VAD model if type is not specified.
     * Handles special models like tinydiarize variants.
     *
     * @param model - Model name
     *
     * @param type - Model type (auto-detected if not provided)
     *
     * @returns Full download URL for the model
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * // GGML model URL
     * const url = WhisperDownloader.getModelUrl('base');
     * console.log(url);
     * // 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
     *
     * // VAD model URL
     * const vadUrl = WhisperDownloader.getModelUrl('silero-v5.1.2');
     * console.log(vadUrl);
     * // 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin'
     * ```
     */
    static getModelUrl(model: string, type?: WhisperModelType): string;
    /**
     * Check if a model file already exists.
     *
     * Checks whether a model file has already been downloaded to the specified path.
     * Useful for skipping redundant downloads.
     *
     * @param model - Model name
     *
     * @param outputPath - Directory path to check
     *
     * @returns True if the model file exists
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * if (WhisperDownloader.modelExists('base', './models')) {
     *   console.log('Model already downloaded');
     * } else {
     *   await WhisperDownloader.downloadModel({
     *     model: 'base',
     *     outputPath: './models'
     *   });
     * }
     * ```
     */
    static modelExists(model: string, outputPath: string): boolean;
    /**
     * Find whisper-cli executable in system PATH.
     *
     * Searches for whisper-cli binary in system PATH and local build directory.
     * Returns the path to the executable if found.
     *
     * @returns Path to whisper-cli executable, or null if not found
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * const cliPath = await WhisperDownloader.findWhisperCli();
     * if (cliPath) {
     *   console.log(`Found whisper-cli at: ${cliPath}`);
     * } else {
     *   console.log('whisper-cli not found');
     * }
     * ```
     */
    static findWhisperCli(): Promise<string | null>;
    /**
     * Download a Whisper model file.
     *
     * Downloads a GGML or VAD model from HuggingFace to the specified directory.
     * Automatically detects model type based on model name if not specified.
     * Prevents race conditions when the same model is downloaded concurrently.
     * Returns immediately if the model file already exists.
     *
     * @param options - Download configuration options
     *
     * @returns Path to the downloaded model file
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * // Download GGML model (auto-detected)
     * const path = await WhisperDownloader.downloadModel({
     *   model: 'base',
     *   outputPath: './models'
     * });
     * console.log(`Downloaded to: ${path}`);
     *
     * // Download VAD model (auto-detected)
     * const vadPath = await WhisperDownloader.downloadModel({
     *   model: 'silero-v5.1.2',
     *   outputPath: './models'
     * });
     *
     * // Explicit type specification
     * const explicitPath = await WhisperDownloader.downloadModel({
     *   model: 'base',
     *   outputPath: './models',
     *   type: 'ggml'
     * });
     * ```
     */
    static downloadModel(options: DownloadOptions): Promise<string>;
    /**
     * Download a VAD model (convenience method).
     *
     * Convenience wrapper for downloading VAD models without specifying type.
     * Equivalent to calling downloadModel() with type: 'vad'.
     *
     * @param model - VAD model name
     *
     * @param outputPath - Directory path for download (default: current directory)
     *
     * @returns Path to the downloaded VAD model file
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * const vadPath = await WhisperDownloader.downloadVADModel(
     *   'silero-v5.1.2',
     *   './models'
     * );
     * console.log(`VAD model downloaded to: ${vadPath}`);
     * ```
     */
    static downloadVADModel(model: WhisperVADModelName, outputPath?: string): Promise<string>;
    /**
     * Download multiple Whisper models.
     *
     * Downloads multiple models sequentially to avoid overwhelming the network.
     * Each model is validated and downloaded using the same logic as downloadModel().
     *
     * @param models - Array of model names to download
     *
     * @param outputPath - Directory path for downloads (default: current directory)
     *
     * @param type - Model type for all models (auto-detected if not provided)
     *
     * @returns Array of paths to downloaded model files
     *
     * @example
     * ```typescript
     * import { WhisperDownloader } from 'node-av';
     *
     * // Download multiple GGML models
     * const paths = await WhisperDownloader.downloadModels(
     *   ['tiny', 'base', 'small'],
     *   './models'
     * );
     * console.log(`Downloaded ${paths.length} models`);
     *
     * // Download multiple VAD models
     * const vadPaths = await WhisperDownloader.downloadModels(
     *   ['silero-v5.1.2', 'silero-v6.2.0'],
     *   './models',
     *   'vad'
     * );
     * ```
     */
    static downloadModels(models: (WhisperModelName | WhisperVADModelName)[], outputPath?: string, type?: WhisperModelType): Promise<string[]>;
    /**
     * Follow HTTP redirects recursively to download a file.
     *
     * Handles HTTP redirects (301, 302, 307, 308) up to a maximum of 5 redirects.
     * Downloads the file to the specified output path.
     *
     * @param url - URL to download
     *
     * @param outputPath - Local file path to save the download
     *
     * @param redirectCount - Current redirect count (used internally)
     *
     * @returns Promise that resolves when the download is complete
     *
     * @internal
     */
    private static followRedirect;
}
