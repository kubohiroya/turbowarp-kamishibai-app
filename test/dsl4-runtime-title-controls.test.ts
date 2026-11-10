import assert from 'node:assert/strict';
import {test} from 'vitest';

import {createDsl4RuntimeTitleControls} from '../src/dsl4/platform/runtime-title-controls.js';
import {
  createFakeDocument,
  findByAttribute,
  requireByAttribute,
  type FakeElement,
} from './helpers/fake-dom.ts';
import {requireDefined, requireString} from './helpers/require-value.ts';

/**
 * Read the root the controls mounted.
 *
 * `runtime-title-controls` republishes the element the external app-shell factory returns, and that
 * package types it as `HTMLElement`. The module's own `Dsl4RuntimeUiElement` says the narrower
 * surface is the contract, and this suite drives it with the fake, so the read is named once here.
 */
function controlsRoot(controls: {element: unknown}): FakeElement {
  return controls.element as unknown as FakeElement;
}

test('centers the title close icon without relying on font metrics', () => {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  let closeCount = 0;
  const controls = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {
      en: {website: 'Official Website', close: 'Close'},
      ja: {website: '公式Webサイト', close: '閉じる'},
    },
    onWebsite() {},
    onClose() {
      closeCount += 1;
    },
  });

  const close = requireByAttribute(controlsRoot(controls), 'data-dsl4-title-action', 'close');
  const icon = requireByAttribute(close, 'data-dsl4-close-icon', 'true');
  const lines = findByAttribute(icon, 'data-dsl4-close-icon-line', 'true');
  assert.equal(lines.length, 2);
  assert.match(
    requireString(close.style.cssText, 'the close button cssText'),
    /left:92\.5%;top:1\.1111%;width:6\.6667%;height:8\.8889%/u,
  );
  assert.doesNotMatch(requireString(close.style.cssText, 'the close button cssText'), /font:/u);
  assert.equal(close.textContent, '');
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  for (const line of lines) {
    assert.match(
      requireString(line.style.cssText, 'a close icon line cssText'),
      /left:50%;top:50%/u,
    );
    assert.match(
      requireString(line.style.cssText, 'a close icon line cssText'),
      /transform:translate\(-50%,-50%\) rotate\((?:-)?45deg\)/u,
    );
    assert.match(
      requireString(line.style.cssText, 'a close icon line cssText'),
      /transform-origin:center/u,
    );
  }
  const [firstLine, secondLine] = lines;
  assert.notEqual(
    requireDefined(firstLine, 'the first close icon line').style.cssText,
    requireDefined(secondLine, 'the second close icon line').style.cssText,
  );

  controls.show('ja');
  assert.equal(close.getAttribute('aria-label'), '閉じる');
  assert.equal(close.getAttribute('title'), '閉じる');
  close.click();
  assert.equal(closeCount, 1);
});

test('splits the title into a prominent start action and a quieter website action', () => {
  const document = createFakeDocument();
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const calls: string[] = [];
  const controls = createDsl4RuntimeTitleControls({
    document,
    mount,
    locales: {
      en: {website: 'Open Official Website', close: 'Close', start: 'Start Kamishibai'},
      ja: {website: '公式Webサイトを開く', close: '閉じる', start: '紙芝居を始める'},
    },
    onWebsite() {
      calls.push('website');
    },
    onClose() {
      calls.push('close');
    },
  });

  const root = controlsRoot(controls);
  const start = requireByAttribute(root, 'data-dsl4-title-action', 'start');
  const website = requireByAttribute(root, 'data-dsl4-title-action', 'website');
  const startCss = requireString(start.style.cssText, 'the start button cssText');
  const websiteCss = requireString(website.style.cssText, 'the website button cssText');
  assert.match(startCss, /width:40%;height:20%/u);
  assert.match(startCss, /background:#007d66/u);
  assert.match(websiteCss, /width:32%;height:13\.3333%/u);
  assert.match(websiteCss, /background:#c6eadf/u);
  assert.equal(start.textContent, 'Start Kamishibai');

  controls.show('ja');
  assert.equal(start.textContent, '紙芝居を始める');
  assert.equal(start.getAttribute('aria-label'), '紙芝居を始める');
  start.click();
  website.click();
  assert.deepEqual(calls, ['close', 'website']);

  controls.dispose();
  assert.equal(findByAttribute(mount, 'data-dsl4-title-action', 'start').length, 0);
});
