import assert from 'node:assert/strict';
import {test} from 'vitest';

import {createDsl4LoadingScreenPresenter} from '../src/dsl4/platform/loading-screen-presenter.js';
import {
  createDsl4RuntimeApplicationMenu,
  dsl4RuntimeApplicationMenuDefaultIcons,
} from '../src/dsl4/platform/runtime-application-menu.js';
import {createDsl4RuntimeSourceChooser} from '../src/dsl4/platform/runtime-source-chooser.js';
import {createDsl4RuntimeTitleControls} from '../src/dsl4/platform/runtime-title-controls.js';
import type {FakeElement} from './helpers/fake-dom.ts';
import {
  createFakeDocument,
  findByAttribute,
  requireByAttribute,
  requireFirst,
} from './helpers/fake-dom.ts';

/**
 * The app-shell package types the element it hands back as the platform's `HTMLElement`, while
 * these suites drive it through an injected fake. Read it as what is actually there.
 */
const asFake = (element: unknown) => element as unknown as FakeElement;

const menuLocales = Object.freeze({
  en: Object.freeze({
    open: 'Open',
    reload: 'Reload',
    build: 'Build',
    about: 'About',
    language: 'Language',
  }),
  ja: Object.freeze({
    open: '台本を開く',
    reload: 'もう一度',
    build: '配布用SB3を作る',
    about: 'アプリ情報',
    language: '言語',
  }),
});

/** A fake document with one mounted stage element, which every case here builds first. */
function stageMount() {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  return {document, mount};
}

test('title controls render injected Kamishibai copy, icon, and stage-relative close glyph', () => {
  const {document, mount} = stageMount();
  const controls = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {
      en: {website: 'Official Website', close: 'Close'},
      ja: {website: '公式Webサイト', close: '閉じる'},
    },
    websiteIconUrl: 'https://example.test/site.png',
    onWebsite() {},
    onClose() {},
  });

  const root = requireByAttribute(mount, 'data-dsl4-title-controls', 'true');
  assert.equal(root, controls.element);
  assert.equal(root.getAttribute('aria-label'), 'Kamishibai title controls');

  const website = requireByAttribute(root, 'data-dsl4-title-action', 'website');
  assert.equal(website.getAttribute('aria-label'), 'Official Website');
  assert.equal(controls.show('ja'), 'ja');
  assert.equal(website.getAttribute('aria-label'), '公式Webサイト');
  // An unknown locale falls back to the Kamishibai default rather than the browser language.
  // An unsupported locale is rejected by the surface, not by the type, so ask for one.
  assert.equal(controls.show('fr' as 'en'), 'en');

  const icon = requireFirst(website.children, 'website icon');
  assert.equal(icon.style.backgroundImage, 'url("https://example.test/site.png")');
  assert.equal(icon.style.backgroundSize, 'contain');
  assert.match(String(icon.style.cssText), /width:5.8333cqw;height:5.8333cqw/u);

  // The stage scales with its container, so the close glyph must stay in container units.
  const lines = findByAttribute(root, 'data-dsl4-close-icon-line', 'true');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(String(line.style.cssText), /width:4\.1667cqw;height:\.625cqw/u);
    assert.doesNotMatch(String(line.style.cssText), /px/u);
  }

  controls.dispose();
  assert.equal(findByAttribute(mount, 'data-dsl4-title-controls', 'true').length, 0);
});

test('title controls invoke injected actions and report their failures', async () => {
  const {document, mount} = stageMount();
  const failures: unknown[] = [];
  let closes = 0;
  const controls = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {
      en: {website: 'Official Website', close: 'Close'},
      ja: {website: '公式Webサイト', close: '閉じる'},
    },
    onWebsite() {
      return Promise.reject(new Error('website unavailable'));
    },
    onClose() {
      closes += 1;
    },
    onError(error) {
      failures.push(error);
    },
  });

  requireByAttribute(asFake(controls.element), 'data-dsl4-title-action', 'close').click();
  requireByAttribute(asFake(controls.element), 'data-dsl4-title-action', 'website').click();
  await Promise.resolve();
  assert.equal(closes, 1);
  assert.equal(failures.length, 1);
  assert.match(String((failures[0] as Error | undefined)?.message), /website unavailable/u);
  controls.dispose();
});

