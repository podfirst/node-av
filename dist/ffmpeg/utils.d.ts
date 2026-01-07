export type ARCH = 'arm' | 'arm6' | 'arm7' | 'arm64' | 'ia32' | 'loong64' | 'mips' | 'mipsel' | 'ppc' | 'ppc64' | 'riscv64' | 's390' | 's390x' | 'x64';
/**
 * Get the current platform.
 *
 * If the environment variable `npm_config_os` is set, its value will be used
 * instead. This is useful for cross-compilation scenarios.
 *
 * @returns The current platform
 *
 * @internal
 */
export declare function getPlatform(): NodeJS.Platform;
/**
 * Get the current platform type.
 *
 * @returns The current platform type
 *
 * @internal
 */
export declare function getPlatformType(): string;
/**
 * Get the current architecture.
 *
 * If the environment variable `npm_config_cpu` is set, its value will be used
 * instead. This is useful for cross-compilation scenarios.
 *
 * @returns The current architecture
 *
 * @internal
 */
export declare function getArchitecture(): ARCH;
