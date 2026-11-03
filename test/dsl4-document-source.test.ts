import assert from 'node:assert/strict';
import {test} from 'vitest';

import {
  normalizeDocumentSource,
  type DocumentSourceMetadata,
} from '@kubohiroya/turbowarp-document-source';
import {
  getDocumentSourceRegistry,
  readDocumentSourceURLs,
} from '@kubohiroya/turbowarp-document-data/document-source';

import {
  buildKamishibaiDocumentSourceProject,
  registerKamishibaiEmbeddedYamlProvider,
} from '../src/dsl4/embedded-yaml-provider.js';
import {
  createKamishibaiDocumentSourceOwnerOptions,
  kamishibaiDocumentSourceDialogTitle,
  kamishibaiDocumentSourceStorageId,
  readKamishibaiDocumentSourceFlag,
} from '../src/dsl4/document-source.js';
import {
  hasKamishibaiDocumentSourceURL,
  resolveKamishibaiDocumentSourceProject,
} from '../src/dsl4/document-source-runtime.js';
import {kamishibaiEmbeddedYamlReference} from '../src/dsl4/embedded-yaml-identity.js';
import {
  ownerComponent,
  ownerSourceText,
  patchableVm,
  recordingFetch,
  storyProject,
  storySource,
} from './helpers/document-source-vm.ts';

const url = 'https://example.test/story.k4.yml';

async function editor({
  text = storySource(),
  bodies = {[url]: storySource()} as Record<string, string | Error>,
} = {}) {
  const project = await storyProject({text});
  const {vm, counts} = patchableVm(project);
  const {fetch, requests} = recordingFetch(bodies);
  const dispose = registerKamishibaiEmbeddedYamlProvider(vm, {
    documentSourceEnabled: true,
    documentViewsEnabled: true,
    fetch,
  });
  const registry = getDocumentSourceRegistry(vm as never);
  return {project, vm, counts, registry, requests, dispose};
}

const only = (registry: {list(): readonly DocumentSourceMetadata[]}): DocumentSourceMetadata => {
  const documents = registry.list();
  assert.equal(documents.length, 1, 'the fixture owns exactly one document');
  return documents[0]!;
};

test('the launch environment alone enables the capability, and it stays off by default', () => {
  assert.equal(readKamishibaiDocumentSourceFlag({}), false);
  assert.equal(readKamishibaiDocumentSourceFlag({location: {search: '?lang=ja'}}), false);
  assert.equal(
    readKamishibaiDocumentSourceFlag({location: {search: '?twPlusDocumentSource=0'}}),
    false,
  );
  assert.equal(
    readKamishibaiDocumentSourceFlag({location: {search: '?twPlusDocumentSource=1'}}),
    true,
  );
  assert.equal(readKamishibaiDocumentSourceFlag({TW_PLUS_DOCUMENT_SOURCE: true}), true);
});

test('URL locations persist under whichever loaded owner extension holds the component', async () => {
  assert.equal(
    kamishibaiDocumentSourceStorageId(await storyProject({form: 'bundled'})),
    'kubohiroyakamishibai4',
  );
  assert.equal(
    kamishibaiDocumentSourceStorageId(await storyProject({form: 'unbundled'})),
    'kubohiroyakamishibairuntime4',
  );
  assert.throws(
    () => kamishibaiDocumentSourceStorageId({extensionStorage: {}}),
    /no Kamishibai document owner/u,
  );
});

test('the same document reference reads as an SB3 file, an HTTPS URL, generic YAML blocks or script blocks', () => {
  const kinds = ['embedded-file', 'url', 'yaml-blocks', 'schema-blocks'] as const;
  const resolved = kinds.map((kind) =>
    normalizeDocumentSource({
      kind,
      filename: 'story.k4.yml',
      format: 'yaml',
      ...(kind === 'url' ? {url} : {}),
    }),
  );
  assert.deepEqual(
    resolved.map((source) => [source.kind, source.location, source.representation]),
    [
      ['embedded-file', 'sb3', 'source'],
      ['url', 'https', 'source'],
      ['yaml-blocks', 'sb3', 'yaml-blocks'],
      ['schema-blocks', 'sb3', 'schema-blocks'],
    ],
  );
  // Only the location and representation move; the document keeps its name and text format.
  assert.deepEqual(new Set(resolved.map((source) => source.filename)), new Set(['story.k4.yml']));
  assert.deepEqual(new Set(resolved.map((source) => source.format)), new Set(['yaml']));
});

