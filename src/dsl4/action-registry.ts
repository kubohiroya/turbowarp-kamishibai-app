import {dsl4CoreActionManifest} from './core-action-manifest.js';

const identifierPattern = /^[\p{L}_][\p{L}\p{N}_-]*$/u;
const parameterTypes = new Set(['string', 'number', 'boolean']);
const quiesceModes = new Set(['finish-only', 'cancel-replay-safe']);
const entryKeys = new Set(['name', 'target', 'parameters', 'quiesce', 'source']);
const parameterKeys = new Set(['name', 'type', 'required']);
const sourceKeys = new Set(['targetId', 'hatBlockId']);
const snapshotKeys = new Set(['kind', 'version', 'actions']);

export const dsl4GlobalCoreActionNames = Object.freeze(
  dsl4CoreActionManifest.filter(({target}) => target === 'global').map(({command}) => command),
);

export const dsl4ActorCoreActionNames = Object.freeze(
  dsl4CoreActionManifest.filter(({target}) => target === 'actor').map(({command}) => command),
);

export const dsl4CoreActionNames = Object.freeze([
  ...dsl4GlobalCoreActionNames,
  ...dsl4ActorCoreActionNames,
]);

const coreActionNames = new Set(dsl4CoreActionNames);
const actorCoreActionNames = new Set(dsl4ActorCoreActionNames);

// These two additions must not reserve names in existing DSL 4.0 custom hats.
const presentationCompatibilityNames = new Set(['animate', 'presentationEffect']);

export function isDsl4ReservedCustomActionName(name: string): boolean {
  return coreActionNames.has(name) && !presentationCompatibilityNames.has(name);
}

/** Classify only dotted source actions; global presentationEffect is not an actor action. */
export function isDsl4ActorCoreSourceAction(command: string, value: unknown): boolean {
  return command === 'animate'
    ? isRecord(value) && Object.hasOwn(value, 'to')
    : actorCoreActionNames.has(command);
}

export class Dsl4ActionRegistryError extends TypeError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'Dsl4ActionRegistryError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  required: readonly string[],
) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      `${label} keys are invalid (unknown: ${unknown.sort().join(', ') || 'none'}; missing: ${missing.sort().join(', ') || 'none'})`,
    );
  }
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !identifierPattern.test(value)) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-NAME-001',
      `${label} must be a DSL 4.0 identifier`,
    );
  }
  if (value !== value.normalize('NFC')) {
    throw new Dsl4ActionRegistryError('K4-REGISTRY-NAME-001', `${label} must use Unicode NFC`);
  }
  return value;
}

function requireSourceId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      `${label} must be a non-empty string`,
    );
  }
  return value;
}

/**
 * Create the deterministic immutable snapshot consumed by one DSL 4.0 parse/runtime generation.
 * The TurboWarp adapter is responsible for converting detected hats into these entries.
 */
