import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {siteReleaseMetadata} from './sb3/dsl4-published-assets.ts';

/** The published artifact bytes one catalog entry advertises, once its release is public. */
export interface DownloadCatalogArtifact {
  readonly buildDate: string;
  readonly filename: string;
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
  readonly sourceCommit?: string;
  readonly sourceIdentity?: string;
}

interface DownloadCatalogEntryBase {
  readonly description: string;
  readonly docsUrl?: string;
  readonly recommended?: boolean;
  readonly series: string;
  readonly status: string;
  readonly statusKind: string;
  readonly updatedAt: string;
  readonly version: string;
}

/**
 * One release the download page renders as a card. An entry either advertises artifact bytes, or
 * carries the labels the card shows in their place, so the renderer never has to guess.
 */
export type DownloadCatalogEntry =
  | (DownloadCatalogEntryBase & {readonly artifact: DownloadCatalogArtifact})
  | (DownloadCatalogEntryBase & {
      readonly artifact?: undefined;
      readonly unavailableLabel: string;
      readonly unavailableNote: string;
    });

export const downloadCardsPlaceholder = '{{DOWNLOAD_CARDS}}';
export const dsl4DocsUrl =
  'https://kubohiroya.github.io/turbowarp-kamishibai-docs/dsl-author-guides/dsl-4.0-author-guide/';
const releasePins = JSON.parse(
  readFileSync(new URL('../test/fixtures/dsl4/release-pins.json', import.meta.url), 'utf8'),
);
const dsl4ReleaseMetadata = siteReleaseMetadata(
  JSON.parse(
    readFileSync(
      new URL(`../release-metadata/${releasePins.release.version}.json`, import.meta.url),
      'utf8',
    ),
  ),
);
const dsl4PublishedArtifact =
  dsl4ReleaseMetadata.state === 'published'
    ? {
        buildDate: dsl4ReleaseMetadata.buildDate,
        ...dsl4ReleaseMetadata.artifact,
        sourceIdentity: dsl4ReleaseMetadata.sourceIdentity,
      }
    : undefined;
const dsl4IsStable = !dsl4ReleaseMetadata.version.includes('-');
const recommendDsl4 = dsl4IsStable && Boolean(dsl4PublishedArtifact);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export const downloadCatalog: readonly DownloadCatalogEntry[] = deepFreeze([
  {
    artifact: dsl4PublishedArtifact,
    description:
      'YAML、local preview、自己完結SB3を利用できる4.0系列です。既存の3.1／3.2作品には引き続き3.2.3を利用できます。',
    docsUrl: dsl4DocsUrl,
    series: '4.0',
    recommended: recommendDsl4,
    status: dsl4IsStable ? '安定版' : 'リリース候補',
    statusKind: dsl4IsStable ? 'stable' : 'development',
    unavailableLabel: '公開準備中',
    unavailableNote: '検証済みGitHub Releaseの公開後にダウンロードできます。',
    updatedAt: dsl4ReleaseMetadata.buildDate,
    version: dsl4ReleaseMetadata.version,
  },
  {
    artifact: {
      buildDate: '2026-08-06',
      filename: 'kamishibai-3.2.sb3',
      url: 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v3.2.3/kamishibai-3.2.sb3',
      sha256: '9c94368b68297e68c3b37a0e2b15a81c07461dd78a2d0c876b0805ef07ea1d11',
      size: 853_938,
      sourceCommit: '28015ac9ff5221f371e8bd0357a7750ce40bbf7c',
    },
    description:
      '3.1と3.2の既存作品を扱う安定版です。YAMLで新しく制作する場合は4.0を利用できます。',
    recommended: !recommendDsl4,
    series: '3.2',
    status: '安定版',
    statusKind: 'stable',
    updatedAt: '2026-08-06',
    version: '3.2.3',
  },
  {
    artifact: {
      buildDate: '2026-08-04',
      filename: 'kamishibai-3.1.sb3',
      url: 'https://github.com/kubohiroya/turbowarp-kamishibai-app/releases/download/v3.1.9/kamishibai-3.1.sb3',
      sha256: '31a4358a459407624aabe748e9b3ba74d08667d0550f06078a72da100d3ae018',
      size: 633_465,
      sourceCommit: '96b1fe66e052f10da2938389f98fd15c95fcfdee',
    },
    description:
      '3.1系列で作成した既存作品を扱うための最終安定版です。新しく作品を作る場合は3.2を利用してください。',
    series: '3.1',
    status: '過去の安定版',
    statusKind: 'past',
    updatedAt: '2026-08-04',
    version: '3.1.9',
  },
]);