test('an embedded document is editable in place and names the owner in the shared dialog', async () => {
  const {registry, requests, dispose} = await editor();
  try {
    const document = only(registry);
    assert.deepEqual(document.reference, kamishibaiEmbeddedYamlReference);
    assert.equal(document.dataSource.kind, 'embedded-file');
    assert.equal(document.sourceLocationEditable, true);
    assert.deepEqual(document.dialogTitle, kamishibaiDocumentSourceDialogTitle);
    assert.deepEqual(requests, [], 'an embedded document never reaches the network');
  } finally {
    dispose();
  }
});

test('saving a URL location fetches once, reuses that candidate and keeps the document name', async () => {
  const {registry, vm, counts, requests, dispose} = await editor();
  try {
    const adapter = registry.open(kamishibaiEmbeddedYamlReference);
    const snapshot = adapter.capture();
    const candidate = await adapter.prepareDataSource!(snapshot, {kind: 'url', url});
    assert.deepEqual(requests, [url], 'the preview fetches exactly once');
    assert.equal(candidate.dataSource.kind, 'url');
    assert.equal(candidate.dataSource.url, url);

    const applied = adapter.commitDataSource!(snapshot, candidate);
    assert.equal(applied.source, candidate.source);
    assert.deepEqual(requests, [url], 'saving reuses the fetched candidate');

    const saved = JSON.parse(vm.toJSON());
    assert.deepEqual(
      readDocumentSourceURLs(saved).map((entry) => [entry.url, entry.ownerExtensionId]),
      [[url, 'kubohiroyakamishibai4']],
    );
    const document = only(registry);
    assert.equal(document.dataSource.kind, 'url');
    assert.equal(document.dataSource.filename, 'story.k4.yml');
    assert.deepEqual(
      {saves: counts.saves, loads: counts.loads, stops: counts.stops},
      {
        saves: 0,
        loads: 0,
        stops: 0,
      },
    );
    adapter.dispose();
  } finally {
    dispose();
  }
});

test('a URL document is read-only until it is embedded, so blocks never edit a remote script', async () => {
  const {registry, dispose} = await editor();
  try {
    const adapter = registry.open(kamishibaiEmbeddedYamlReference);
    const snapshot = adapter.capture();
    adapter.commitDataSource!(
      snapshot,
      await adapter.prepareDataSource!(snapshot, {kind: 'url', url}),
    );

    const representations = only(registry).representations ?? [];
    assert.deepEqual(
      representations.map((item) => item.kind),
      ['yaml-blocks', 'schema-blocks'],
    );
    for (const item of representations)
      assert.equal(item.available, false, `${item.kind} must be unavailable for a URL source`);

    const current = registry.open(kamishibaiEmbeddedYamlReference);
    await current.loadSource();
    const remote = current.capture();
    await assert.rejects(current.prepare(remote, storySource('second')), /Embed the URL source/u);
    await assert.rejects(
      current.prepareRepresentation!(remote, {kind: 'yaml-blocks', direction: 'from-source'}),
      /Embed the URL source/u,
    );
    adapter.dispose();
    current.dispose();
  } finally {
    dispose();
  }
});

