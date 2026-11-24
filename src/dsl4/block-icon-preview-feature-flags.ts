interface BlockPreviewStartupEnvironment {
  readonly TW_BLOCK_ICON_PREVIEWS?: unknown;
  readonly location?: {readonly search?: unknown};
}

/** Project data cannot change previews; only the explicit launch environment is trusted. */
function readPreviewsFlag(environment: BlockPreviewStartupEnvironment): boolean {
  if (typeof environment.TW_BLOCK_ICON_PREVIEWS === 'boolean')
    return environment.TW_BLOCK_ICON_PREVIEWS;
  const search = environment.location?.search;
  return (
    typeof search !== 'string' || new URLSearchParams(search).get('twPlusBlockPreview') !== '0'
  );
}

/** Scene and action previews share the asset switch: on unless the launch turns them off. */
export function readDsl4BlockIconPreviewsFlag(
  environment: BlockPreviewStartupEnvironment = globalThis as BlockPreviewStartupEnvironment,
): boolean {
  return readPreviewsFlag(environment);
}

export function readDsl4AssetIconPreviewsFlag(
  environment: BlockPreviewStartupEnvironment = globalThis as BlockPreviewStartupEnvironment,
): boolean {
  return readPreviewsFlag(environment);
}

/** Fixed once at runtime startup, independently from saved story or block data. */
export const blockIconPreviewsEnabledAtStartup = readDsl4BlockIconPreviewsFlag();
export const assetIconPreviewsEnabledAtStartup = readDsl4AssetIconPreviewsFlag();
