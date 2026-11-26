import {isDsl4ActorCoreSourceAction} from './action-registry.js';

export type Dsl4DefinitionPath = (string | number)[];
export interface Dsl4DefinitionReference {
  namespace: string;
  name: string;
  path: Dsl4DefinitionPath;
  access: 'read' | 'write' | 'owner';
  assetKind?: string;
  actor?: string;
}

export function definitionRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const referenceNamespaces: Record<string, string> = {
  textInterpolationVariableName: 'variables',
  assetId: 'assets',
  actorId: 'actors',
  styleId: 'textStyles',
  sceneId: 'scenes',
  bubbleStyleName: 'bubbleStyles',
  bubbleClosePolicyName: 'bubbleClosePolicies',
  navigationCommand: '$commands',
};

function assetContext(path: Dsl4DefinitionPath): {assetKind: string; actor?: string} {
  const field = path.at(-1);
  if (path[0] === 'actors') return {assetKind: 'costume', actor: String(path[1])};
  if (field === 'recognitionModel') return {assetKind: 'recognitionModel'};
  if (field === 'backdrop' || field === 'stage') return {assetKind: 'backdrop'};
  if (
    path.includes('costumes') ||
    field === 'skin' ||
    (typeof field === 'string' && field.endsWith('.setSkin'))
  ) {
    const action = [...path]
      .reverse()
      .find((part) => typeof part === 'string' && part.includes('.'));
    return {
      assetKind: 'costume',
      ...(typeof action === 'string' ? {actor: action.slice(0, action.lastIndexOf('.'))} : {}),
    };
  }
  if (field === 'asset') return {assetKind: path.includes('video') ? 'video' : 'sound'};
  if (path.includes('portrait') || path.includes('continueIndicator') || path.includes('controls'))
    return {assetKind: 'image'};
  return {assetKind: 'sound'};
}

/** Collect variable names without evaluating a condition or following its short circuit. */
function expressionNames(expression: string): string[] | null {
  const tokens: {kind: string; value: string}[] = [];
  let cursor = 0;
  while (cursor < expression.length) {
    const rest = expression.slice(cursor);
    const whitespace = /^\s+/u.exec(rest)?.[0];
    if (whitespace) {
      cursor += whitespace.length;
      continue;
    }
    const quote = expression[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      let text = '';
      let closed = false;
      while (cursor < expression.length) {
        const character = expression[cursor++]!;
        if (character === quote) {
          closed = true;
          break;
        }
        if (character !== '\\') {
          text += character;
          continue;
        }
        const escaped = expression[cursor++];
        const replacements: Record<string, string> = {
          '"': '"',
          "'": "'",
          '\\': '\\',
          n: '\n',
          r: '\r',
          t: '\t',
          b: '\b',
          f: '\f',
          v: '\v',
          '0': '\0',
        };
        if (escaped === 'u') {
          const hexadecimal = expression.slice(cursor, cursor + 4);
          if (!/^[0-9a-f]{4}$/iu.test(hexadecimal)) return null;
          text += String.fromCharCode(Number.parseInt(hexadecimal, 16));
          cursor += 4;
        } else if (escaped !== undefined && Object.hasOwn(replacements, escaped))
          text += replacements[escaped];
        else return null;
      }
      if (!closed) return null;
      tokens.push({kind: 'string', value: text});
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(rest)?.[0];
    const name = /^[A-Za-z_$][A-Za-z0-9_$]*/u.exec(rest)?.[0];
    const operator = /^(?:===|!==|==|!=|<=|>=|&&|\|\||[!+*/%<>()\[\]-])/u.exec(rest)?.[0];
    const value = number ?? name ?? operator;
    if (!value) return null;
    tokens.push({kind: number ? 'number' : name ? 'name' : 'operator', value});
    cursor += value.length;
  }
  const names: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== 'name') continue;
    if (['vars', 'runtime'].includes(token.value) && tokens[i + 1]?.value === '[') {
      if (tokens[i + 2]?.kind !== 'string' || tokens[i + 3]?.value !== ']') return null;
      if (token.value === 'vars') names.push(tokens[i + 2]!.value);
      i += 3;
    } else if (!['true', 'false', 'null', 'undefined'].includes(token.value))
      names.push(token.value);
  }
  return names;
}