test('application menu keeps the Kamishibai icon set, recolor, and stage-relative layout', () => {
  const {document, mount} = stageMount();
  const menu = createDsl4RuntimeApplicationMenu({
    document,
    mount,
    locales: menuLocales,
    onOpen() {},
    onReload() {},
    onBuild() {},
    onAbout() {},
    onLocaleChange() {},
  });

  const root = requireByAttribute(mount, 'data-dsl4-application-menu', 'true');
  assert.equal(root.getAttribute('aria-label'), 'Kamishibai application menu');

  const menuActionNames = ['open', 'reload', 'build', 'about', 'language'] as const;
  const button = (action: string) =>
    requireByAttribute(asFake(root), 'data-dsl4-menu-action', action);
  for (const action of menuActionNames) {
    const icon = requireFirst(button(action).children, `${action} icon`);
    assert.equal(
      icon.style.backgroundImage,
      `url("${dsl4RuntimeApplicationMenuDefaultIcons[action]}")`,
    );
    // The shipped artwork is dark line art, so the stage buttons recolor it instead of
    // carrying a second icon set.
    assert.equal(icon.style.filter, 'invert(1) brightness(1.7) saturate(.35)');
    assert.match(String(icon.style.cssText), /width:6\.6667cqw;height:6\.6667cqw/u);
  }

  assert.equal(button('about').style.top, '58.8889%');
  assert.equal(button('build').hidden, true);

  menu.setBuildState({visible: true, enabled: true, status: 'Ready'});
  assert.equal(button('build').hidden, false);
  assert.equal(button('build').style.top, '43%');
  assert.equal(button('build').style.width, '80%');
  assert.equal(button('about').style.top, '68%');

  const status = requireByAttribute(root, 'data-dsl4-menu-build-status', 'true');
  assert.equal(status.textContent, 'Ready');
  assert.equal(status.style.color, '#004d40');

  menu.setBuildState({visible: false});
  assert.equal(button('about').style.top, '58.8889%');
  assert.equal(status.textContent, '');
  menu.dispose();
});

test('application menu toggles locale through the injected callback', async () => {
  const {document, mount} = stageMount();
  const locales: unknown[] = [];
  const menu = createDsl4RuntimeApplicationMenu({
    document,
    mount,
    locales: menuLocales,
    onOpen() {},
    onReload() {},
    onAbout() {},
    onLocaleChange(locale) {
      locales.push(locale);
    },
    reloadEnabled: false,
  });
  const root = menu.element;
  const open = requireByAttribute(asFake(root), 'data-dsl4-menu-action', 'open');
  const reload = requireByAttribute(asFake(root), 'data-dsl4-menu-action', 'reload');
  assert.equal(menu.show('en'), 'en');
  assert.equal(open.getAttribute('aria-label'), 'Open');
  assert.equal(reload.disabled, true);
  assert.equal(reload.style.cursor, 'not-allowed');

  requireByAttribute(asFake(root), 'data-dsl4-menu-action', 'language').click();
  await Promise.resolve();
  assert.deepEqual(locales, ['ja']);
  assert.equal(open.getAttribute('aria-label'), '台本を開く');

  menu.setReloadEnabled(true);
  assert.equal(reload.disabled, false);
  assert.equal(reload.style.cursor, 'pointer');
  menu.dispose();
});

test('source chooser centers the injected Kamishibai choices', () => {
  const {document, mount} = stageMount();
  const chooser = createDsl4RuntimeSourceChooser({
    document,
    mount,
    locales: {
      en: {openFile: 'Open story file', openProject: 'Open project directory', cancel: 'Cancel'},
      ja: {openFile: '台本ファイルを開く', openProject: 'プロジェクトを開く', cancel: 'やめる'},
    },
    onFile() {},
    onProject() {},
    onCancel() {},
  });

  const root = requireByAttribute(mount, 'data-dsl4-source-chooser', 'true');
  assert.equal(root, chooser.element);
  chooser.show('en', {fileEnabled: false});
  for (const choice of ['file', 'project', 'cancel']) {
    const button = requireByAttribute(root, 'data-dsl4-source-choice', choice);
    assert.match(String(button.style.cssText), /justify-content:center;text-align:center;/u);
    assert.doesNotMatch(String(button.style.cssText), /grid-template-columns/u);
  }
  assert.equal(requireByAttribute(root, 'data-dsl4-source-choice', 'file').disabled, true);
  assert.equal(requireByAttribute(root, 'data-dsl4-source-choice', 'project').disabled, false);
  chooser.dispose();
});

test('loading screen stays hidden until the story supplies loading artwork', () => {
  const {document, mount} = stageMount();
  const presenter = createDsl4LoadingScreenPresenter({document, mount});
  const root = requireByAttribute(mount, 'data-dsl4-loading-screen', 'true');
  assert.equal(root.getAttribute('aria-hidden'), 'true');

  presenter.setLoading({visible: true});
  assert.equal(root.style.display, 'none');

  presenter.setLoading({visible: true, resources: {backdrop: 'blob:backdrop', costumes: []}});
  assert.equal(root.style.display, 'flex');
  assert.equal(requireFirst(root.children, 'loading backdrop').src, 'blob:backdrop');

  presenter.setLoading({visible: false, resources: {backdrop: 'blob:backdrop'}});
  assert.equal(root.style.display, 'none');
  presenter.dispose();
  assert.equal(findByAttribute(mount, 'data-dsl4-loading-screen', 'true').length, 0);
});
