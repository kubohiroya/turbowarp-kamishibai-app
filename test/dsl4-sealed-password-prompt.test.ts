import assert from 'node:assert/strict';
import {test} from 'vitest';

import {createDsl4SealedPasswordPrompt} from '../src/dsl4/platform/sealed-password-prompt.js';
import {createFakeDocument, requireByAttribute} from './helpers/fake-dom.ts';

const request = (attempt = 1) =>
  Object.freeze({
    sourceIntegrity: `sha256-${'A'.repeat(43)}=`,
    keyId: `pbkdf2-sha256:100000:${'A'.repeat(22)}==`,
    attempt,
    previousAttemptFailed: attempt > 1,
  });

function open(locale: 'en' | 'ja' = 'en') {
  const document = createFakeDocument();
  const prompt = createDsl4SealedPasswordPrompt({
    document,
    mount: document.body,
    getLocale: () => locale,
  });
  return {document, prompt};
}

test('asks for the password in an accessible dialog and returns what was typed', async () => {
  const {document, prompt} = open();
  const answer = prompt.unlock(request());
  const dialog = requireByAttribute(document.body, 'data-dsl4-sealed-password', 'true');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dialog.getAttribute('data-kamishibai-keymap-ignore'), 'true');
  const input = requireByAttribute(dialog, 'data-dsl4-sealed-password-input', 'true');
  assert.equal(input.type, 'password');
  assert.equal(document.activeElement, input);
  const error = requireByAttribute(dialog, 'data-dsl4-sealed-password-error', 'true');
  assert.equal(error.hidden, true);

  input.value = 'open sesame';
  const form = dialog.children[0]!;
  form.dispatch('submit');
  assert.equal(await answer, 'open sesame');
  assert.equal(document.body.children.length, 0);
});

test('says the previous password was wrong and returns null on Cancel or Escape', async () => {
  const {document, prompt} = open('ja');
  const cancelled = prompt.unlock(request(2));
  const dialog = requireByAttribute(document.body, 'data-dsl4-sealed-password', 'true');
  const error = requireByAttribute(dialog, 'data-dsl4-sealed-password-error', 'true');
  assert.equal(error.hidden, false);
  assert.match(String(error.textContent), /パスワードが違います/);
  requireByAttribute(dialog, 'data-dsl4-sealed-password-action', 'cancel').click();
  assert.equal(await cancelled, null);

  const escaped = prompt.unlock(request());
  const next = requireByAttribute(document.body, 'data-dsl4-sealed-password', 'true');
  const key = next.dispatch('keydown', {code: 'Escape'});
  assert.equal(key.propagationStopped, true);
  assert.equal(await escaped, null);
  assert.equal(document.body.children.length, 0);
});

test('keeps typed keys away from Scratch and the story keymap', async () => {
  const {document, prompt} = open();
  const answer = prompt.unlock(request());
  const dialog = requireByAttribute(document.body, 'data-dsl4-sealed-password', 'true');
  for (const type of ['keydown', 'keyup', 'keypress']) {
    assert.equal(dialog.dispatch(type, {code: 'Space'}).propagationStopped, true, type);
  }
  prompt.dispose();
  assert.equal(await answer, null);
});

test('chooses a new password only when it is long enough and typed twice the same', async () => {
  const {document, prompt} = open();
  const chosen = prompt.choose();
  const dialog = requireByAttribute(document.body, 'data-dsl4-sealed-password', 'true');
  const input = requireByAttribute(dialog, 'data-dsl4-sealed-password-input', 'true');
  const confirm = requireByAttribute(dialog, 'data-dsl4-sealed-password-confirm', 'true');
  const error = requireByAttribute(dialog, 'data-dsl4-sealed-password-error', 'true');
  const form = dialog.children[0]!;
  assert.equal((input as unknown as {autocomplete?: string}).autocomplete, 'new-password');

  input.value = 'short';
  confirm.value = 'short';
  form.dispatch('submit');
  assert.equal(error.hidden, false);
  assert.match(String(error.textContent), /at least 8/);

  input.value = 'long enough one';
  confirm.value = 'long enough two';
  form.dispatch('submit');
  assert.match(String(error.textContent), /do not match/);
  assert.equal(document.body.children.length, 1, 'the dialog stays open until both agree');

  confirm.value = 'long enough one';
  form.dispatch('submit');
  assert.equal(await chosen, 'long enough one');
  assert.equal(document.body.children.length, 0);
});
