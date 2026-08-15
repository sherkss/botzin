import { randomUUID } from "node:crypto";
import type { PerceptionResult } from "../perception/perception-pipeline.js";
import type { PerceptionEvent } from "./perception-event.js";

export class InMemoryCoordinator {
  private readonly events: PerceptionEvent[] = [];

  constructor(private readonly retainedEvents = 1_000) {}

  ingest(result: PerceptionResult): PerceptionEvent {
    const event: PerceptionEvent = {
      id: randomUUID(),
      sourceComputerId: result.sourceComputerId,
      receivedAt: new Date().toISOString(),
      capturedAt: result.capturedAt,
      frame: { id: result.frame.id, width: result.frame.width, height: result.frame.height },
      entities: result.entities,
      operationObservation: result.operationObservation
    };

    this.events.push(event);
    if (this.events.length > this.retainedEvents) this.events.splice(0, this.events.length - this.retainedEvents);
    return event;
  }

  listLatest(limit = 20): readonly PerceptionEvent[] {
    return this.events.slice(-limit);
  }
}
