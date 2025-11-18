import { execSync } from 'child_process';
import { arch, platform, type } from 'node:os';

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
export function getPlatform(): NodeJS.Platform {
  if (process.env.npm_config_os) {
    if (!process.env.npm_config_cpu) {
      throw new Error('npm_config_cpu is required when npm_config_os is set');
    }

    return process.env.npm_config_os as NodeJS.Platform;
  }

  return platform();
}

/**
 * Get the current platform type.
 *
 * @returns The current platform type
 *
 * @internal
 */
export function getPlatformType(): string {
  return type();
}

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
export function getArchitecture(): ARCH {
  if (process.env.npm_config_cpu) {
    if (!process.env.npm_config_os) {
      throw new Error('npm_config_os is required when npm_config_cpu is set');
    }

    return process.env.npm_config_cpu as ARCH;
  }

  const sysPlatform = getPlatform();
  let sysArch = arch() as ARCH;

  if (sysPlatform === 'linux') {
    try {
      const output = execSync('cat /proc/cpuinfo | grep "model name"', { encoding: 'utf8' });
      const modelName = output.trim().split(':')[1].trim();

      if (modelName.includes('ARMv6')) {
        sysArch = 'arm6';
      } else if (modelName.includes('ARMv7')) {
        sysArch = 'arm7';
      }
    } catch {
      //
    }
  }

  return sysArch;
}