assert.equal(
  new Set(downloadCatalog.map(({series}) => series)).size,
  downloadCatalog.length,
  'Download catalog series must be unique.',
);
assert.equal(
  downloadCatalog.filter(({recommended}) => recommended).length,
  1,
  'The download catalog must have exactly one recommended release.',
);
for (const entry of downloadCatalog) {
  assert(
    typeof entry.series === 'string' && entry.series.length > 0,
    'Catalog series is required.',
  );
  assert(
    typeof entry.version === 'string' && entry.version.length > 0,
    'Catalog version is required.',
  );
  assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}$/u, `${entry.series} date is invalid.`);
  if (entry.artifact) {
    assert.match(
      entry.artifact.buildDate,
      /^\d{4}-\d{2}-\d{2}$/u,
      `${entry.series} date is invalid.`,
    );
    assert(
      Number.isSafeInteger(entry.artifact.size) && entry.artifact.size > 0,
      `${entry.series} size is invalid.`,
    );
    assert.equal(
      entry.updatedAt,
      entry.artifact.buildDate,
      `${entry.series} update date differs from its artifact build date.`,
    );
    assert.match(entry.artifact.sha256, /^[0-9a-f]{64}$/u, `${entry.series} SHA-256 is invalid.`);
    assert.match(
      entry.artifact.url,
      new RegExp(
        `^https://github\\.com${escapeRegExp(
          releasePins.release.repositoryPath,
        )}/releases/download/v${escapeRegExp(entry.version)}/${escapeRegExp(
          entry.artifact.filename,
        )}$`,
        'u',
      ),
      `${entry.series} release asset URL is invalid.`,
    );
    if (entry.artifact.sourceIdentity) {
      assert.match(
        entry.artifact.sourceIdentity,
        /^sha256:[0-9a-f]{64}$/u,
        `${entry.series} source identity is invalid.`,
      );
    } else {
      assert.match(
        String(entry.artifact.sourceCommit),
        /^[0-9a-f]{40}$/u,
        `${entry.series} source commit is invalid.`,
      );
    }
  } else {
    assert(
      entry.unavailableLabel && entry.unavailableNote,
      `${entry.series} unavailable text is required.`,
    );
  }
}

export const downloadableReleases = deepFreeze(
  downloadCatalog
    .filter(({artifact}) => artifact)
    .map(({artifact, series, version}) => ({
      ...(artifact as DownloadCatalogArtifact),
      series,
      version,
    })),
);

export const recommendedDownload = downloadCatalog.find(({recommended}) => recommended);
assert(recommendedDownload?.artifact, 'The recommended download must have a published artifact.');

function escapeHtml(value: string) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderActions(entry: DownloadCatalogEntry) {
  const actions = [];
  if (entry.artifact) {
    actions.push(
      `<a class="button" href="${escapeHtml(entry.artifact.filename)}" download>` +
        `📁 ${escapeHtml(entry.series)}のSB3をダウンロード</a>`,
    );
    if (entry.series === '4.0') {
      actions.push(
        `<a class="button" href="https://kubohiroya.github.io/turbowarp-kamishibai-app/players/${escapeHtml(entry.version)}/">` +
          'ブラウザーで開く</a>',
      );
    }
  }
  if (!entry.artifact) {
    actions.push(
      `<span class="button button--disabled" aria-disabled="true">` +
        `${escapeHtml(entry.unavailableLabel)}</span>`,
    );
  }
  return actions.map((action) => `        ${action}`).join('\n');
}

function renderFileInfo(entry: DownloadCatalogEntry) {
  if (!entry.artifact) return escapeHtml(entry.unavailableNote);
  return (
    `ファイル: <code>${escapeHtml(entry.artifact.filename)}</code>` +
    `（${escapeHtml(entry.version)}）・${formatFileSize(entry.artifact.size)}`
  );
}

function formatFileSize(size: number) {
  const megabytes = (size / 1_000_000).toLocaleString('ja-JP', {maximumFractionDigits: 1});
  return `${megabytes} MB（${size.toLocaleString('ja-JP')} bytes）`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function renderCard(entry: DownloadCatalogEntry) {
  return `    <article data-version="${escapeHtml(entry.series)}">
      <h2>kamishibai ${escapeHtml(entry.series)} <span class="status status--${escapeHtml(entry.statusKind)}">${escapeHtml(entry.status)}</span></h2>
      <p>${escapeHtml(entry.description)}</p>
      <p class="updated-at">更新日: <time datetime="${entry.updatedAt}">${formatDisplayDate(entry.updatedAt)}</time></p>
      <div class="actions">
${renderActions(entry)}
      </div>
      <p class="file-info">${renderFileInfo(entry)}</p>
    </article>`;
}

export function renderDownloadCards(template: string) {
  const placeholderCount = template.split(downloadCardsPlaceholder).length - 1;
  assert.equal(
    placeholderCount,
    1,
    `Expected one download-card placeholder, found ${placeholderCount}.`,
  );
  return template.replace(downloadCardsPlaceholder, downloadCatalog.map(renderCard).join('\n\n'));
}
