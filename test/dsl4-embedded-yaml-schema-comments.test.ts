import assert from 'node:assert/strict';
import {describe, it, expect} from 'vitest';
import {parse} from 'yaml';
import schema from '../schema/dsl-4.schema.json' with {type: 'json'};
import {createDsl4ProductionSourceFrontend} from '../src/builder/dsl4-source-frontend.js';
import {
  buildKamishibaiSchemaBlockView,
  sourceFromKamishibaiSchemaBlockView,
} from '../src/dsl4/embedded-yaml-representations.js';
const frontend = createDsl4ProductionSourceFrontend(schema),
  reference = {providerId: 'kamishibai-dsl4', documentId: 'story'};
const source =
  "\ufeff# heading\r\nkamishibai: '4.0'\r\n# control notes\r\ncontrols:\r\n  keymaps:\r\n    production:\r\n      Space: navigation.nextAction\r\nscenes:\r\n  # scene notes\r\n  opening:\r\n    # action notes\r\n    - wait: 1\r\n    # next action notes\r\n    - wait: 2\r\n# final notes\r\n";
const original = () => ({
  targets: [{name: 'Stage', isStage: true, blocks: {}}],
  extensionStorage: {preserve: 'yes'},
});
const build = (text = source) =>
  buildKamishibaiSchemaBlockView(original(), {
    reference,
    source: text,
    sourceId: 'comments.k4.yml',
    form: 'bundled',
    sourceFrontend: frontend,
  });
interface TestBlock {
  opcode: string;
  parent: string | null;
  next: string | null;
  inputs: Record<string, [number, unknown, unknown?]>;
  fields: Record<string, unknown[]>;
}
const blocks = (value: ReturnType<typeof build>) =>
  (value.project.targets as {blocks: Record<string, TestBlock>}[])[0]!.blocks;
function literal(block: TestBlock, name: string): unknown {
  const input = block.inputs[name]?.[1];
  return Array.isArray(input) ? input[1] : undefined;
}
function optimized(value: ReturnType<typeof build>) {
  const b = blocks(value),
    ids = Object.fromEntries(Object.keys(b).map((id, i) => [id, `s${i}`]));
  (value.project.targets as {blocks: Record<string, TestBlock>}[])[0]!.blocks = Object.fromEntries(
    Object.entries(b).map(([id, item]) => {
      const n = structuredClone(item);
      if (typeof n.parent === 'string') n.parent = ids[n.parent]!;
      if (typeof n.next === 'string') n.next = ids[n.next]!;
      for (const input of Object.values(n.inputs))
        if (Array.isArray(input))
          for (const index of [1, 2])
            if (typeof input[index] === 'string') input[index] = ids[input[index]];
      return [ids[id]!, n];
    }),
  );
  return value;
}
describe('explicit schema line comments', () => {
  it('places independent lines beside real declarations and actions, preserving all bytes after optimized save IDs', () => {
    const built = build(),
      b = blocks(built),
      comments = Object.values(b).filter((v) => v.opcode.endsWith('_yamlLineComment'));
    expect(comments).toHaveLength(6);
    const afterIds = optimized(built);
    expect(
      sourceFromKamishibaiSchemaBlockView(afterIds.project, afterIds.descriptor, source, frontend),
    ).toBe(source);
    expect(
      built.descriptor.lineComments?.bindings.every(
        (binding) => !JSON.stringify(binding).includes('twpeSchema'),
      ),
    ).toBe(true);
  });
  it('updates comment bodies and scalar values in their original positions without duplicate comments', () => {
    const built = build(),
      b = blocks(built);
    const comment = Object.values(b).find((v) => literal(v, 'TEXT') === ' action notes');
    assert.ok(comment);
    comment.inputs.TEXT = [1, [10, ' edited action notes']];
    const wait = Object.values(b).find(
      (v) => String(v.opcode).endsWith('__wait') && literal(v, 'SECONDS') === '1',
    );
    assert.ok(wait);
    wait.inputs.SECONDS = [1, [4, '5']];
    const patched = sourceFromKamishibaiSchemaBlockView(
      built.project,
      built.descriptor,
      source,
      frontend,
    );
    expect(patched.startsWith('\ufeff# heading\r\n')).toBe(true);
    expect(patched.match(/# edited action notes/gu)).toHaveLength(1);
    expect(patched).toContain('# next action notes');
    expect((parse(patched) as {scenes: {opening: unknown[]}}).scenes.opening).toEqual([
      {wait: 5},
      {wait: 2},
    ]);
  });
  it('rejects comments inside opaque JSON fields and unsupported inline comments without changing the source project', () => {
    for (const text of [
      source.replace(
        '      Space: navigation.nextAction',
        '      # field comment\r\n      Space: navigation.nextAction',
      ),
      source.replace('Space: navigation.nextAction', 'Space: navigation.nextAction # inline'),
    ]) {
      const project = original(),
        before = structuredClone(project);
      expect(() =>
        buildKamishibaiSchemaBlockView(project, {
          reference,
          source: text,
          sourceId: 'unsafe.k4.yml',
          form: 'bundled',
          sourceFrontend: frontend,
        }),
      ).toThrow(/comment.*schema|Inline comments|visible schema statement/iu);
      expect(project).toEqual(before);
    }
  });
  it('rejects deletion, ambiguous movement and malformed original parent links rather than repairing them', () => {
    for (const mode of ['delete', 'move', 'bad-parent']) {
      const built = build(),
        b = blocks(built),
        entry = Object.entries(b).find(([, v]) => literal(v, 'TEXT') === ' action notes')!,
        [id, comment] = entry;
      if (mode === 'delete') {
        assert.ok(comment.parent);
        assert.ok(comment.next);
        const parent = b[comment.parent]!;
        if (parent.next === id) parent.next = comment.next;
        else parent.inputs.SUBSTACK![1] = comment.next;
        b[comment.next]!.parent = comment.parent;
        delete b[id];
      } else if (mode === 'move') comment.fields.PLACEMENT = ['after', null];
      else comment.parent = 'forged-parent';
      expect(() =>
        sourceFromKamishibaiSchemaBlockView(built.project, built.descriptor, source, frontend),
      ).toThrow();
    }
  });
});