export function createDsl4ActionRegistrySnapshot(inputEntries: unknown) {
  if (!Array.isArray(inputEntries)) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      'Action Registry entries must be an array',
    );
  }

  const names = new Set();
  const actions = inputEntries.map((inputEntry, entryIndex) => {
    if (!isRecord(inputEntry)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-SNAPSHOT-001',
        `Action Registry entry ${entryIndex} must be an object`,
      );
    }
    requireExactKeys(inputEntry, entryKeys, `Action Registry entry ${entryIndex}`, [
      'name',
      'target',
      'parameters',
      'source',
    ]);
    const name = requireIdentifier(inputEntry.name, `Action Registry entry ${entryIndex} name`);
    if (isDsl4ReservedCustomActionName(name)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-COLLISION-001',
        `Custom action ${name} collides with a DSL 4.0 core action`,
      );
    }
    if (names.has(name)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-COLLISION-001',
        `Custom action ${name} has more than one handler`,
      );
    }
    names.add(name);
    if (inputEntry.target !== 'actor') {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-SNAPSHOT-001',
        `Custom action ${name} target must be actor`,
      );
    }
    if (!Array.isArray(inputEntry.parameters)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-SNAPSHOT-001',
        `Custom action ${name} parameters must be an array`,
      );
    }

    const parameterNames = new Set();
    const parameters = inputEntry.parameters.map((inputParameter, parameterIndex) => {
      if (!isRecord(inputParameter)) {
        throw new Dsl4ActionRegistryError(
          'K4-REGISTRY-SNAPSHOT-001',
          `Custom action ${name} parameter ${parameterIndex} must be an object`,
        );
      }
      requireExactKeys(
        inputParameter,
        parameterKeys,
        `Custom action ${name} parameter ${parameterIndex}`,
        ['name', 'type'],
      );
      const parameterName = requireIdentifier(
        inputParameter.name,
        `Custom action ${name} parameter ${parameterIndex} name`,
      );
      if (parameterNames.has(parameterName)) {
        throw new Dsl4ActionRegistryError(
          'K4-REGISTRY-COLLISION-001',
          `Custom action ${name} has duplicate parameter ${parameterName}`,
        );
      }
      parameterNames.add(parameterName);
      if (typeof inputParameter.type !== 'string' || !parameterTypes.has(inputParameter.type)) {
        throw new Dsl4ActionRegistryError(
          'K4-REGISTRY-PARAMETER-001',
          `Custom action ${name} parameter ${parameterName} has an unsupported type`,
        );
      }
      if (
        Object.hasOwn(inputParameter, 'required') &&
        typeof inputParameter.required !== 'boolean'
      ) {
        throw new Dsl4ActionRegistryError(
          'K4-REGISTRY-PARAMETER-001',
          `Custom action ${name} parameter ${parameterName} required must be boolean`,
        );
      }
      return {
        name: parameterName,
        type: inputParameter.type,
        required: inputParameter.required ?? true,
      };
    });

    const quiesce = inputEntry.quiesce ?? 'finish-only';
    if (typeof quiesce !== 'string' || !quiesceModes.has(quiesce)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-QUIESCE-001',
        `Custom action ${name} quiesce must be finish-only or cancel-replay-safe`,
      );
    }

    if (!isRecord(inputEntry.source)) {
      throw new Dsl4ActionRegistryError(
        'K4-REGISTRY-SNAPSHOT-001',
        `Custom action ${name} source must be an object`,
      );
    }
    requireExactKeys(inputEntry.source, sourceKeys, `Custom action ${name} source`, [
      'targetId',
      'hatBlockId',
    ]);
    return {
      name,
      target: 'actor',
      parameters,
      quiesce,
      source: {
        targetId: requireSourceId(inputEntry.source.targetId, `Custom action ${name} targetId`),
        hatBlockId: requireSourceId(
          inputEntry.source.hatBlockId,
          `Custom action ${name} hatBlockId`,
        ),
      },
    };
  });

  actions.sort(({name: left}, {name: right}) => (left < right ? -1 : left > right ? 1 : 0));
  return deepFreeze({kind: 'ActionRegistrySnapshot', version: 2, actions});
}

export const dsl4EmptyActionRegistrySnapshot = createDsl4ActionRegistrySnapshot([]);

/** Validate and canonicalize a snapshot crossing an adapter/core boundary. */
export function validateDsl4ActionRegistrySnapshot(inputSnapshot: unknown) {
  if (!isRecord(inputSnapshot)) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      'Action Registry Snapshot must be an object',
    );
  }
  requireExactKeys(inputSnapshot, snapshotKeys, 'Action Registry Snapshot', [
    'kind',
    'version',
    'actions',
  ]);
  if (
    inputSnapshot.kind !== 'ActionRegistrySnapshot' ||
    (inputSnapshot.version !== 1 && inputSnapshot.version !== 2)
  ) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      'Action Registry Snapshot kind or version is unsupported',
    );
  }
  const canonical = createDsl4ActionRegistrySnapshot(inputSnapshot.actions);
  const inputActions = inputSnapshot.actions as Record<string, unknown>[];
  const hasCanonicalActionOrder = inputActions.every(
    (action, index) => action.name === canonical.actions[index]?.name,
  );
  const hasNormalizedParameters = inputActions.every(
    (action) =>
      Array.isArray(action.parameters) &&
      action.parameters.every(
        (parameter) => isRecord(parameter) && Object.hasOwn(parameter, 'required'),
      ),
  );
  const hasNormalizedQuiesce = inputActions.every((action, index) =>
    inputSnapshot.version === 1
      ? !Object.hasOwn(action, 'quiesce')
      : action.quiesce === canonical.actions[index]?.quiesce,
  );
  if (!hasCanonicalActionOrder || !hasNormalizedParameters || !hasNormalizedQuiesce) {
    throw new Dsl4ActionRegistryError(
      'K4-REGISTRY-SNAPSHOT-001',
      'Action Registry Snapshot must use canonical action order and normalized fields',
    );
  }
  return canonical;
}
