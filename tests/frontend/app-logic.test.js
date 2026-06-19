import { describe, it, expect, beforeEach } from "vitest";
import {
  renderAssignment,
  renderSkill,
  renderHuntSkillRule,
  renderLearningMethod,
  renderLearningSession,
  renderLearningSource,
  renderLearningMethodSource,
  renderAssignmentOption,
  fillSelect,
  renderList,
  buildFormPayload,
} from "../../public/app-logic.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const machines = [{ id: 1, name: "PC-Principal" }];
const characters = [{ id: 10, name: "Warlock" }];
const hunts = [{ id: 100, name: "Ferumbras" }];
const skills = [{ id: 200, name: "Exura Gran", manaCost: 150, requiredLevel: 70 }];
const learningMethods = [{ id: 300, name: "Metodo-A" }];
const learningSources = [{ id: 400, name: "Video-Loot" }];

const fullState = {
  machines,
  characters,
  hunts,
  skills,
  learningMethods,
  learningSources,
  accounts: [],
  assignments: [],
};

// ---------------------------------------------------------------------------
// String renderers (no DOM dependency)
// ---------------------------------------------------------------------------

describe("renderAssignment", () => {
  it("resolves all names from state", () => {
    const item = { machineId: 1, characterId: 10, huntId: 100, status: "idle" };
    expect(renderAssignment(item, fullState)).toBe("PC-Principal -> Warlock -> Ferumbras (idle)");
  });

  it("falls back to raw ids when entity is missing from state", () => {
    const item = { machineId: 99, characterId: 99, huntId: 99, status: "active" };
    expect(renderAssignment(item, fullState)).toBe("99 -> 99 -> 99 (active)");
  });

  it("reflects the status field verbatim", () => {
    const item = { machineId: 1, characterId: 10, huntId: 100, status: "training" };
    expect(renderAssignment(item, fullState)).toContain("(training)");
  });
});

describe("renderSkill", () => {
  it("formats name, mana cost, required level, and vocations", () => {
    const item = {
      name: "Exura",
      manaCost: 20,
      requiredLevel: 8,
      allowedVocations: ["knight", "paladin"],
    };
    expect(renderSkill(item)).toBe("Exura - 20 mana - lvl 8 - knight, paladin");
  });

  it("joins multiple vocations with ', '", () => {
    const item = {
      name: "Exori",
      manaCost: 115,
      requiredLevel: 55,
      allowedVocations: ["knight", "paladin", "druid", "sorcerer"],
    };
    expect(renderSkill(item)).toBe("Exori - 115 mana - lvl 55 - knight, paladin, druid, sorcerer");
  });

  it("handles a single vocation without trailing comma", () => {
    const item = { name: "Exori Mort", manaCost: 160, requiredLevel: 80, allowedVocations: ["knight"] };
    expect(renderSkill(item)).toBe("Exori Mort - 160 mana - lvl 80 - knight");
  });
});

describe("renderHuntSkillRule", () => {
  it("resolves hunt and skill names and includes priority", () => {
    const item = { huntId: 100, skillId: 200, priority: 1 };
    expect(renderHuntSkillRule(item, fullState)).toBe("Ferumbras -> Exura Gran prioridade 1");
  });

  it("falls back to raw ids for unknown hunt or skill", () => {
    const item = { huntId: 999, skillId: 888, priority: 3 };
    expect(renderHuntSkillRule(item, fullState)).toBe("999 -> 888 prioridade 3");
  });
});

describe("renderLearningMethod", () => {
  it("formats all five fields in order", () => {
    const item = { name: "M1", methodType: "manual", scope: "global", mode: "active", weight: 5 };
    expect(renderLearningMethod(item)).toBe("M1 - manual - global - active - peso 5");
  });
});

describe("renderLearningSession", () => {
  it("resolves method name from state", () => {
    const item = { name: "Sessao-1", methodId: 300, status: "pending" };
    expect(renderLearningSession(item, fullState)).toBe("Sessao-1 - Metodo-A - pending");
  });

  it("falls back to methodId when method is absent from state", () => {
    const item = { name: "Sessao-2", methodId: 999, status: "done" };
    expect(renderLearningSession(item, fullState)).toBe("Sessao-2 - 999 - done");
  });
});

describe("renderLearningSource", () => {
  it("formats name, sourceType, status, and trustLevel", () => {
    const item = { name: "Guia-YT", sourceType: "video", status: "active", trustLevel: 0.9 };
    expect(renderLearningSource(item)).toBe("Guia-YT - video - active - confianca 0.9");
  });
});