/** Walk canonical schema references and every authored branch, including zero-count loops. */
export function collectDsl4DefinitionReferences(story: Record<string, unknown>, schema: unknown) {
  const definitions = definitionRecord(definitionRecord(schema).$defs);
  if (!Object.hasOwn(definitions, 'assetId') || !Object.hasOwn(definitions, 'action'))
    throw new TypeError('Definition analysis requires the canonical DSL4 schema');
  const references: Dsl4DefinitionReference[] = [];
  const uncertain: {path: Dsl4DefinitionPath; namespaces: string[]; reason: string}[] = [];
  const seen = new Set<string>();
  const allNamespaces = ['assets', 'actors', 'textStyles', 'variables'];
  function add(
    namespace: string,
    value: unknown,
    path: Dsl4DefinitionPath,
    access: Dsl4DefinitionReference['access'] = 'read',
  ) {
    if (typeof value !== 'string') {
      if (value !== undefined)
        uncertain.push({path, namespaces: [namespace], reason: '参照先を静的に確定できません'});
      return;
    }
    const key = JSON.stringify([namespace, value, path, access]);
    if (seen.has(key)) return;
    seen.add(key);
    references.push({
      namespace,
      name: value,
      path,
      access,
      ...(namespace === 'assets' ? assetContext(path) : {}),
    });
  }
  function walk(value: unknown, node: unknown, path: Dsl4DefinitionPath, depth = 0) {
    if (depth > 256) {
      uncertain.push({path, namespaces: allNamespaces, reason: '参照解析の深さ上限を超えました'});
      return;
    }
    const rule = definitionRecord(node);
    if (typeof rule.$ref === 'string' && rule.$ref.startsWith('#/$defs/')) {
      const name = rule.$ref.slice('#/$defs/'.length);
      const namespace = referenceNamespaces[name];
      if (namespace) {
        // Media instance IDs share the schema's string type but never name an asset.
        if (
          name === 'assetId' &&
          path[0] === 'scenes' &&
          path.at(-1) === 'id' &&
          path.some((part) =>
            ['audio', 'audioControl', 'video', 'videoControl'].includes(String(part)),
          )
        )
          return;
        add(
          namespace,
          value,
          path,
          namespace === 'actors' && path[0] === 'assets' ? 'owner' : 'read',
        );
        return;
      }
      walk(value, definitions[name], path, depth + 1);
    }
    for (const combinator of ['oneOf', 'anyOf', 'allOf']) {
      const alternatives = rule[combinator];
      if (Array.isArray(alternatives))
        for (const alternative of alternatives) walk(value, alternative, path, depth + 1);
    }
    if (Array.isArray(value)) {
      if (rule.items !== undefined)
        value.forEach((child, i) => walk(child, rule.items, [...path, i], depth + 1));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const properties = definitionRecord(rule.properties);
    const patterns = Object.entries(definitionRecord(rule.patternProperties));
    for (const [key, child] of Object.entries(value)) {
      let matched = false;
      if (Object.hasOwn(properties, key)) {
        walk(child, properties[key], [...path, key], depth + 1);
        matched = true;
      }
      for (const [pattern, nested] of patterns) {
        if (new RegExp(pattern, 'u').test(key)) {
          walk(child, nested, [...path, key], depth + 1);
          matched = true;
        }
      }
      if (!matched && typeof rule.additionalProperties === 'object')
        walk(child, rule.additionalProperties, [...path, key], depth + 1);
    }
  }
  function condition(value: unknown, path: Dsl4DefinitionPath) {
    if (typeof value === 'string') {
      const names = expressionNames(value);
      if (names === null)
        uncertain.push({path, namespaces: ['variables'], reason: '式の参照を静的に確定できません'});
      else for (const name of names) add('variables', name, path);
    } else if (Array.isArray(value)) value.forEach((child, i) => condition(child, [...path, i]));
    else
      for (const [key, child] of Object.entries(definitionRecord(value))) {
        if (key === 'variable') add('variables', child, [...path, key]);
        else if (key !== 'ref' && key !== 'operator') {
          if (key === 'not' || typeof child !== 'string') condition(child, [...path, key]);
        }
      }
  }
  function actions(items: unknown, path: Dsl4DefinitionPath) {
    if (!Array.isArray(items)) return;
    items.forEach((action, i) => {
      const at = [...path, i];
      for (const [command, value] of Object.entries(definitionRecord(action))) {
        const args = definitionRecord(value);
        if (command === 'if') {
          condition(args.condition, [...at, command, 'condition']);
          actions(args.then, [...at, command, 'then']);
          actions(args.else, [...at, command, 'else']);
        } else if (command === 'invalidate') actions(args.then, [...at, command, 'then']);
        else if (command === 'repeat' || command === 'forEach')
          actions(args.do, [...at, command, 'do']);
        else {
          walk({[command]: value}, {$ref: '#/$defs/action'}, at);
          if (command.includes('.')) {
            const separator = command.lastIndexOf('.');
            add('actors', command.slice(0, separator), [...at, command]);
            if (!isDsl4ActorCoreSourceAction(command.slice(separator + 1), value))
              uncertain.push({
                path: [...at, command],
                namespaces: allNamespaces,
                reason: '独自命令は定義を外部から利用する可能性があります',
              });
          }
          if (['setVariable', 'changeVariable', 'toggleVariable'].includes(command))
            add(
              'variables',
              command === 'toggleVariable' ? value : args.name,
              [...at, command, ...(command === 'toggleVariable' ? [] : ['name'])],
              command === 'setVariable' ? 'write' : 'read',
            );
          if (command === 'branch')
            add('branches', typeof value === 'string' ? value : args.branch, [...at, command]);
          if (command === 'broadcastMessageAndWait' || command === 'gotoSegment')
            uncertain.push({
              path: [...at, command],
              namespaces: allNamespaces,
              reason: '外部処理からの定義利用を静的に確定できません',
            });
        }
      }
    });
  }
  for (const [section, value] of Object.entries(story)) {
    if (section === 'scenes') {
      for (const [id, scene] of Object.entries(definitionRecord(value))) {
        const fields = definitionRecord(scene);
        walk({...fields, actions: []}, {$ref: '#/$defs/longScene'}, [section, id]);
        actions(Array.isArray(scene) ? scene : fields.actions, [
          section,
          id,
          ...(Array.isArray(scene) ? [] : ['actions']),
        ]);
      }
    } else walk(value, definitionRecord(definitionRecord(schema).properties)[section], [section]);
  }
  for (const [id, rules] of Object.entries(definitionRecord(story.branches))) {
    if (Array.isArray(rules))
      rules.forEach((rule, i) => {
        const value = definitionRecord(rule).if;
        if (typeof value === 'string') condition(value, ['branches', id, i, 'if']);
      });
  }
  // Compact costume declarations carry their owner in the string instead of a schema field.
  for (const [id, asset] of Object.entries(definitionRecord(story.assets))) {
    if (typeof asset === 'string' && asset.startsWith('costume:'))
      add('actors', asset.slice('costume:'.length), ['assets', id], 'owner');
  }
  return {references, uncertain};
}
