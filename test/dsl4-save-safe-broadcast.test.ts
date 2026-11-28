import assert from 'node:assert/strict';
import {test} from 'vitest';
import {parse} from 'yaml';
import {createDsl4NavigationSession} from '../src/dsl4/navigation-session.js';
import type {Dsl4SaveDataV1} from '../src/dsl4/save-data.js';
import {validateDsl4MediaRestoreSupport} from '../src/dsl4/platform/presentation-media-save.js';
import {createDsl4StructuredBlockSourceDeclaration} from '../src/dsl4/structured-block-source.js';
import {extractDsl4BlockSourcesFromProject} from '../src/dsl4/turbowarp-yaml-json-block-source.js';
import {dsl4TestSourceFrontend as frontend} from './helpers/dsl4-test-frontend.ts';

interface Session {
  start(): Promise<unknown>;
  captureSave(): Promise<Readonly<Dsl4SaveDataV1>>;
  restore(input: unknown): Promise<unknown>;
  dispose(): Promise<void>;
  getState(): {runtime: {status: unknown}};
}

function fixture(broadcast: string, payloads: unknown[] = []) {
  const parsed = frontend.parse(`kamishibai: '4.0'
controls:
  keymaps:
    production: {Space: navigation.nextAction}
scenes:
  opening:
    actions:
      - broadcastMessageAndWait: ${broadcast}
      - wait: 30
`);
  assert(parsed.ok, JSON.stringify(parsed.diagnostics));
  const created = createDsl4NavigationSession({
    storyDocument: parsed.storyDocument,
    controlProfile: 'production',
    broadcastMessageAndWaitEnabled: true,
    saveIdentity: {storyId: 'save-safe', sourceIntegrity: `sha256-${'d'.repeat(43)}=`},
    port: {
      broadcastMessageAndWait(payload: unknown) {
        payloads.push(payload);
        return Promise.resolve();
      },
      wait(_payload: unknown, context: {signal: AbortSignal}) {
        return new Promise<void>((resolve) =>
          context.signal.addEventListener('abort', () => resolve(), {once: true}),
        );
      },
    },
  });
  assert('session' in created, JSON.stringify(created));
  return created.session as Session;
}

async function parked(session: Session) {
  const running = session.start();
  for (let i = 0; i < 60; i++) await Promise.resolve();
  return {running};
}

test('a broadcast the author marks saveSafe can be saved and restored without sending it again', async () => {
  const payloads: unknown[] = [];
  const first = fixture('{message: refresh, saveSafe: true}', payloads);
  const {running} = await parked(first);
  // The Scratch broadcast port takes the message alone; the promise is for save points.
  assert.deepEqual(payloads, [{message: 'refresh'}]);
  const save = await first.captureSave();
  const restoredPayloads: unknown[] = [];
  const fresh = fixture('{message: refresh, saveSafe: true}', restoredPayloads);
  await fresh.restore(save);
  assert.equal(fresh.getState().runtime.status, 'paused');
  assert.deepEqual(restoredPayloads, [], 'restore does not send the message again');
  await first.dispose();
  await fresh.dispose();
  await running;
});

for (const broadcast of ['refresh', '{message: refresh}', '{message: refresh, saveSafe: false}']) {
  test(`an unmarked broadcast (${broadcast}) still refuses the save`, async () => {
    const session = fixture(broadcast);
    const {running} = await parked(session);
    await assert.rejects(session.captureSave(), /explicit presentation restore handler/);
    assert.equal(session.getState().runtime.status, 'running');
    await session.dispose();
    await running;
  });
}

test('saveSafe must be a boolean', () => {
  const result = frontend.parse(
    "kamishibai: '4.0'\nscenes:\n  a:\n    actions:\n      - broadcastMessageAndWait: {message: go, saveSafe: 'yes'}\n",
  );
  assert.equal(result.ok, false);
});

test('a host refusing an unmarked broadcast points the author at saveSafe', () => {
  assert.throws(
    () => validateDsl4MediaRestoreSupport([{command: 'broadcastMessageAndWait'}], {bgm: true}),
    /Declare saveSafe: true/,
  );
  assert.throws(
    () =>
      validateDsl4MediaRestoreSupport([{command: 'broadcastMessageAndWait', handler: 'custom'}], {
        bgm: true,
      }),
    (error: Error) => !/saveSafe/.test(error.message),
  );
});

test('saveSafe round-trips through the runtime and bundle block forms', () => {
  const actions = [{broadcastMessageAndWait: {message: 'refresh', saveSafe: true}}];
  for (const form of ['runtime', 'bundle'] as const) {
    const blocks = createDsl4StructuredBlockSourceDeclaration({
      source: {kamishibai: '4.0', scenes: {opening: actions}},
      form,
      hatId: 'hat',
    });
    const extracted = extractDsl4BlockSourcesFromProject({
      targets: [{isStage: true, name: 'Stage', blocks}],
    });
    const decoded = parse(extracted.sources['Stage.k4.yml']!);
    assert.deepEqual(decoded.scenes.opening, actions);
    assert.equal(frontend.parse(extracted.sources['Stage.k4.yml']!).ok, true);
  }
});
