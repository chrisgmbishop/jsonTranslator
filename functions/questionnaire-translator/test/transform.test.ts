import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { transformQuestionnaireMapToGroups } from "../src/lib/transform";
import type { TransformedQuestionnaire } from "../src/lib/types";

const testDir = dirname(fileURLToPath(import.meta.url));

function readFixtureJson(relativePath: string): unknown {
  const fullPath = join(testDir, relativePath);
  const text = readFileSync(fullPath, "utf8");
  return JSON.parse(text) as unknown;
}

describe("transformQuestionnaireMapToGroups", () => {
  it("maps minimal object sections to groups with injected item names", () => {
    const input: Record<string, unknown> = {
      "@ver": "f1.0",
      "@q": { ID: "abc" },
      sectionA: {
        itemOne: { v: 1, l: "Label" },
        itemTwo: { d: "desc" }
      }
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.questionnaire["@ver"]).toBe("f1.0");
    expect(result.questionnaire["@q"]).toEqual({ ID: "abc" });
    expect(result.groupCount).toBe(1);
    expect(result.itemCount).toBe(2);
    expect(result.questionnaire.groups).toEqual([
      {
        name: "sectionA",
        items: [
          { name: "itemOne", v: 1, l: "Label" },
          { name: "itemTwo", d: "desc" }
        ]
      }
    ]);
  });

  it("records warning for unsupported top-level @ keys and skips them", () => {
    const input: Record<string, unknown> = {
      "@ver": "1",
      "@custom": { a: 1 },
      sec: { x: { v: 1 } }
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.warnings.some((w) => w.code === "TOP_LEVEL_AT_SKIPPED")).toBe(true);
    expect(result.questionnaire.groups.map((g) => g.name)).toEqual(["sec"]);
  });

  it("returns failure for non-object root", () => {
    const result = transformQuestionnaireMapToGroups([]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("plain object");
  });

  it("full fixture: group order and names match top-level section keys", () => {
    const raw = readFixtureJson("fixtures/noIndexQuestionnaire.json");
    const result = transformQuestionnaireMapToGroups(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("fixture root must be object");
    }
    const root = raw as Record<string, unknown>;
    const expectedNames = Object.keys(root).filter((key) => key !== "@ver" && key !== "@q" && !key.startsWith("@"));
    expect(result.questionnaire.groups.map((g) => g.name)).toEqual(expectedNames);
  });

  it("full transform matches partial expected groups from REV fixture (information, h12-car, conclusion)", () => {
    const fullRaw = readFixtureJson("fixtures/noIndexQuestionnaire.json");
    const partialExpected = readFixtureJson("fixtures/REVnoIndexQuestionnaire.json") as TransformedQuestionnaire;

    const result = transformQuestionnaireMapToGroups(fullRaw);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    for (const expectedGroup of partialExpected.groups) {
      const actual = result.questionnaire.groups.find((g) => g.name === expectedGroup.name);
      expect(actual, `missing group ${expectedGroup.name}`).toBeDefined();
      expect(actual).toEqual(expectedGroup);
    }
  });
});
