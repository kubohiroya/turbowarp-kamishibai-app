import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test} from 'vitest';
import {fileURLToPath} from 'node:url';

import {SITE_SHELL_CSS_URL} from '@kubohiroya/turbowarp-kamishibai-site-navigation';

import {renderSiteHeaderState, updateSiteHeaderScrollState} from '../site/site-shell.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const siteRoot = 'https://kubohiroya.github.io/turbowarp-kamishibai-app/';
const destinations = {
  top: {label: 'トップ', href: siteRoot},
  docs: {label: 'ドキュメント', href: 'https://kubohiroya.github.io/turbowarp-kamishibai-docs/'},
  workshops: {
    label: 'ワークショップ',
    href: 'https://kubohiroya.github.io/turbowarp-kamishibai-docs/workshops/',
  },
  samples: {label: '作品', href: 'https://kubohiroya.github.io/turbowarp-kamishibai-samples/'},
  downloads: {label: 'ダウンロード', href: `${siteRoot}downloads/`},
};
const pages = [
  {
    path: 'site/index.html',
    current: 'top',
    stylesheet: 'site-shell.css',
    script: 'site-shell.js',
    symbol: 'favicon.png',
  },
  {
    path: 'site/docs/index.html',
    current: 'docs',
    stylesheet: '../site-shell.css',
    script: '../site-shell.js',
    symbol: '../favicon.png',
  },
  {
    path: 'site/downloads/index.html',
    current: 'downloads',
    stylesheet: '../site-shell.css',
    script: '../site-shell.js',
    symbol: '../favicon.png',
  },
  {
    path: 'site/licenses/index.html',
    current: 'top',
    stylesheet: '../site-shell.css',
    script: '../site-shell.js',
    symbol: '../favicon.png',
  },
];

test('uses one accessible site header across the published entry pages', async () => {
  for (const page of pages) {
    const html = await readFile(path.join(projectRoot, page.path), 'utf8');

    assert.match(html, /<a class="skip-link" href="#main-content">本文へ移動<\/a>/u);
    assert.match(html, /<header class="site-header">/u);
    assert.match(
      html,
      new RegExp(
        `<link rel="stylesheet" href="${page.stylesheet.replaceAll('.', '\\.')}"\\s*/?>`,
        'u',
      ),
    );
    assert.match(
      html,
      new RegExp(
        `<script type="module" src="${page.script.replaceAll('.', '\\.')}"><\\/script>`,
        'u',
      ),
    );
    assert.match(
      html,
      new RegExp(
        `<img class="site-brand__symbol" src="${page.symbol.replaceAll('.', '\\.')}" width="40" height="40" alt=""\\s*/?>`,
        'u',
      ),
    );
    assert.match(html, /<main id="main-content">/u);
    assert.equal(
      (html.match(/<footer class="site-footer" data-site-footer-version="1">/gu) ?? []).length,
      1,
      `${page.path} must expose exactly one versioned site footer.`,
    );
    assert.match(html, /<p>© 2026 Hiroya Kubo<\/p>/u);
    assert.match(html, /各文書・作品・素材には個別の利用条件が適用されます。/u);
    assert.match(
      html,
      /<a\b(?=[^>]*class="site-footer__rights")(?=[^>]*href="https:\/\/kubohiroya\.github\.io\/turbowarp-kamishibai-app\/licenses\/")[^>]*>\s*ライセンス・権利表示\s*<\/a\s*>/u,
    );
    const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/u)?.[0] ?? '';
    assert(!footer.includes('github.com'), `${page.path} must not duplicate the GitHub link.`);

    for (const [section, {href, label}] of Object.entries(destinations)) {
      const currentAttribute = section === page.current ? ' aria-current="page"' : '';
      assert.match(
        html,
        new RegExp(
          `<a\\b(?=[^>]*class="site-nav__link")(?=[^>]*href="${href.replaceAll('.', '\\.')}")${
            currentAttribute ? '(?=[^>]*aria-current="page")' : '(?![^>]*aria-current="page")'
          }[^>]*>\\s*${label}\\s*<\\/a\\s*>`,
          'u',
        ),
      );
    }
    assert.equal(
      (html.match(/aria-current="page"/gu) ?? []).length,
      1,
      `${page.path} must expose exactly one current page.`,
    );
    assert.match(
      html,
      /<a\b(?=[^>]*class="site-repository")(?=[^>]*href="https:\/\/github\.com\/kubohiroya\/turbowarp-kamishibai-app")(?=[^>]*target="_blank")(?=[^>]*rel="noopener")(?=[^>]*aria-label="turbowarp-kamishibai-appをGitHubで開く")(?=[^>]*title="turbowarp-kamishibai-appをGitHubで開く")[^>]*>/u,
    );
    assert.match(html, /<svg class="site-repository__icon"[\s\S]*?aria-hidden="true">/u);
  }
});

