import assert from 'node:assert/strict';
import {test} from 'vitest';
import {createDsl4NavigationSession} from '../src/dsl4/navigation-session.js';
import {validateDsl4MediaRestoreSupport} from '../src/dsl4/platform/presentation-media-save.js';
import type {Dsl4SaveDataV1} from '../src/dsl4/save-data.js';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';

interface Session {
  start(): Promise<unknown>;
  captureSave(): Promise<Readonly<Dsl4SaveDataV1>>;
  restore(input: unknown): Promise<unknown>;
  dispose(): Promise<void>;
  getState(): {runtime: {status: unknown; actionIndex?: unknown}};
}

const identity = {storyId: 'save-support', sourceIntegrity: `sha256-${'c'.repeat(43)}=`};

/** Runs the given actions, then parks on a wait that a save can cancel and replay. */
function fixture(actions: string, port: Record<string, unknown> = {}) {
  const parsed = frontend.parse(`kamishibai: '4.0'
controls:
  keymaps:
    production: {Space: navigation.nextAction}
textStyles: {title: {size: 24}}
assets:
  Tick: sound
  HeroIdle: costume:Hero
  HeroRun: costume:Hero
  Pose: {kind: recognitionModel, file: pose-models/rescue}
actors:
  Hero: HeroIdle
scenes:
  opening:
    recognitionModel: Pose
    actions:
${actions}
      - wait: 30
`);
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  const done = () => Promise.resolve();
  const created = createDsl4NavigationSession({
    storyDocument: parsed.storyDocument,
    controlProfile: 'production',
    saveIdentity: identity,
    port: {
      say: done,
      sound: done,
      bgm: done,
      setText: done,
      loop: done,
      waitForPose: done,
      wait(_payload: unknown, context: {signal: AbortSignal}) {
        return new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {once: true}),
        );
      },
      ...port,
    },
  });
  assert('session' in created, JSON.stringify(created));
  return created.session as Session;
}

/** Starts the story and lets it run up to the parked wait; returns the run to await at the end. */
async function parked(session: Session) {
  const running = session.start();
  for (let i = 0; i < 60; i++) await Promise.resolve();
  return {running};
}

test('speech, sounds and pose waits without sound end with their action, so a save restores past them', async () => {
  const actions = `      - Hero.say: {text: hello, seconds: 1}
      - sound: Tick
      - Hero.pose:
          steps:
            - pose: help`;
  const first = fixture(actions);
  const {running} = await parked(first);
  const save = await first.captureSave();
  const fresh = fixture(actions);
  await fresh.restore(save);
  assert.equal(fresh.getState().runtime.status, 'paused');
  assert.deepEqual((await fresh.captureSave()).runtime, save.runtime);
  await first.dispose();
  await fresh.dispose();
  await running;
});

for (const [name, actions] of [
  ['BGM', '      - bgm: Tick'],
  [
    'a pose step that plays a sound',
    `      - Hero.pose:
          steps:
            - {pose: help, sound: Tick}`,
  ],
  ['setText', '      - Hero.setText: {text: hello, style: title}'],
  [
    'a costume loop',
    `      - Hero.loop:
          steps:
            - {skin: HeroIdle, seconds: 1}
            - {skin: HeroRun, seconds: 1}`,
  ],
] as const) {
  test(`${name} leaves state a save does not capture, so the save is refused`, async () => {
    const session = fixture(actions);
    const {running} = await parked(session);
    await assert.rejects(session.captureSave(), /explicit presentation restore handler/);
    assert.equal(session.getState().runtime.status, 'running');
    await session.dispose();
    await running;
  });
}

test('a host that captures BGM, text and loops lets a save hold them and restore past them', async () => {
  const actions = `      - bgm: Tick
      - Hero.setText: {text: hello, style: title}
      - Hero.loop:
          steps:
            - {skin: HeroIdle, seconds: 1}
            - {skin: HeroRun, seconds: 1}`;
  const media = {
    validateSaveRestoreSupport: (_save: unknown, unsupported: readonly Record<string, unknown>[]) =>
      validateDsl4MediaRestoreSupport(unsupported, {bgm: true}),
  };
  const first = fixture(actions, media);
  const {running} = await parked(first);
  const save = await first.captureSave();
  const fresh = fixture(actions, media);
  await fresh.restore(save);
  assert.equal(fresh.getState().runtime.status, 'paused');
  assert.deepEqual((await fresh.captureSave()).runtime, save.runtime);
  await first.dispose();
  await fresh.dispose();
  await running;
});
