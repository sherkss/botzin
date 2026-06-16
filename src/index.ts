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

  const environment = await environmentChecker.check();
  const perception = await pipeline.inspectCurrentFrame();
  const event = coordinator.ingest(perception);
  const commands = await strategy.plan(event);

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
        event,
        commands
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
