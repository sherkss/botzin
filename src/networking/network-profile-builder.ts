import type { RuntimeConfig } from "../config/runtime-config.js";
import type { LocalNetworkAddress, NetworkProfile } from "./network-profile.js";

export class NetworkProfileBuilder {
  constructor(private readonly config: RuntimeConfig) {}

  build(discoveredAddresses: readonly LocalNetworkAddress[]): NetworkProfile {
    return {
      bindHost: this.config.networkBindHost,
      coordinatorHost: this.config.coordinatorHost,
      coordinatorPort: this.config.coordinatorPort,
      preferredKinds: this.config.networkPreferredKinds,
      discoveredAddresses,
      advertisedHosts: this.resolveAdvertisedHosts(discoveredAddresses)
    };
  }

  private resolveAdvertisedHosts(discoveredAddresses: readonly LocalNetworkAddress[]): readonly string[] {
    if (this.config.networkAdvertiseHosts.length > 0) {
      return this.config.networkAdvertiseHosts;
    }

    const preferred = discoveredAddresses
      .filter((address) => address.family === "IPv4" && !address.internal)
      .sort((left, right) => this.preferenceIndex(left.kind) - this.preferenceIndex(right.kind))
      .map((address) => address.address);

    return [...new Set(preferred)];
  }

  private preferenceIndex(kind: string): number {
    const index = this.config.networkPreferredKinds.indexOf(kind);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  }
}
