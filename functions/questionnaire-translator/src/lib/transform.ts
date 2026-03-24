import type {
  QuestionnaireGroup,
  QuestionnaireItem,
  TransformResult,
  TransformSuccess,
  TransformWarning,
  TransformedQuestionnaire
} from "./types";

const PASSTHROUGH_AT_KEYS = new Set<string>(["@ver", "@q"]);

/**
 * Returns true when `value` is a non-null plain object (not array, not Date).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Deep-clones JSON-serializable plain objects via JSON round-trip (questionnaire payloads are JSON-safe).
 */
function clonePlainObject(obj: Record<string, unknown>): Record<string, unknown> {
  const raw: unknown = JSON.parse(JSON.stringify(obj));
  if (!isPlainObject(raw)) {
    throw new Error("clonePlainObject: invariant failed — value is not a plain object");
  }
  return raw;
}

/**
 * Strips a conflicting `name` key from the clone so the injected `name` always reflects the source key.
 */
function omitNameKey(obj: Record<string, unknown>): Record<string, unknown> {
  const { name: _removed, ...rest } = obj;
  return rest;
}

/**
 * Builds one item: `{ name: itemKey, ...clonedFields }` with `name` reflecting the source key.
 */
function buildItem(itemKey: string, itemValue: unknown, itemPath: string, warnings: TransformWarning[]): QuestionnaireItem | null {
  if (!isPlainObject(itemValue)) {
    warnings.push({
      code: "ITEM_SKIPPED",
      message: `Expected object at ${itemPath}, received ${typeof itemValue}`,
      path: itemPath
    });
    return null;
  }
  const cloned = clonePlainObject(itemValue);
  const withoutName = omitNameKey(cloned);
  const item: QuestionnaireItem = {
    name: itemKey,
    ...withoutName
  };
  return item;
}

/**
 * Converts a section object into a group with ordered items; appends item-level warnings to `warnings`.
 */
function buildGroupWithWarnings(
  sectionKey: string,
  sectionValue: Record<string, unknown>,
  warnings: TransformWarning[]
): QuestionnaireGroup {
  const items: QuestionnaireItem[] = [];
  for (const itemKey of Object.keys(sectionValue)) {
    const itemPath = `${sectionKey}.${itemKey}`;
    const itemValue = sectionValue[itemKey];
    const built = buildItem(itemKey, itemValue, itemPath, warnings);
    if (built === null) {
      continue;
    }
    items.push(built);
  }
  return { name: sectionKey, items };
}

/**
 * Transforms a questionnaire JSON root object from `{ sectionKey: { itemKey: {...} } } }` into `{ groups: [...] }`.
 * Preserves `@ver` and `@q` as-is. Other top-level keys starting with `@` are skipped with a warning.
 */
export function transformQuestionnaireMapToGroups(root: unknown): TransformResult {
  const warnings: TransformWarning[] = [];

  if (!isPlainObject(root)) {
    return {
      ok: false,
      error: "Root JSON value must be a plain object",
      warnings
    };
  }

  let atVer: unknown;
  let atQ: unknown;

  if (Object.prototype.hasOwnProperty.call(root, "@ver")) {
    atVer = root["@ver"];
  }
  if (Object.prototype.hasOwnProperty.call(root, "@q")) {
    atQ = root["@q"];
  }

  const groups: QuestionnaireGroup[] = [];
  let itemCount = 0;

  for (const key of Object.keys(root)) {
    if (key === "@ver" || key === "@q") {
      continue;
    }
    if (key.startsWith("@")) {
      if (!PASSTHROUGH_AT_KEYS.has(key)) {
        warnings.push({
          code: "TOP_LEVEL_AT_SKIPPED",
          message: `Skipping unsupported metadata key "${key}"`,
          path: key
        });
      }
      continue;
    }

    const value = root[key];
    if (!isPlainObject(value)) {
      warnings.push({
        code: "SECTION_SKIPPED",
        message: `Skipping non-object section "${key}"`,
        path: key
      });
      continue;
    }

    const group = buildGroupWithWarnings(key, value, warnings);
    groups.push(group);
    itemCount += group.items.length;
  }

  const questionnaire: TransformedQuestionnaire = {
    ...(atVer !== undefined ? { "@ver": atVer } : {}),
    ...(atQ !== undefined ? { "@q": atQ } : {}),
    groups
  };

  const result: TransformSuccess = {
    ok: true,
    questionnaire,
    warnings,
    groupCount: groups.length,
    itemCount
  };

  return result;
}
