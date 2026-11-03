import {cloneKamishibaiDocumentProject} from '../src/dsl4/embedded-yaml-project-clone.js';
import {installEmbeddedYamlMarker} from '@kubohiroya/turbowarp-document-data/document-source';
import {installDsl4EmbeddedYamlRoot} from '../src/dsl4/embedded-yaml-hat.js';
import {dsl4BundledEmbeddedYamlRootOpcode} from '../src/dsl4/embedded-yaml-identity.js';
import {describe, it, expect} from 'vitest';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {createDsl4EmbeddedAssetBundle} from '../src/dsl4/asset-bundle-descriptor.js';
import {
  createEmbeddedYamlSourceGraphRecord,
  composeGraphComponent,
  readEmbeddedYamlSourceGraphRecord,
} from '../src/dsl4/embedded-yaml-source-graph.js';
import {replaceGraphDocumentSource} from '../src/dsl4/embedded-yaml-graph-provider.js';
import {
  buildKamishibaiGraphDocumentViewCandidate as build,
  buildKamishibaiGraphDocumentPreview as preview,
  buildKamishibaiGraphDocumentPreviewArtifact as previewArtifact,
} from '../src/dsl4/embedded-yaml-graph-views.js';
import {encodeSourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import {readDocumentViewMetadata} from '@kubohiroya/turbowarp-document-data/view-metadata';
import {dsl4BundledEmbeddedYamlHatOpcode} from '../src/dsl4/embedded-yaml-identity.js';
import {
  dsl4BundledEmbeddedYamlIncludeOpcode,
  createDsl4EmbeddedYamlIncludeDefinition,
} from '../src/dsl4/embedded-yaml-include-views.js';
import {yamlBlockIconURI} from '@kubohiroya/turbowarp-yaml-json/yaml-blocks';
import {parse} from 'yaml';
import {assertKamishibaiDocumentSourceReady} from '../src/dsl4/embedded-yaml-view-state.js';
import {convertDsl4ProjectToCompiledProfile} from '../src/dsl4/compiled-project.js';
interface Block extends Record<string, unknown> {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown[]>;
  fields: Record<string, unknown[]>;
  topLevel: boolean;
  shadow?: boolean;
}
interface Target extends Record<string, unknown> {
  name: string;
  isStage: boolean;
  blocks: Record<string, Block>;
}
interface Component extends Record<string, unknown> {
  assets: unknown;
  sourceDocuments?: unknown;
  editorViews?: unknown;
}
interface Project extends Record<string, unknown> {
  targets: [Target, ...Target[]];
  extensionStorage: Record<string, unknown> & {
    kubohiroyakamishibai4: {components: {kubohiroyakamishibairuntime4: Component}};
  };
  extensions: string[];
  extensionURLs: Record<string, string>;
  extra: {preserve: string};
}
function literalValue(block: Block, name: string): unknown {
  const input = block.inputs[name];
  return input && Array.isArray(input[1]) ? input[1][1] : undefined;
}
function setLiteral(block: Block, name: string, value: string) {
  const input = block.inputs[name];
  if (!input || !Array.isArray(input[1])) throw Error('A literal input is required');
  input[1][1] = value;
}
const files = {
  'main.k4.yml':
    "\ufeff# entry comment\r\nkamishibai: '4.0'\r\ninclude: ./parts/a.k4.yml\r\ncontrols:\r\n  keymaps:\r\n    production:\r\n      Space: navigation.nextAction\r\nscenes:\r\n  main:\r\n    - wait: 1\r\n",
  'parts/a.k4.yml':
    '# module comment\r\ninclude: ../shared.k4.yml\r\nvariables:\r\n  count: 1\r\nscenes:\r\n  part:\r\n    - wait: 2\r\n',
  'shared.k4.yml': '# shared comment\nscenes:\n  shared:\n    - wait: 3\n',
};
const ref = (documentId = 'file:parts/a.k4.yml') => ({
  providerId: 'kamishibai-dsl4',
  documentId,
});
const component = (p: Record<string, unknown>) =>
  (p as Project).extensionStorage.kubohiroyakamishibai4.components.kubohiroyakamishibairuntime4;
const raws = (p: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(readEmbeddedYamlSourceGraphRecord(component(p).sourceDocuments).files).map(
      ([path, file]) => [path, file.source],
    ),
  );
async function fixture(inputFiles = files) {
  const frontend = createDsl4ProductionSourceFrontend(schema),
    parsed = frontend.parse("kamishibai: '4.0'\nscenes:\n  initial:\n    - wait: 0\n", {
      sourceId: 'story',
    });
  if (!parsed.ok) throw Error('Fixture story invalid');
  const assets = await createDsl4EmbeddedAssetBundle(
      parsed.storyDocument,
      {
        manifest: {formatVersion: 1, assets: []},
        getFile: () => new Uint8Array(),
      },
      {maxFiles: 10, maxTotalBytes: 4096},
    ),
    record = await createEmbeddedYamlSourceGraphRecord({
      entryPath: 'main.k4.yml',
      files: inputFiles,
    });
  const compiled = await composeGraphComponent(
    {
      source: {sourceId: 'story', displayName: 'main.k4.yml'},
      artifact: {controlProfile: 'production'},
      application: {mode: 'story'},
      assets,
    },
    record,
    frontend,
  );
  const project: Project = {
    targets: [
      {
        name: 'Stage',
        isStage: true,
        blocks: {
          unrelated: {
            opcode: 'event_whenflagclicked',
            next: null,
            parent: null,
            topLevel: true,
            shadow: false,
            inputs: {},
            fields: {},
          },
        },
      },
    ],
    extensionStorage: {
      kubohiroyakamishibai4: {
        components: {kubohiroyakamishibairuntime4: structuredClone(compiled) as Component},
      },
    },
    extensions: ['kubohiroyakamishibai4'],
    extensionURLs: {kubohiroyakamishibai4: 'data:unchanged'},
    extra: {preserve: 'yes'},
  };
  for (const [index, path] of Object.keys(inputFiles).entries())
    installEmbeddedYamlMarker(project, {
      opcode: dsl4BundledEmbeddedYamlHatOpcode,
      reference: ref('file:' + path),
      x: 32,
      y: 180 + index * 140,
    });
  installDsl4EmbeddedYamlRoot(project, {channel: 'bundled'});
  return {
    project,
    options: {
      frontend,
      replaceSource: (p: Record<string, unknown>, id: string, s: string) =>
        replaceGraphDocumentSource(p, id, s, frontend),
    },
  };
}
const run = async (
  p: Record<string, unknown>,
  options: Parameters<typeof build>[1],
  kind: string,
  direction: 'from-source' | 'to-source',
  documentId = 'file:parts/a.k4.yml',
) => {
  const result = await build(
    {
      project: structuredClone(p),
      source: raws(p)[documentId.slice(5)]!,
      reference: ref(documentId),
      request: {kind, direction},
    },
    options,
  );
  return {...result, project: result.project as Project};
};
function optimize(value: Record<string, unknown>) {
  const project = value as Project;
  for (const target of project.targets) {
    const map = Object.fromEntries(
      Object.keys(target.blocks).map((id, index) => [id, `short${index}`]),
    );
    target.blocks = Object.fromEntries(
      Object.entries(target.blocks).map(([id, b]) => {
        const c = structuredClone(b);
        if (typeof c.next === 'string') c.next = map[c.next]!;
        if (typeof c.parent === 'string') c.parent = map[c.parent]!;
        for (const input of Object.values(c.inputs))
          if (Array.isArray(input))
            for (const index of [1, 2])
              if (typeof input[index] === 'string') input[index] = map[input[index]];
        return [map[id], c];
      }),
    );
  }
  return project;
}
describe('canonical raw module document views', () => {
  it.each(['yaml-blocks', 'schema-blocks'])(
    'preserves every raw byte, include spelling and absent module version through %s and optimized IDs',
    async (kind) => {
      const {project, options} = await fixture(),
        before = structuredClone(project),
        built = await run(project, options, kind, 'from-source');
      expect(project).toEqual(before);
      expect(raws(built.project)).toEqual(files);
      const entryRoots = Object.values((built.project.targets as Target[])[0]!.blocks).filter(
        (b) => b.opcode === dsl4BundledEmbeddedYamlRootOpcode,
      ) as Block[];
      expect(entryRoots).toHaveLength(1);
      expect(entryRoots[0]!.next).toBeNull();
      expect(entryRoots[0]!.parent).toBeNull();
      expect(entryRoots[0]!.fields.DOCUMENT![0]).toBe(
        encodeSourceDocumentReference(ref('file:main.k4.yml')),
      );
      expect(component(built.project).assets).toEqual(component(project).assets);
      const shown = await preview(
        {
          project: structuredClone(built.project),
          source: files['parts/a.k4.yml'],
          reference: ref(),
          kind,
        },
        options,
      );
      expect(shown.rootIds?.length).toBeGreaterThan(0);
      if (kind === 'schema-blocks') {
        expect(shown.rootIds).toHaveLength(1);
        expect(
          Object.values(shown.blocks! as Record<string, Block>).some((b) =>
            String(b.opcode).includes('embeddedYamlConfig'),
          ),
        ).toBe(false);
      }
      expect(Object.keys(shown.blocks!).length).toBeGreaterThan(2);
      expect(
        Object.values(shown.blocks! as Record<string, Block>).every(
          (b) =>
            !(
              b.opcode === dsl4BundledEmbeddedYamlHatOpcode &&
              b.fields.DOCUMENT![0] !== encodeSourceDocumentReference(ref())
            ),
        ),
      ).toBe(true);
      const restored = await run(
        optimize(structuredClone(built.project)),
        options,
        kind,
        'to-source',
      );
      expect(raws(restored.project)).toEqual(files);
      expect(parse(raws(restored.project)['parts/a.k4.yml']!)).not.toHaveProperty('kamishibai');
      expect(restored.project.extra).toEqual(project.extra);
      expect((restored.project.targets as Target[])[0]!.blocks).toHaveProperty('short0');
      expect(readDocumentViewMetadata(component(restored.project), ref())?.activeKind).toBe(
        'source',
      );
    },
  );
  it('edits one schema module while retaining configuration ownership, comments and relative include scalars', async () => {
    const {project, options} = await fixture(),
      built = await run(project, options, 'schema-blocks', 'from-source');
    const blocks = (built.project.targets as Target[])[0]!.blocks;
    const wait = Object.values(blocks).find((b) => String(b.opcode).endsWith('_wait')) as Block;
    expect(wait).toBeDefined();
    wait.inputs.SECONDS = [1, [4, 9]];
    const restored = await run(built.project, options, 'schema-blocks', 'to-source');
    const raw = raws(restored.project);
    expect(raw['main.k4.yml']).toBe(files['main.k4.yml']);
    expect(raw['shared.k4.yml']).toBe(files['shared.k4.yml']);
    expect(raw['parts/a.k4.yml']).toContain('# module comment\r\n');
    expect(raw['parts/a.k4.yml']).toContain('include: ../shared.k4.yml');
    expect(parse(raw['parts/a.k4.yml']!)).toEqual({
      include: '../shared.k4.yml',
      variables: {count: 1},
      scenes: {part: [{wait: 9}]},
    });
  });
  it('uses typed document includes with the square YAML icon and rejects unknown/cyclic targets', async () => {
    expect(
      createDsl4EmbeddedYamlIncludeDefinition({
        BlockType: {COMMAND: 'command'},
      }).blockIconURI,
    ).toBe(yamlBlockIconURI);
    const {project, options} = await fixture(),
      built = await run(project, options, 'schema-blocks', 'from-source');
    const includes = Object.values((built.project.targets as Target[])[0]!.blocks).filter(
      (b) => b.opcode === dsl4BundledEmbeddedYamlIncludeOpcode,
    ) as Block[];
    expect(includes).toHaveLength(1);
    expect(includes[0]!.fields.DOCUMENT![0]).toBe(
      encodeSourceDocumentReference(ref('file:shared.k4.yml')),
    );
    for (const documentId of ['file:missing.k4.yml', 'file:parts/a.k4.yml']) {
      const edited = structuredClone(built.project),
        include = Object.values((edited.targets as Target[])[0]!.blocks).find(
          (b) => b.opcode === dsl4BundledEmbeddedYamlIncludeOpcode,
        ) as Block;
      include.fields.DOCUMENT = [encodeSourceDocumentReference(ref(documentId)), null];
      await expect(run(edited, options, 'schema-blocks', 'to-source')).rejects.toThrow();
    }
  });
  it('allows independent active block documents and never claims old SB3 projects contain raw modules', async () => {
    const {project, options} = await fixture(),
      built = await run(project, options, 'yaml-blocks', 'from-source');
    const other = await run(
      built.project,
      options,
      'schema-blocks',
      'from-source',
      'file:shared.k4.yml',
    );
    expect(readDocumentViewMetadata(component(other.project), ref())?.activeKind).toBe(
      'yaml-blocks',
    );
    expect(
      readDocumentViewMetadata(component(other.project), ref('file:shared.k4.yml'))?.activeKind,
    ).toBe('schema-blocks');
    const old = structuredClone(project);
    delete component(old).sourceDocuments;
    await expect(
      build(
        {
          project: old,
          source: 'old derived source',
          reference: ref(),
          request: {kind: 'yaml-blocks', direction: 'from-source'},
        },
        options,
      ),
    ).rejects.toMatchObject({code: 'SOURCE_GRAPH_MISSING'});
  });
});

it('keeps a shared include DAG and canonical entry BOM through graph schema views', async () => {
  const dag = {
    ...files,
    'main.k4.yml': files['main.k4.yml'].replace(
      'include: ./parts/a.k4.yml',
      'include: [./parts/a.k4.yml, ./shared.k4.yml]',
    ),
  };
  const {project, options} = await fixture(dag);
  const built = await run(project, options, 'schema-blocks', 'from-source', 'file:main.k4.yml');
  const original = structuredClone(built.project);
  const model = await preview(
    {
      project: built.project,
      source: dag['main.k4.yml'],
      reference: ref('file:main.k4.yml'),
      kind: 'schema-blocks',
    },
    options,
  );
  expect(built.project).toEqual(original);
  expect(Object.keys(model.blocks!).length).toBeGreaterThan(2);
  const restored = await run(
    optimize(structuredClone(built.project)),
    options,
    'schema-blocks',
    'to-source',
    'file:main.k4.yml',
  );
  expect(raws(restored.project)).toEqual(dag);
  const wait = Object.values((built.project.targets as Target[])[0]!.blocks).find((b) =>
    String(b.opcode).endsWith('_wait'),
  ) as Block;
  wait.inputs.SECONDS = [1, [4, 7]];
  const changed = await run(
    built.project,
    options,
    'schema-blocks',
    'to-source',
    'file:main.k4.yml',
  );
  expect(raws(changed.project)['main.k4.yml']!.startsWith('\ufeff# entry comment\r\n')).toBe(true);
  expect(raws(changed.project)['parts/a.k4.yml']).toBe(files['parts/a.k4.yml']);
  expect(raws(changed.project)['shared.k4.yml']).toBe(files['shared.k4.yml']);
});
it('rejects dynamic document includes and invalid relative include edits in common YAML blocks', async () => {
  const {project, options} = await fixture(),
    schema = await run(project, options, 'schema-blocks', 'from-source');
  const include = Object.values((schema.project.targets as Target[])[0]!.blocks).find(
    (b) => b.opcode === dsl4BundledEmbeddedYamlIncludeOpcode,
  ) as Block;
  include.fields = {};
  include.inputs = {
    DOCUMENT: [1, [10, encodeSourceDocumentReference(ref('file:shared.k4.yml'))]],
  };
  await expect(run(schema.project, options, 'schema-blocks', 'to-source')).rejects.toThrow();
  const built = await run(project, options, 'yaml-blocks', 'from-source');
  for (const path of ['../missing.k4.yml', './a.k4.yml', 'https://example.test/module.k4.yml']) {
    const edited = structuredClone(built.project);
    const scalar = Object.values((edited.targets as Target[])[0]!.blocks).find(
      (b) => literalValue(b, 'VALUE') === '../shared.k4.yml',
    ) as Block;
    expect(scalar).toBeDefined();
    scalar.inputs.VALUE = [1, [10, path]];
    await expect(run(edited, options, 'yaml-blocks', 'to-source')).rejects.toThrow();
  }
  expect(raws(built.project)).toEqual(files);
});

it('moves one module across common, schema and raw representations without changing its canonical files', async () => {
  const {project, options} = await fixture();
  const common = await run(project, options, 'yaml-blocks', 'from-source');
  const schema = await run(common.project, options, 'schema-blocks', 'from-source');
  expect(raws(schema.project)).toEqual(files);
  const again = await run(schema.project, options, 'yaml-blocks', 'from-source');
  expect(raws(again.project)).toEqual(files);
  const raw = await run(again.project, options, 'yaml-blocks', 'to-source');
  expect(raws(raw.project)).toEqual(files);
  expect(component(raw.project).assets).toEqual(component(project).assets);
});

it.each(['yaml-blocks', 'schema-blocks'])(
  'permits clean %s modules and rejects value or comment edits without applying them',
  async (kind) => {
    const {project, options} = await fixture();
    expect(() => assertKamishibaiDocumentSourceReady(project)).not.toThrow();
    const built = await run(project, options, kind, 'from-source');
    const cleanBefore = JSON.stringify(built.project);
    expect(() => assertKamishibaiDocumentSourceReady(built.project)).not.toThrow();
    expect(JSON.stringify(built.project)).toBe(cleanBefore);
    expect(readDocumentViewMetadata(component(built.project), ref())?.activeKind).toBe(kind);
    const packaged = cloneKamishibaiDocumentProject(built.project);
    await expect(
      convertDsl4ProjectToCompiledProfile(packaged, {
        sourceFrontend: options.frontend,
        maxSourceBytes: 1024 * 1024,
      }),
    ).resolves.toBeDefined();
    expect(component(packaged).compiled).toBeDefined();
    expect(JSON.stringify(built.project)).toBe(cleanBefore);
    const dirty = structuredClone(built.project) as Project;
    const value = Object.values(dirty.targets[0].blocks).find((block) =>
      kind === 'yaml-blocks'
        ? literalValue(block, 'VALUE') === '2'
        : block.opcode.endsWith('_wait'),
    );
    expect(value).toBeDefined();
    value!.inputs[kind === 'yaml-blocks' ? 'VALUE' : 'SECONDS'] = [
      1,
      [kind === 'yaml-blocks' ? 10 : 4, 9],
    ];
    const dirtyBefore = JSON.stringify(dirty);
    expect(() => assertKamishibaiDocumentSourceReady(dirty)).toThrowError(
      expect.objectContaining({code: 'K4-SOURCE-VIEW-UNAPPLIED'}),
    );
    expect(JSON.stringify(dirty)).toBe(dirtyBefore);
    await expect(
      convertDsl4ProjectToCompiledProfile(cloneKamishibaiDocumentProject(dirty), {
        sourceFrontend: options.frontend,
        maxSourceBytes: 1024 * 1024,
      }),
    ).rejects.toMatchObject({code: 'K4-SOURCE-VIEW-UNAPPLIED'});
    const commentOnly = structuredClone(built.project) as Project;
    const comment = Object.values(commentOnly.targets[0].blocks).find((block) =>
      block.opcode.endsWith('_yamlLineComment'),
    );
    expect(comment).toBeDefined();
    comment!.inputs.TEXT = [1, [10, ' edited comment']];
    expect(() => assertKamishibaiDocumentSourceReady(commentOnly)).toThrowError(
      expect.objectContaining({code: 'K4-SOURCE-VIEW-UNAPPLIED'}),
    );
    const restored = await run(built.project, options, kind, 'to-source');
    expect(() => assertKamishibaiDocumentSourceReady(restored.project)).not.toThrow();
  },
);

it('checks every active document and rejects stale descriptors, unknown representations and unsaved root selection', async () => {
  const {project, options} = await fixture();
  let all = project;
  for (const [index, path] of Object.keys(files).entries())
    all = (
      await run(
        all,
        options,
        index % 2 ? 'yaml-blocks' : 'schema-blocks',
        'from-source',
        'file:' + path,
      )
    ).project as Project;
  const before = JSON.stringify(all);
  expect(() => assertKamishibaiDocumentSourceReady(all)).not.toThrow();
  expect(JSON.stringify(all)).toBe(before);
  const dirty = structuredClone(all);
  const wait = Object.values(dirty.targets[0].blocks).find((block) =>
    block.opcode.endsWith('_wait'),
  )!;
  wait.inputs.SECONDS = [1, [4, 99]];
  expect(() => assertKamishibaiDocumentSourceReady(dirty)).toThrowError(
    expect.objectContaining({code: 'K4-SOURCE-VIEW-UNAPPLIED'}),
  );
  type View = {activeKind: string; descriptors: Record<string, Record<string, unknown>>};
  const states = (p: Project) => (component(p).editorViews as {views: Record<string, View>}).views;
  for (const variant of ['stale', 'unknown-kind', 'unknown-descriptor', 'root']) {
    const invalid = structuredClone(all);
    const state = Object.values(states(invalid))[0]!;
    if (variant === 'stale')
      state.descriptors[state.activeKind]!.baseSourceRevision = 'sha256-stale';
    else if (variant === 'unknown-kind') state.activeKind = 'unknown';
    else if (variant === 'unknown-descriptor')
      state.descriptors[state.activeKind]!.kind = 'unknown';
    else {
      const root = Object.values(invalid.targets[0].blocks).find(
        (block) => block.opcode === dsl4BundledEmbeddedYamlRootOpcode,
      )!;
      root.fields.DOCUMENT = [encodeSourceDocumentReference(ref('file:shared.k4.yml')), null];
    }
    const invalidBefore = JSON.stringify(invalid);
    expect(() => assertKamishibaiDocumentSourceReady(invalid)).toThrowError(
      expect.objectContaining({code: 'K4-SOURCE-VIEW-UNAPPLIED'}),
    );
    expect(JSON.stringify(invalid)).toBe(invalidBefore);
  }
  expect(raws(all)).toEqual(files);
});

it('keeps duplicate module line comments visible and edits one body without leaking across documents', async () => {
  const raw = {
    ...files,
    'parts/a.k4.yml': files['parts/a.k4.yml'].replace(
      '# module comment',
      '# module comment\r\n# module comment',
    ),
  };
  const {project, options} = await fixture(raw),
    built = await run(project, options, 'schema-blocks', 'from-source');
  const comments = Object.values((built.project.targets as Target[])[0]!.blocks).filter(
    (b) =>
      String(b.opcode).endsWith('_yamlLineComment') &&
      literalValue(b, 'TEXT') === ' module comment',
  ) as Block[];
  expect(comments).toHaveLength(2);
  comments[0]!.inputs.TEXT = [1, [10, ' edited module header']];
  const displayed = await preview(
    {
      project: structuredClone(built.project),
      source: raw['parts/a.k4.yml'],
      reference: ref(),
      kind: 'schema-blocks',
    },
    options,
  );
  expect(
    displayed.blockDefinitions?.some((definition) =>
      definition.opcode.endsWith('_yamlLineComment'),
    ),
  ).toBe(true);
  const restored = await run(
      optimize(structuredClone(built.project)),
      options,
      'schema-blocks',
      'to-source',
    ),
    next = raws(restored.project);
  expect(next['main.k4.yml']).toBe(raw['main.k4.yml']);
  expect(next['shared.k4.yml']).toBe(raw['shared.k4.yml']);
  expect(next['parts/a.k4.yml']).toContain('# edited module header\r\n# module comment\r\n');
  expect(next['parts/a.k4.yml']!.match(/# module comment/gu)).toHaveLength(1);
  expect(component(restored.project).assets).toEqual(component(project).assets);
});

it('previews and reflects a frozen graph while sharing large URLs, assets and other immutable namespaces', async () => {
  const {project, options} = await fixture(),
    largeURL = 'data:text/javascript,' + ' '.repeat(4 * 1024 * 1024);
  project.extensionURLs.kubohiroyakamishibai4 = largeURL;
  project.extensionStorage.unrelated = {payload: 'unchanged'};
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  freeze(project);
  const asset = component(project).assets,
    other = project.extensionStorage.unrelated;
  const expectedRaw = raws(project);
  const guarded = {
    ...options,
    replaceSource: async (p: Record<string, unknown>, id: string, source: string) => {
      expect(component(p).assets).toBe(asset);
      expect((p as Project).extensionStorage.unrelated).toBe(other);
      const result = await options.replaceSource(p, id, source);
      expect(component(result.project).assets).toBe(asset);
      return result;
    },
  };
  const model = await preview(
    {
      project,
      source: files['parts/a.k4.yml'],
      reference: ref(),
      kind: 'schema-blocks',
    },
    guarded,
  );
  expect(model.kind).toBe('schema-blocks');
  expect(JSON.stringify(model).length).toBeLessThan(100000);
  expect(raws(project)).toEqual(expectedRaw);
  const editable = cloneKamishibaiDocumentProject(project),
    built = await build(
      {
        project: editable,
        source: files['parts/a.k4.yml'],
        reference: ref(),
        request: {kind: 'schema-blocks', direction: 'from-source'},
      },
      guarded,
    );
  expect(component(built.project).assets).toBe(asset);
  expect(built.project.extensionStorage).not.toBe(project.extensionStorage);
  const reflected = await build(
    {
      project: cloneKamishibaiDocumentProject(built.project),
      source: files['parts/a.k4.yml'],
      reference: ref(),
      request: {kind: 'schema-blocks', direction: 'to-source'},
    },
    guarded,
  );
  expect(raws(reflected.project)).toEqual(expectedRaw);
  expect(component(reflected.project).assets).toBe(asset);
  expect((reflected.project as Project).extensionURLs.kubohiroyakamishibai4).toBe(largeURL);
  expect(raws(project)).toEqual(expectedRaw);
  expect(component(project).editorViews).toBeUndefined();
  expect(project.extensions).not.toContain('kubohiroyakamishibaiauthoring4');
});

it('retains the exact displayed graph candidate for Save without mutating a frozen source project', async () => {
  const {project, options} = await fixture();
  function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  project.extensionStorage.unrelated = {bytes: 'retained'};
  freeze(project);
  const originalBlocks = JSON.stringify(project.targets[0].blocks);
  for (const kind of ['yaml-blocks', 'schema-blocks']) {
    const result = await previewArtifact(
      {project, source: files['parts/a.k4.yml'], reference: ref(), kind},
      options,
    );
    expect(result.candidate?.request).toEqual({
      kind,
      direction: 'from-source',
    });
    const saved = result.candidate!.project as Project;
    expect(result.preview.source).toBe(result.candidate!.source);
    for (const [id, block] of Object.entries(result.preview.blocks!))
      expect(saved.targets[0].blocks[id]).toEqual(block);
    expect(result.preview.rootIds!.every((id) => saved.targets[0].blocks[id])).toBe(true);
    expect(readDocumentViewMetadata(component(saved), ref())?.activeKind).toBe(kind);
    expect(component(saved).assets).toBe(component(project).assets);
    expect(component(saved).sourceDocuments).toEqual(component(project).sourceDocuments);
    expect(saved.extensionStorage.unrelated).toBe(project.extensionStorage.unrelated);
    expect(raws(saved)).toEqual(raws(project));
    expect(JSON.stringify(project.targets[0].blocks)).toBe(originalBlocks);
    expect(component(project).editorViews).toBeUndefined();
    const current = await previewArtifact(
      {
        project: freeze(saved),
        source: files['parts/a.k4.yml'],
        reference: ref(),
        kind,
      },
      options,
    );
    expect(current.candidate?.request).toEqual({kind, direction: 'from-source'});
    expect(readDocumentViewMetadata(component(current.candidate!.project), ref())?.activeKind).toBe(
      kind,
    );
    expect(current.preview.blocks).toEqual(result.preview.blocks);
    const raw = await previewArtifact(
      {
        project: saved,
        source: files['parts/a.k4.yml'],
        reference: ref(),
        kind: 'source',
      },
      options,
    );
    expect(raw.candidate?.request).toEqual({kind, direction: 'to-source'});
    expect(raw.preview.source).toBe(raw.candidate!.source);
    expect(raw.preview.source).toBe(files['parts/a.k4.yml']);
    expect(readDocumentViewMetadata(component(raw.candidate!.project), ref())?.activeKind).toBe(
      'source',
    );
    expect(raws(raw.candidate!.project)).toEqual(raws(project));
  }
});

it('builds a cross-format preview and its Save candidate from the same edited block source', async () => {
  const {project, options} = await fixture();
  const common = await run(project, options, 'yaml-blocks', 'from-source');
  const edited = common.project as Project;
  const scalar = Object.values(edited.targets[0].blocks).find(
    (block) => String(block.opcode).endsWith('yamlScalar') && literalValue(block, 'VALUE') === '2',
  ) as Block;
  expect(scalar).toBeDefined();
  setLiteral(scalar, 'VALUE', '8');
  const before = JSON.stringify(edited);
  const result = await previewArtifact(
    {
      project: edited,
      source: files['parts/a.k4.yml'],
      reference: ref(),
      kind: 'schema-blocks',
    },
    options,
  );
  expect(result.candidate?.request).toEqual({
    kind: 'schema-blocks',
    direction: 'from-source',
  });
  expect(result.preview.source).toBe(result.candidate!.source);
  expect(parse(result.preview.source).scenes.part[0].wait).toBe(8);
  expect(raws(result.candidate!.project)['parts/a.k4.yml']).toBe(result.preview.source);
  for (const [id, block] of Object.entries(result.preview.blocks!))
    expect((result.candidate!.project as Project).targets[0].blocks[id]).toEqual(block);
  expect(JSON.stringify(edited)).toBe(before);
});

it('keeps several dirty module views and reflects them independently across graph revision changes', async () => {
  const {project, options} = await fixture();
  let all = project;
  for (const path of Object.keys(files))
    all = (await run(all, options, 'schema-blocks', 'from-source', 'file:' + path))
      .project as Project;
  const paths = ['parts/a.k4.yml', 'shared.k4.yml'];
  const body = (p: Project, path: string) => {
    const root = Object.values(p.targets[0].blocks).find(
      (b) =>
        b.opcode === dsl4BundledEmbeddedYamlHatOpcode &&
        b.fields.DOCUMENT![0] === encodeSourceDocumentReference(ref('file:' + path)),
    ) as Block;
    const ids = new Set<string>();
    const walk = (id: string) => {
      if (ids.has(id)) throw Error('Unexpected shared graph');
      ids.add(id);
      const b = p.targets[0].blocks[id];
      if (!b) throw Error('A source block is missing');
      if (b.next) walk(b.next);
      for (const input of Object.values(b.inputs))
        for (const child of input.slice(1)) if (typeof child === 'string') walk(child);
    };
    const rootId = Object.entries(p.targets[0].blocks).find(([, b]) => b === root)![0];
    walk(rootId);
    return Object.fromEntries([...ids].map((id) => [id, p.targets[0].blocks[id]!]));
  };
  const waits = paths.map(
    (path) =>
      Object.values(body(all, path)).find((b) => String(b.opcode).endsWith('_wait')) as Block,
  );
  waits[0]!.inputs.SECONDS = [1, [4, 9]];
  waits[1]!.inputs.SECONDS = [1, [4, 8]];
  const sharedBefore = structuredClone(body(all, paths[1]!));
  const entryBefore = structuredClone(body(all, 'main.k4.yml'));
  const invalid = structuredClone(all);
  const include = Object.values(body(invalid, 'parts/a.k4.yml')).find(
    (b) => b.opcode === dsl4BundledEmbeddedYamlIncludeOpcode,
  ) as Block;
  include.fields.DOCUMENT = [encodeSourceDocumentReference(ref('file:main.k4.yml')), null];
  const invalidBefore = JSON.stringify(invalid);
  await expect(
    run(invalid, options, 'schema-blocks', 'to-source', 'file:parts/a.k4.yml'),
  ).rejects.toThrow();
  expect(JSON.stringify(invalid)).toBe(invalidBefore);
  const replaced = await options.replaceSource(
    cloneKamishibaiDocumentProject(all),
    'file:parts/a.k4.yml',
    files['parts/a.k4.yml'].replace('wait: 2', 'wait: 4'),
  );
  await expect(
    run(replaced.project, options, 'schema-blocks', 'to-source', 'file:parts/a.k4.yml'),
  ).rejects.toMatchObject({code: 'PROJECT_CONFLICT'});
  const reflectedA = await run(all, options, 'schema-blocks', 'to-source', 'file:' + paths[0]);
  expect(body(reflectedA.project, paths[1]!)).toEqual(sharedBefore);
  expect(body(reflectedA.project, 'main.k4.yml')).toEqual(entryBefore);
  expect(parse(raws(reflectedA.project)[paths[0]!]!).scenes.part[0].wait).toBe(9);
  expect(raws(reflectedA.project)[paths[1]!]).toBe(files['shared.k4.yml']);
  const reflectedB = await run(
    reflectedA.project,
    options,
    'schema-blocks',
    'to-source',
    'file:' + paths[1],
  );
  expect(parse(raws(reflectedB.project)[paths[0]!]!).scenes.part[0].wait).toBe(9);
  expect(parse(raws(reflectedB.project)[paths[1]!]!).scenes.shared[0].wait).toBe(8);
  const entryCommon = await run(
    reflectedB.project,
    options,
    'yaml-blocks',
    'from-source',
    'file:main.k4.yml',
  );
  expect(raws(entryCommon.project)).toEqual(raws(reflectedB.project));
  expect(
    readDocumentViewMetadata(component(entryCommon.project), ref('file:main.k4.yml'))?.activeKind,
  ).toBe('yaml-blocks');
  expect(raws(all)).toEqual(files);
  for (const path of Object.keys(files))
    expect(readDocumentViewMetadata(component(all), ref('file:' + path))?.activeKind).toBe(
      'schema-blocks',
    );
});
