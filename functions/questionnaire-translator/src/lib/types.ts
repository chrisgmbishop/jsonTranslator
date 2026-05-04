/**
 * Questionnaire item after normalization: original fields plus required `name` from the source key.
 */
export type QuestionnaireItem = Readonly<{
  name: string;
  [key: string]: unknown;
}>;

/**
 * One section (former top-level object) expressed as a named list of items.
 * `displayName` is the human label from `@props.l` when present; otherwise equals `name`.
 */
export type QuestionnaireGroup = Readonly<{
  name: string;
  displayName: string;
  items: readonly QuestionnaireItem[];
}>;

/**
 * Output shape consumed by DocumentsCorePack / reporting (inner payload).
 */
export type TransformedQuestionnaire = Readonly<{
  "@ver"?: unknown;
  "@q"?: unknown;
  groups: readonly QuestionnaireGroup[];
}>;

export type TransformWarning = Readonly<{
  code: string;
  message: string;
  path: string;
}>;

export type TransformSuccess = Readonly<{
  ok: true;
  questionnaire: TransformedQuestionnaire;
  warnings: readonly TransformWarning[];
  groupCount: number;
  itemCount: number;
}>;

export type TransformFailure = Readonly<{
  ok: false;
  error: string;
  warnings: readonly TransformWarning[];
}>;

export type TransformResult = TransformSuccess | TransformFailure;

/**
 * HTTP envelope returned by the Azure Function.
 */
export type TranslateResponseBody = Readonly<{
  schemaVersion: "1.0";
  questionnaire: TransformedQuestionnaire;
  warnings: readonly TransformWarning[];
  meta: Readonly<{
    requestId: string;
    elapsedMs: number;
    groupCount: number;
    itemCount: number;
  }>;
}>;