describe("renderLearningMethodSource", () => {
  it("resolves method and source names", () => {
    const item = { methodId: 300, sourceId: 400, role: "primary", weight: 1 };
    expect(renderLearningMethodSource(item, fullState)).toBe("Metodo-A <- Video-Loot (primary, peso 1)");
  });

  it("falls back to ids when entities are missing", () => {
    const item = { methodId: 999, sourceId: 888, role: "secondary", weight: 2 };
    expect(renderLearningMethodSource(item, fullState)).toBe("999 <- 888 (secondary, peso 2)");
  });
});

describe("renderAssignmentOption", () => {
  it("returns item.name for empty-id placeholder option", () => {
    expect(renderAssignmentOption({ id: "", name: "Nenhuma" }, fullState)).toBe("Nenhuma");
  });

  it("delegates to renderAssignment for real items", () => {
    const item = { id: 5, machineId: 1, characterId: 10, huntId: 100, status: "idle" };
    expect(renderAssignmentOption(item, fullState)).toBe("PC-Principal -> Warlock -> Ferumbras (idle)");
  });
});

// ---------------------------------------------------------------------------
// buildFormPayload — empty-string to null conversion
// ---------------------------------------------------------------------------

describe("buildFormPayload", () => {
  it("passes non-empty string values through unchanged", () => {
    const fd = new FormData();
    fd.set("name", "Alice");
    fd.set("level", "42");
    expect(buildFormPayload(fd)).toEqual({ name: "Alice", level: "42" });
  });

  it("converts an empty string to null", () => {
    const fd = new FormData();
    fd.set("huntId", "");
    fd.set("characterId", "7");
    expect(buildFormPayload(fd)).toEqual({ huntId: null, characterId: "7" });
  });

  it("converts every empty field in a single pass", () => {
    const fd = new FormData();
    fd.set("a", "");
    fd.set("b", "");
    fd.set("c", "val");
    const result = buildFormPayload(fd);
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
    expect(result.c).toBe("val");
  });

  it("returns empty object for empty FormData", () => {
    expect(buildFormPayload(new FormData())).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// fillSelect — DOM utility (requires happy-dom)
// ---------------------------------------------------------------------------

describe("fillSelect", () => {
  beforeEach(() => {
    document.body.innerHTML = '<select id="sel"></select>';
  });

  it("populates options with the correct value and label", () => {
    fillSelect("#sel", [{ id: 1, name: "A" }, { id: 2, name: "B" }], (item) => item.name);
    const options = document.querySelectorAll("#sel option");
    expect(options).toHaveLength(2);
    expect(options[0].value).toBe("1");
    expect(options[0].textContent).toBe("A");
    expect(options[1].value).toBe("2");
    expect(options[1].textContent).toBe("B");
  });

  it("clears existing options before repopulating", () => {
    document.body.innerHTML = '<select id="sel"><option value="old">Old</option></select>';
    fillSelect("#sel", [{ id: 5, name: "New" }], (item) => item.name);
    const options = document.querySelectorAll("#sel option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe("New");
  });

  it("leaves the select empty when items list is empty", () => {
    fillSelect("#sel", [], (item) => item.name);
    expect(document.querySelectorAll("#sel option")).toHaveLength(0);
  });

  it("uses labelFactory return value as textContent, not html", () => {
    fillSelect("#sel", [{ id: 1, name: "<b>Bold</b>" }], (item) => item.name);
    const option = document.querySelector("#sel option");
    expect(option.textContent).toBe("<b>Bold</b>");
  });
});

// ---------------------------------------------------------------------------
// renderList — DOM utility (requires happy-dom)
// ---------------------------------------------------------------------------

describe("renderList", () => {
  it("returns a div with class 'list'", () => {
    const box = renderList("Contas", [], () => "");
    expect(box.tagName).toBe("DIV");
    expect(box.className).toBe("list");
  });

  it("includes an h3 with the provided title", () => {
    const box = renderList("Maquinas", [], () => "");
    expect(box.querySelector("h3").textContent).toBe("Maquinas");
  });

  it("shows a single placeholder item when the list is empty", () => {
    const box = renderList("Hunts", [], () => "");
    const items = box.querySelectorAll(".item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("Nenhum registro.");
  });

  it("creates exactly one .item per entry", () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const box = renderList("Items", data, (item) => String(item.id));
    expect(box.querySelectorAll(".item")).toHaveLength(3);
  });

  it("sets each item textContent via the label factory", () => {
    const data = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
    const box = renderList("Chars", data, (item) => item.name);
    const items = box.querySelectorAll(".item");
    expect(items[0].textContent).toBe("Alice");
    expect(items[1].textContent).toBe("Bob");
  });

  it("does NOT show the placeholder when items are present", () => {
    const box = renderList("Skills", [{ id: 1 }], () => "Exura");
    const items = box.querySelectorAll(".item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("Exura");
  });
});
