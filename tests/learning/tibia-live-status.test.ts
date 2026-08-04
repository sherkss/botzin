import { describe, expect, it, vi } from "vitest";
import { TibiaLiveStatusService } from "../../src/knowledge/tibia-live-status.js";

describe("Tibia live status", () => {
  it("reads official boosted creature and boss and caches the result", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ creatures: { boosted: { name: "Dragon", image_url: "dragon.gif" } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ boostable_bosses: { boosted: { name: "Oberon", image_url: "oberon.gif" } } })));
    const service = new TibiaLiveStatusService(fetcher);
    await expect(service.get()).resolves.toMatchObject({
      boostedCreature: { name: "Dragon" }, boostedBoss: { name: "Oberon" }, marketRequiresWorldSnapshot: true
    });
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
