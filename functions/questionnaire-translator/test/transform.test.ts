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
        displayName: "sectionA",
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

  it("maps array section with one object row to a single indexed group", () => {
    const input: Record<string, unknown> = {
      "@ver": "f1.0",
      "system-loop-general": [
        {
          "type-of-loop": { v: 2, vl: "Heating", l: "Type of Loop" },
          "@props": { l: "System Loop General", d: "" }
        }
      ],
      conclusion: { done: { v: 1, l: "Done" } }
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.groupCount).toBe(2);
    const slg = result.questionnaire.groups.find((g) => g.name === "system-loop-general[0]");
    expect(slg).toBeDefined();
    expect(slg?.items.some((i) => i.name === "type-of-loop")).toBe(true);
    expect(result.questionnaire.groups.map((g) => g.name)).toEqual(["system-loop-general[0]", "conclusion"]);
    expect(slg?.displayName).toBe("System Loop General");
    expect(result.questionnaire.groups.find((g) => g.name === "conclusion")?.displayName).toBe("conclusion");
  });

  it("maps array section with multiple object rows to ordered indexed groups", () => {
    const input: Record<string, unknown> = {
      repeatable: [{ a: { v: 1 } }, { b: { v: 2 } }],
      tail: { z: { v: 3 } }
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.questionnaire.groups.map((g) => g.name)).toEqual(["repeatable[0]", "repeatable[1]", "tail"]);
    expect(result.groupCount).toBe(3);
    expect(result.itemCount).toBe(3);
    expect(result.questionnaire.groups.map((g) => g.displayName)).toEqual(["repeatable[0]", "repeatable[1]", "tail"]);
  });

  it("skips non-object array rows with SECTION_ROW_SKIPPED and keeps valid rows", () => {
    const input: Record<string, unknown> = {
      mixed: [{ ok: { v: 1 } }, "not-an-object", null, { ok2: { v: 2 } }, 42]
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.questionnaire.groups.map((g) => g.name)).toEqual(["mixed[0]", "mixed[3]"]);
    const rowSkips = result.warnings.filter((w) => w.code === "SECTION_ROW_SKIPPED");
    expect(rowSkips.length).toBe(3);
    expect(rowSkips.map((w) => w.path).sort()).toEqual(["mixed[1]", "mixed[2]", "mixed[4]"]);
    expect(rowSkips.find((w) => w.path === "mixed[2]")?.message).toContain("received null");
    expect(rowSkips.find((w) => w.path === "mixed[1]")?.message).toContain("received string");
    expect(rowSkips.find((w) => w.path === "mixed[4]")?.message).toContain("received number");
    expect(result.questionnaire.groups.map((g) => g.displayName)).toEqual(["mixed[0]", "mixed[3]"]);
  });

  it("sets displayName from @props.l or falls back to group name", () => {
    const input: Record<string, unknown> = {
      withLabel: {
        x: { v: 1 },
        "@props": { l: "Human Label", d: "" }
      },
      emptyLabel: {
        y: { v: 2 },
        "@props": { l: "   ", d: "" }
      },
      noProps: { z: { v: 3 } },
      badProps: {
        w: { v: 4 },
        "@props": "not-an-object"
      }
    };
    const result = transformQuestionnaireMapToGroups(input);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const byName = Object.fromEntries(result.questionnaire.groups.map((g) => [g.name, g.displayName]));
    expect(byName["withLabel"]).toBe("Human Label");
    expect(byName["emptyLabel"]).toBe("emptyLabel");
    expect(byName["noProps"]).toBe("noProps");
    expect(byName["badProps"]).toBe("badProps");
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
