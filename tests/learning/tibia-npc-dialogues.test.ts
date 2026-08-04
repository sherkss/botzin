import { describe, expect, it } from "vitest";
import { parseNpcTranscript } from "../../src/learning/tibia-npc-dialogues.js";

describe("Tibia NPC transcript parser", () => {
  it("structures keywords, conditions and responses from Fandom wiki text", () => {
    const parsed = parseNpcTranscript("Cipfried", `{{Infobox Transcript|
''Player'': '''hi''' or '''hello'''<br/>
Cipfried: Hello, ''Player''! Feel free to ask me for help.<br/>
''Player'': '''heal''' (if the player is poisoned)<br>
Cipfried: You are [[poisoned]]. I will help you.<br/>
''Player'': anything<br/>
Cipfried: Please start with hi.
}}`);
    expect(parsed.turns).toHaveLength(3);
    expect(parsed.turns[0]).toMatchObject({ sequence: 1, keywords: ["hi", "hello"], npc: "Cipfried" });
    expect(parsed.turns[1]).toMatchObject({ keywords: ["heal"], conditions: ["if the player is poisoned"], response: "You are poisoned. I will help you." });
    expect(parsed.turns[2]?.keywords).toEqual([]);
    expect(parsed.searchableText).toContain("jogador: heal");
  });

  it("ignores spontaneous text without a player prompt", () => {
    expect(parseNpcTranscript("Test", "{{Infobox Transcript|Test: Welcome!}}").turns).toEqual([]);
  });
});
