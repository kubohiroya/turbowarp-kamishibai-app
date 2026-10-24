import type {Dsl4SealedUnlock, Dsl4SealedUnlockRequest} from '../sealed-story-artifact.js';

/** The DOM surface the prompt builds; narrow on purpose, like the runtime indicators. */
interface PromptElement {
  id?: string;
  textContent: string | null;
  hidden?: boolean;
  type?: string;
  value?: string;
  autocomplete?: string;
  style: Record<string, string> & {cssText?: string};
  setAttribute(name: string, value: string): void;
  appendChild(child: PromptElement): unknown;
  focus(): void;
  addEventListener(type: string, listener: (event: never) => unknown): unknown;
  remove(): void;
}

interface PromptDocument {
  createElement(tag: string): PromptElement;
}

const labels = Object.freeze({
  en: Object.freeze({
    title: 'This story is sealed',
    message: 'Enter the password the publisher gave you to open it.',
    password: 'Password',
    open: 'Open',
    cancel: 'Cancel',
    wrong: 'That password did not open the story. Try again.',
    chooseTitle: 'Save with a password',
    chooseMessage:
      'Viewers will need this password to open the saved SB3. It cannot be recovered if lost.',
    confirm: 'Password again',
    save: 'Save',
    tooShort: 'Use at least 8 characters.',
    mismatch: 'The two passwords do not match.',
  }),
  ja: Object.freeze({
    title: 'この紙芝居はパスワードで保護されています',
    message: '配布元から受け取ったパスワードを入力してください。',
    password: 'パスワード',
    open: '開く',
    cancel: 'キャンセル',
    wrong: 'パスワードが違います。もう一度入力してください。',
    chooseTitle: 'パスワード付きで保存',
    chooseMessage:
      '保存したSB3を開くには、このパスワードが必要になります。忘れると元に戻せません。',
    confirm: 'パスワード（確認）',
    save: '保存',
    tooShort: '8文字以上にしてください。',
    mismatch: '2つのパスワードが一致しません。',
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

let promptCount = 0;

/** The fewest characters `choose` accepts for a new password. */
export const dsl4SealedMinPasswordLength = 8;

/**
 * Ask the viewer for a sealed story's password in a dialog over the stage.
 *
 * `unlock` is the `unlockSealedStory` callback the runtime host takes: it shows the dialog,
 * resolves with the typed password on Open (or Enter), and with `null` on Cancel (or Escape). A
 * repeated ask after a wrong password says so. Keys typed into the dialog stop at it, so they
 * neither reach Scratch's key hats nor the story's keymap.
 */
export function createDsl4SealedPasswordPrompt(options: {
  document: unknown;
  mount: unknown;
  getLocale?: () => 'en' | 'ja';
}) {
  if (!isRecord(options)) throw new TypeError('Sealed password prompt options must be an object');
  const document = options.document as PromptDocument;
  if (!isRecord(document) || typeof document.createElement !== 'function')
    throw new TypeError('document must provide createElement');
  const mount = options.mount as PromptElement;
  if (!isRecord(mount) || typeof mount.appendChild !== 'function')
    throw new TypeError('mount must be a DOM element');
  if (options.getLocale !== undefined && typeof options.getLocale !== 'function')
    throw new TypeError('getLocale must be a function');
  const id = `dsl4-sealed-password-${(promptCount += 1)}`;
  let pending: ((password: string | null) => void) | null = null;
  let root: PromptElement | null = null;

  function close(password: string | null) {
    root?.remove();
    root = null;
    const settle = pending;
    pending = null;
    settle?.(password);
  }

  function render(request: Dsl4SealedUnlockRequest | null) {
    // `null` chooses a new password (saving with one); a request opens a sealed story.
    const choosing = request === null;
    const text = labels[options.getLocale?.() === 'ja' ? 'ja' : 'en'];
    const dialog = document.createElement('div');
    dialog.setAttribute('data-dsl4-sealed-password', 'true');
    dialog.setAttribute('data-kamishibai-keymap-ignore', 'true');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-message`);
    dialog.style.cssText =
      'position:absolute;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,40,36,.78);font-family:sans-serif;cursor:auto;';
    const form = document.createElement('form');
    form.style.cssText =
      'max-width:420px;width:100%;padding:20px;border-radius:12px;background:#fff;color:#1b1b1b;box-shadow:0 8px 24px rgba(0,0,0,.35);';
    const title = document.createElement('h2');
    title.id = `${id}-title`;
    title.textContent = choosing ? text.chooseTitle : text.title;
    title.style.cssText = 'margin:0 0 10px;font-size:20px;line-height:1.3;';
    const message = document.createElement('p');
    message.id = `${id}-message`;
    message.textContent = choosing ? text.chooseMessage : text.message;
    message.style.cssText = 'margin:0 0 12px;font-size:14px;';
    const label = document.createElement('label');
    label.textContent = text.password;
    label.setAttribute('for', `${id}-input`);
    label.style.cssText = 'display:block;margin:0 0 4px;font-size:13px;';
    const input = document.createElement('input');
    input.id = `${id}-input`;
    input.type = 'password';
    input.autocomplete = choosing ? 'new-password' : 'current-password';
    input.setAttribute('data-dsl4-sealed-password-input', 'true');
    input.style.cssText =
      'width:100%;box-sizing:border-box;padding:8px;font-size:16px;border:1px solid #888;border-radius:6px;';
    const confirmLabel = document.createElement('label');
    confirmLabel.textContent = text.confirm;
    confirmLabel.setAttribute('for', `${id}-confirm`);
    confirmLabel.style.cssText = 'display:block;margin:10px 0 4px;font-size:13px;';
    const confirm = document.createElement('input');
    confirm.id = `${id}-confirm`;
    confirm.type = 'password';
    confirm.autocomplete = 'new-password';
    confirm.setAttribute('data-dsl4-sealed-password-confirm', 'true');
    confirm.style.cssText = input.style.cssText;
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    error.setAttribute('data-dsl4-sealed-password-error', 'true');
    const failed = request?.previousAttemptFailed === true;
    error.textContent = failed ? text.wrong : '';
    error.hidden = !failed;
    error.style.cssText = 'margin:8px 0 0;font-size:13px;color:#b00020;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = text.cancel;
    cancel.setAttribute('data-dsl4-sealed-password-action', 'cancel');
    const open = document.createElement('button');
    open.type = 'submit';
    open.textContent = choosing ? text.save : text.open;
    open.setAttribute('data-dsl4-sealed-password-action', 'open');
    for (const button of [cancel, open])
      button.style.cssText = 'padding:8px 16px;font-size:15px;border-radius:6px;cursor:pointer;';
    actions.appendChild(cancel);
    actions.appendChild(open);
    form.appendChild(title);
    form.appendChild(message);
    form.appendChild(label);
    form.appendChild(input);
    if (choosing) {
      form.appendChild(confirmLabel);
      form.appendChild(confirm);
    }
    form.appendChild(error);
    form.appendChild(actions);
    dialog.appendChild(form);

    form.addEventListener('submit', ((event: {preventDefault(): void}) => {
      event.preventDefault();
      const value = input.value ?? '';
      if (choosing) {
        // A new password is checked here, so a typo cannot seal a story nobody can open.
        const problem =
          [...value].length < dsl4SealedMinPasswordLength
            ? text.tooShort
            : value !== (confirm.value ?? '')
              ? text.mismatch
              : null;
        if (problem !== null) {
          error.textContent = problem;
          error.hidden = false;
          return;
        }
      }
      close(value);
    }) as never);
    cancel.addEventListener('click', (() => close(null)) as never);
    for (const type of ['keydown', 'keyup', 'keypress']) {
      dialog.addEventListener(type, ((event: {
        key?: string;
        code?: string;
        stopPropagation(): void;
      }) => {
        event.stopPropagation();
        if (type === 'keydown' && (event.key === 'Escape' || event.code === 'Escape')) close(null);
      }) as never);
    }
    return {dialog, input};
  }

  function ask(request: Dsl4SealedUnlockRequest | null) {
    // A new ask replaces one still open; the older caller is treated as having declined.
    close(null);
    const {dialog, input} = render(request);
    root = dialog;
    mount.appendChild(dialog);
    input.focus();
    return new Promise<string | null>((resolve) => {
      pending = resolve;
    });
  }

  const unlock: Dsl4SealedUnlock = (request) => ask(request);

  return Object.freeze({
    unlock,
    /** Ask for a new password, twice, to seal a story; `null` when the author cancels. */
    choose: () => ask(null),
    /** Close any open ask as declined. */
    dispose() {
      close(null);
    },
  });
}
