import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  createDsl4AssetReloadProtocolSession,
  dsl4AssetReloadProtocolCapabilities,
} from '../src/dsl4/asset-reload-protocol.js';
import {requireRecord} from './helpers/require-value.ts';
import {thrown} from './helpers/thrown-error.ts';

/** The state the transaction double hands back, as the session reads it. */
interface TransactionState {
  latestRevision: number;
  status: string;
  candidate: {revision: number; providerId: string} | null;
  active: {revision: unknown; generation: number} | null;
  diagnostic: {code: string} | null;
}

/** What the session tells the transaction about the asset revision it is staging. */
interface ReloadSummary {
  revision: number;
  providerId: string;
}

/**
 * A synchronous stand-in for the reload transaction.
 *
 * The port declares its four operations as promises and the session awaits them, so returning the
 * state directly still drives it. Saying that here, once, keeps each case's fake from having to
 * satisfy an async contract it does not need -- and `calls` is the record the cases assert on.
 */
type TransactionDouble = ReturnType<typeof transaction>;
type SessionOptions = Parameters<typeof createDsl4AssetReloadProtocolSession>[0];

function sessionTransaction(double: TransactionDouble): SessionOptions['transaction'] {
  return double as unknown as SessionOptions['transaction'];
}

function transaction() {
  let state: TransactionState = {
    latestRevision: 0,
    status: 'idle',
    candidate: null,
    active: null,
    diagnostic: null,
  };
  const calls: unknown[][] = [];
  return {
    stage(summary: ReloadSummary) {
      calls.push(['stage', summary.revision]);
      state = {
        ...state,
        latestRevision: summary.revision,
        status: 'ready',
        candidate: {revision: summary.revision, providerId: summary.providerId},
      };
      return state;
    },
    failClosed(summary: ReloadSummary) {
      calls.push(['failClosed', summary.revision]);
      state = {
        ...state,
        latestRevision: summary.revision,
        status: 'full-rebuild',
        candidate: null,
        diagnostic: {code: 'K4-ASSET-FULL-REBUILD-REQUIRED'},
      };
      return state;
    },
    commit(revision: unknown, request?: unknown) {
      calls.push(['commit', revision, request]);
      state = {
        ...state,
        status: 'active',
        candidate: null,
        active: {revision, generation: 1},
        diagnostic: null,
      };
      return state;
    },
    defer(revision: unknown) {
      calls.push(['defer', revision]);
      state = {...state, status: 'idle', candidate: null};
      return state;
    },
    getState: () => state,
    whenIdle: () => state,
    calls,
  };
}

function candidate(revision: number) {
  return {revision, providerId: `asset-provider-${revision}`};
}

test('serializes negotiated asset stage and commit messages for one preview session', async () => {
  const reload = transaction();
  const protocol = createDsl4AssetReloadProtocolSession({
    transaction: sessionTransaction(reload),
    sessionId: 'preview-1',
    negotiatedCapabilities: dsl4AssetReloadProtocolCapabilities,
  });

  const staged = requireRecord(
    await protocol.stage({
      type: 'preview.asset.stage',
      sessionId: 'preview-1',
      summary: candidate(1),
    }),
    'the staged reply',
  );
  assert.equal(staged.type, 'preview.asset.staged');
  assert.equal(requireRecord(staged.candidate, 'the staged candidate').revision, 1);
  const committed = requireRecord(
    await protocol.commit({
      type: 'preview.asset.commit',
      sessionId: 'preview-1',
      revision: 1,
      request: {requestedPreference: 'action'},
    }),
    'the committed reply',
  );
  assert.equal(committed.type, 'preview.asset.committed');
  assert.deepEqual(reload.calls, [
    ['stage', 1],
    ['commit', 1, {requestedPreference: 'action'}],
  ]);
  assert.equal(protocol.getState().candidateRevision, null);
});

