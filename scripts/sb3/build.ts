import process from 'node:process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {buildSb3, createDeterministicSb3} from '@kubohiroya/sb3-toolchain';
import type {BuildSb3Options} from '@kubohiroya/sb3-toolchain';

import {withTitleBuildMetadataSource} from './title-build-metadata.ts';

/**
 * What both entry points read off their own options. `create` and `build` take the toolchain's own
 * functions, so the results keep the toolchain's types.
 */
interface KamishibaiSb3Options {
  buildDate?: unknown;
  environment?: Record<string, string | undefined>;
  faviconPath?: string;
  now?: Date;
  packageJsonPath?: string;
  sourceDirectory?: string;
  version?: unknown;
  create?: typeof createDeterministicSb3;
  build?: typeof buildSb3;
  outputPath?: string;
  confirmReplace?: BuildSb3Options['confirmReplace'];
  yes?: boolean;
}

/** The staged app source the title metadata step hands back to each entry point. */
interface KamishibaiTitleSource {
  metadata: unknown;
  sourceDirectory: string;
}

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const defaultKamishibaiPackageJsonPath = path.join(projectRoot, 'package.json');
export const defaultKamishibaiFaviconPath = path.join(projectRoot, 'site', 'favicon.png');
export const defaultKamishibaiOutputPath = path.join(projectRoot, 'tmp', 'kamishibai.sb3');

function titleSourceOptions(options: KamishibaiSb3Options) {
  return {
    buildDate: options.buildDate,
    environment: options.environment ?? process.env,
    faviconPath: options.faviconPath ?? defaultKamishibaiFaviconPath,
    now: options.now ?? new Date(),
    packageJsonPath: options.packageJsonPath ?? defaultKamishibaiPackageJsonPath,
    sourceDirectory: options.sourceDirectory,
    version: options.version,
  };
}

export async function createKamishibaiSb3(options: KamishibaiSb3Options = {}) {
  const create = options.create ?? createDeterministicSb3;
  return withTitleBuildMetadataSource(
    titleSourceOptions(options),
    async ({metadata, sourceDirectory}: KamishibaiTitleSource) => ({
      ...(await create(sourceDirectory)),
      titleBuildMetadata: metadata,
    }),
  );
}

export async function buildKamishibaiSb3(options: KamishibaiSb3Options = {}) {
  const build = options.build ?? buildSb3;
  const outputPath = options.outputPath ?? defaultKamishibaiOutputPath;
  return withTitleBuildMetadataSource(
    titleSourceOptions(options),
    async ({metadata, sourceDirectory}: KamishibaiTitleSource) => ({
      ...(await build({
        ...(options.confirmReplace ? {confirmReplace: options.confirmReplace} : {}),
        outputPath,
        sourceDirectory,
        yes: options.yes ?? false,
      })),
      titleBuildMetadata: metadata,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('Use pnpm release:dsl4:update to create the transient current release artifact.');
  process.exitCode = 1;
}