test('a failed fetch and a changed project both refuse to save and leave the document alone', async () => {
  const failing = await editor({bodies: {[url]: new Error('offline')}});
  try {
    const adapter = failing.registry.open(kamishibaiEmbeddedYamlReference);
    const snapshot = adapter.capture();
    await assert.rejects(adapter.prepareDataSource!(snapshot, {kind: 'url', url}));
    assert.deepEqual(readDocumentSourceURLs(JSON.parse(failing.vm.toJSON())), []);
    adapter.dispose();
  } finally {
    failing.dispose();
  }

  const changing = await editor();
  try {
    const adapter = changing.registry.open(kamishibaiEmbeddedYamlReference);
    const snapshot = adapter.capture();
    const candidate = await adapter.prepareDataSource!(snapshot, {kind: 'url', url});
    ownerComponent(changing.vm.runtime.extensionStorage).application = {
      mode: 'story',
      edited: true,
    };
    assert.throws(() => adapter.commitDataSource!(snapshot, candidate), /project changed/u);
    assert.deepEqual(readDocumentSourceURLs(JSON.parse(changing.vm.toJSON())), []);
    adapter.dispose();
  } finally {
    changing.dispose();
  }
});

test('an owner candidate must save exactly the text it validated', async () => {
  const options = createKamishibaiDocumentSourceOwnerOptions({
    replaceSource: (project, source) => buildKamishibaiDocumentSourceProject(project, source),
  });
  const project = await storyProject();
  await assert.rejects(
    async () =>
      options.buildSourceCandidate!({
        project,
        reference: kamishibaiEmbeddedYamlReference,
        source: storySource('second').replaceAll('\n', '\r\n'),
      }),
    /LF line endings/u,
  );
  assert.throws(
    () => createKamishibaiDocumentSourceOwnerOptions({replaceSource: undefined as never}),
    /source replacement is required/u,
  );
});

test('playback re-reads a URL script instead of replaying the copy saved in the project', async () => {
  const project = await storyProject();
  const embedded = structuredClone(project);
  assert.equal(hasKamishibaiDocumentSourceURL(embedded), false);
  const replaceSource = (target: Record<string, unknown>, source: string) =>
    buildKamishibaiDocumentSourceProject(target, source);

  // A project without a URL never reaches the network and is handed back untouched.
  const offline = recordingFetch({});
  assert.equal(
    await resolveKamishibaiDocumentSourceProject(embedded, {
      fetch: offline.fetch,
      documentSourceEnabled: true,
      replaceSource,
    }),
    embedded,
  );
  assert.deepEqual(offline.requests, []);

  const {registry, vm, dispose} = await editor();
  let remote: Record<string, unknown>;
  try {
    const adapter = registry.open(kamishibaiEmbeddedYamlReference);
    const snapshot = adapter.capture();
    adapter.commitDataSource!(
      snapshot,
      await adapter.prepareDataSource!(snapshot, {kind: 'url', url}),
    );
    remote = JSON.parse(vm.toJSON());
    adapter.dispose();
  } finally {
    dispose();
  }
  assert.equal(hasKamishibaiDocumentSourceURL(remote), true);

  const updated = storySource('runtime');
  const live = recordingFetch({[url]: updated});
  const resolved = await resolveKamishibaiDocumentSourceProject(remote, {
    fetch: live.fetch,
    documentSourceEnabled: true,
    replaceSource,
  });
  assert.deepEqual(live.requests, [url], 'playback reads the URL again');
  assert.equal(ownerSourceText(resolved), updated);
  assert.notEqual(resolved, remote, 'the caller project is never rewritten in place');

  // A disabled capability, a missing capability and a failed request all refuse to run.
  await assert.rejects(
    resolveKamishibaiDocumentSourceProject(remote, {
      fetch: live.fetch,
      documentSourceEnabled: false,
      replaceSource,
    }),
    /started without/u,
  );
  await assert.rejects(
    resolveKamishibaiDocumentSourceProject(remote, {documentSourceEnabled: true, replaceSource}),
    /no network capability/u,
  );
  await assert.rejects(
    resolveKamishibaiDocumentSourceProject(remote, {
      fetch: recordingFetch({[url]: new Error('offline')}).fetch,
      documentSourceEnabled: true,
      replaceSource,
    }),
    /could not be read/u,
  );
  await assert.rejects(
    resolveKamishibaiDocumentSourceProject(remote, {
      fetch: recordingFetch({[url]: 'kamishibai: nope\n'}).fetch,
      documentSourceEnabled: true,
      replaceSource,
    }),
  );
});