test('keeps the shared navigation visible and operable on narrow screens', async () => {
  const css = await readFile(SITE_SHELL_CSS_URL, 'utf8');

  assert.match(css, /\.site-header\s*\{[\s\S]*?position:\s*sticky;/u);
  assert.match(css, /\.site-nav\s*\{[\s\S]*?overflow-x:\s*auto;/u);
  assert.match(css, /\.site-nav__link\s*\{[\s\S]*?min-height:\s*44px;/u);
  assert.match(css, /\.site-repository\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u);
  assert.match(
    css,
    /\.site-brand__symbol\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;/u,
  );
  assert.match(css, /@media \(max-width:\s*760px\)/u);
  assert.match(css, /\.site-header--hidden\s*\{[\s\S]*?transform:\s*translateY\(/u);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/u);
  assert.match(css, /@media print/u);
  assert.match(css, /\.site-footer\s*\{[\s\S]*?border-top:/u);
  assert.match(css, /\.site-footer__rights\s*\{[\s\S]*?min-height:\s*44px;/u);
  assert.match(css, /@media print[\s\S]*?\.site-footer\s*\{[\s\S]*?display:\s*none/u);
  assert.match(css, /:focus-visible/u);
});

test('hides on downward scroll and reopens on upward scroll or focus', () => {
  let state = {
    lastY: 0,
    accumulatedDelta: 0,
    hidden: false,
  };

  state = updateSiteHeaderScrollState(state, {
    scrollY: 80,
    headerHeight: 68,
    hasFocus: false,
  });
  assert.equal(state.hidden, true);

  state = updateSiteHeaderScrollState(state, {
    scrollY: 60,
    headerHeight: 68,
    hasFocus: false,
  });
  assert.equal(state.hidden, false);

  state = updateSiteHeaderScrollState(
    {...state, hidden: true},
    {
      scrollY: 120,
      headerHeight: 68,
      hasFocus: true,
    },
  );
  assert.equal(state.hidden, false);

  state = updateSiteHeaderScrollState(
    {...state, hidden: true},
    {
      scrollY: 0,
      headerHeight: 68,
      hasFocus: false,
    },
  );
  assert.equal(state.hidden, false);
});

test('renders the current site header visibility', () => {
  const classes = new Set<string>();
  const operations: [string, string, boolean][] = [];
  // `renderSiteHeaderState` reads one member of one element, so the double is that member. The cast
  // says it here rather than making the case build a whole `HTMLElement`.
  const header = {
    classList: {
      toggle(name: string, enabled: boolean) {
        operations.push(['toggle', name, enabled]);
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
  };

  renderSiteHeaderState(header as unknown as HTMLElement, {hidden: true});

  assert.deepEqual(operations, [['toggle', 'site-header--hidden', true]]);
  assert.deepEqual([...classes], ['site-header--hidden']);
});

test('records the Urashima source used for the site symbol', async () => {
  const metadata = JSON.parse(
    await readFile(path.join(projectRoot, 'site/favicon.source.json'), 'utf8'),
  );

  assert.equal(metadata.sourceName, 'Urashima-walk-1');
  assert.equal(metadata.sourceRepository, 'kubohiroya/turbowarp-kamishibai-samples');
  assert.equal(
    metadata.sourcePath,
    'stories/urashima/assets/images/963e926995791fde1b335fd4ba60d6d7.png',
  );
  assert.equal(
    metadata.sourceSha256,
    'f66c89b710324a7ca0809ab8cdc5acdfff83e988828a199403b7104ade6ec2df',
  );
  assert.equal(metadata.license, 'MPL-2.0');
  assert.equal(metadata.derivedAsset, 'favicon.png');
});

test('states TurboWarp Plus family membership with its icon on the top page', async () => {
  const [html, icon] = await Promise.all([
    readFile(path.join(projectRoot, 'site/index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'site/turbowarp-plus-icon.svg'), 'utf8'),
  ]);
  assert.match(icon, /aria-label="TurboWarp Plus"/u);
  assert.match(html, /<p class="turbowarp-plus-family">/u);
  assert.match(html, /src="turbowarp-plus-icon\.svg"/u);
  assert.match(html, /<strong>TurboWarp Plus<\/strong\s*>ファミリーのプロジェクトの一つです/u);
  assert.match(html, /href="https:\/\/kubohiroya\.github\.io\/turbowarp-plus-packages\/"/u);
  assert.match(
    html,
    /TurboWarpに機能を足す拡張・ツールチェーン・アプリケーション・ドキュメントサイト群です/u,
  );
  for (const readme of ['README.md', 'README.ja.md']) {
    const text = await readFile(path.join(projectRoot, readme), 'utf8');
    assert.match(text, /<img src="site\/turbowarp-plus-icon\.svg"/u);
    assert.match(text, /\]\(https:\/\/kubohiroya\.github\.io\/turbowarp-plus-packages\/\)/u);
  }
  assert.match(
    await readFile(path.join(projectRoot, 'README.ja.md'), 'utf8'),
    /TurboWarp紙芝居は、\[TurboWarp Plus\]\([^)]+\)ファミリーのプロジェクトの一つです/u,
  );
});
