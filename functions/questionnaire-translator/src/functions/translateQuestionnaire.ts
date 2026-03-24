import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { randomUUID } from "crypto";
import { transformQuestionnaireMapToGroups } from "../lib/transform";
import type { TranslateResponseBody } from "../lib/types";

const SHARED_SECRET_ENV = "TRANSLATE_SHARED_SECRET";

/**
 * Reads the optional shared-secret header (case-insensitive via Headers API).
 */
function readSharedSecretHeader(request: HttpRequest): string | null {
  const value = request.headers.get("x-shared-secret");
  return value === null || value === "" ? null : value;
}

/**
 * When `TRANSLATE_SHARED_SECRET` is non-empty, requires matching `x-shared-secret` header.
 */
function isSharedSecretValid(request: HttpRequest): boolean {
  const configured = process.env[SHARED_SECRET_ENV];
  if (configured === undefined || configured === "") {
    return true;
  }
  const provided = readSharedSecretHeader(request);
  return provided === configured;
}

/**
 * HTTP POST handler: parses JSON body, transforms questionnaire map to `groups[]`, returns envelope with meta.
 */
export async function translateQuestionnaireHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const requestId = randomUUID();
  const started = performance.now();

  if (!isSharedSecretValid(request)) {
    context.warn(`translateQuestionnaire: unauthorized request ${requestId}`);
    return {
      status: 401,
      jsonBody: {
        error: "Unauthorized",
        requestId
      }
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      status: 400,
      jsonBody: {
        error: "Request body must be valid JSON",
        requestId
      }
    };
  }

  const result = transformQuestionnaireMapToGroups(body);
  if (!result.ok) {
    return {
      status: 400,
      jsonBody: {
        error: result.error,
        warnings: result.warnings,
        requestId
      }
    };
  }

  const elapsedMs = Math.round(performance.now() - started);

  const responseBody: TranslateResponseBody = {
    schemaVersion: "1.0",
    questionnaire: result.questionnaire,
    warnings: result.warnings,
    meta: {
      requestId,
      elapsedMs,
      groupCount: result.groupCount,
      itemCount: result.itemCount
    }
  };

  return {
    status: 200,
    jsonBody: responseBody
  };
}

app.http("translateQuestionnaire", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "translateQuestionnaire",
  handler: translateQuestionnaireHandler
});
