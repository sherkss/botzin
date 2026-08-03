import { loadRuntimeConfig } from "./config/runtime-config.js";
import { InMemoryCoordinator } from "./coordination/in-memory-coordinator.js";
import { PassiveObservationStrategy } from "./decision/passive-observation-strategy.js";
import { isEnvironmentReady } from "./environment/check-status.js";
import { ObsShareInspector } from "./environment/obs-share-inspector.js";
import { RuntimeEnvironmentChecker } from "./environment/runtime-environment-checker.js";
import { WindowsProcessInspector } from "./environment/windows-process-inspector.js";
import { LocalNetworkInspector } from "./networking/local-network-inspector.js";
import { NetworkProfileBuilder } from "./networking/network-profile-builder.js";
import { createEntityDetector } from "./perception/detector-factory.js";
import { createFrameSource } from "./perception/frame-source-factory.js";
import { PerceptionPipeline } from "./perception/perception-pipeline.js";
import { resolve } from "node:path";
import { LiveDecisionStore, decisionFrom, errorDecision } from "./decision/live-decision-store.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const networkInspector = new LocalNetworkInspector();
  const networkProfile = new NetworkProfileBuilder(config).build(networkInspector.listAddresses());
  const environmentChecker = new RuntimeEnvironmentChecker(
    config,
    new WindowsProcessInspector(),
    new ObsShareInspector()
  );
  const frameSource = createFrameSource(config);
  const detector = createEntityDetector(config);
  const pipeline = new PerceptionPipeline(frameSource, detector);
  const coordinator = new InMemoryCoordinator();
  const strategy = new PassiveObservationStrategy();
  const decisionStore = new LiveDecisionStore(resolve(config.decisionLogPath));
  const abortController = new AbortController();
  process.once("SIGINT", () => abortController.abort());
  process.once("SIGTERM", () => abortController.abort());

  const environment = await environmentChecker.check();
  console.log(
    JSON.stringify(
      {
        nodeId: config.nodeId,
        role: config.role,
        network: networkProfile,
        frameSource: frameSource.name,
        detector: detector.name,
        strategy: strategy.name,
        environmentReady: isEnvironmentReady(environment),
        environment,
        decisionIntervalMs: config.decisionIntervalMs,
        decisionLogPath: resolve(config.decisionLogPath),
        liveMonitor: "started"
      },
      null,
      2
    )
  );

  while (!abortController.signal.aborted) {
    try {
      const perception = await pipeline.inspectCurrentFrame();
      const event = coordinator.ingest(perception);
      const commands = await strategy.plan(event);
      const decision = decisionFrom(event, strategy.name, commands);
      await decisionStore.append(decision);
      console.log(JSON.stringify({
        type: "live-decision",
        observedAt: decision.observedAt,
        decision: decision.decision,
        mode: decision.mode,
        entities: decision.entityCounts,
        commands: decision.commands.length
      }));
    } catch (error) {
      const decision = errorDecision(config.nodeId, strategy.name, error);
      await decisionStore.append(decision);
      console.error(JSON.stringify({ type: "live-decision-error", observedAt: decision.observedAt, error: decision.error }));
    }
    await waitForNextCycle(config.decisionIntervalMs, abortController.signal);
  }
}

async function waitForNextCycle(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolvePromise();
    }, { once: true });
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