test('reports a committed revision even when post-acknowledgement cleanup raises a diagnostic', async () => {
  const reload = transaction();
  reload.commit = (revision: unknown, request?: unknown): TransactionState => {
    reload.calls.push(['commit', revision, request]);
    return {
      latestRevision: 1,
      status: 'diagnostic',
      candidate: null,
      active: {revision, generation: 2},
      diagnostic: {code: 'K4-ASSET-RELEASE-001'},
    };
  };
  const protocol = createDsl4AssetReloadProtocolSession({
    transaction: sessionTransaction(reload),
    sessionId: 'preview-cleanup',
    negotiatedCapabilities: dsl4AssetReloadProtocolCapabilities,
  });
  await protocol.stage({
    type: 'preview.asset.stage',
    sessionId: 'preview-cleanup',
    summary: candidate(2),
  });
  const committed = requireRecord(
    await protocol.commit({
      type: 'preview.asset.commit',
      sessionId: 'preview-cleanup',
      revision: 2,
    }),
    'the committed reply',
  );
  assert.equal(committed.type, 'preview.asset.committed');
  assert.equal(committed.status, 'diagnostic');
  assert.equal(
    requireRecord(committed.diagnostic, 'the cleanup diagnostic').code,
    'K4-ASSET-RELEASE-001',
  );
});

test('fails closed when any optional asset capability is absent', async () => {
  const reload = transaction();
  const protocol = createDsl4AssetReloadProtocolSession({
    transaction: sessionTransaction(reload),
    sessionId: 'preview-1',
    negotiatedCapabilities: dsl4AssetReloadProtocolCapabilities.filter(
      (capability) => capability !== 'asset.commit.v1',
    ),
  });

  const fallback = requireRecord(
    await protocol.stage({
      type: 'preview.asset.stage',
      sessionId: 'preview-1',
      summary: candidate(1),
    }),
    'the fallback reply',
  );
  assert.equal(fallback.type, 'preview.asset.fallback');
  assert.equal(
    requireRecord(fallback.diagnostic, 'the fallback diagnostic').code,
    'K4-ASSET-FULL-REBUILD-REQUIRED',
  );
  assert.deepEqual(reload.calls, [['failClosed', 1]]);
  await assert.rejects(
    protocol.commit({
      type: 'preview.asset.commit',
      sessionId: 'preview-1',
      revision: 1,
    }),
    (error) => thrown(error).code === 'K4-ASSET-PROTOCOL-CAPABILITY',
  );
});

test('rejects stale sessions, revisions, unknown keys, and discards on disconnect', async () => {
  const reload = transaction();
  const protocol = createDsl4AssetReloadProtocolSession({
    transaction: sessionTransaction(reload),
    sessionId: 'preview-1',
    negotiatedCapabilities: dsl4AssetReloadProtocolCapabilities,
  });

  await assert.rejects(
    protocol.stage({type: 'preview.asset.stage', sessionId: 'stale', summary: candidate(1)}),
    (error) => thrown(error).code === 'K4-ASSET-PROTOCOL-SESSION',
  );
  await assert.rejects(
    protocol.stage({
      type: 'preview.asset.stage',
      sessionId: 'preview-1',
      summary: candidate(1),
      rawBytes: [1, 2, 3],
    }),
    (error) => thrown(error).code === 'K4-ASSET-PROTOCOL-SCHEMA',
  );
  await protocol.stage({
    type: 'preview.asset.stage',
    sessionId: 'preview-1',
    summary: candidate(2),
  });
  await assert.rejects(
    protocol.defer({type: 'preview.asset.defer', sessionId: 'preview-1', revision: 1}),
    (error) => thrown(error).code === 'K4-ASSET-STALE-001',
  );
  await protocol.disconnect();
  assert.deepEqual(reload.calls.slice(-2), [
    ['stage', 2],
    ['defer', 2],
  ]);
  await assert.rejects(
    protocol.stage({type: 'preview.asset.stage', sessionId: 'preview-1', summary: candidate(3)}),
    (error) => thrown(error).code === 'K4-ASSET-PROTOCOL-DISCONNECTED',
  );
});
