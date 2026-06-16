import { networkInterfaces } from "node:os";
import type { LocalNetworkAddress, NetworkInterfaceKind } from "./network-profile.js";

export class LocalNetworkInspector {
  listAddresses(): readonly LocalNetworkAddress[] {
    const interfaces = networkInterfaces();
    const addresses: LocalNetworkAddress[] = [];

    for (const [interfaceName, entries] of Object.entries(interfaces)) {
      for (const entry of entries ?? []) {
        if (entry.family !== "IPv4" && entry.family !== "IPv6") {
          continue;
        }

        addresses.push({
          interfaceName,
          kind: classifyInterface(interfaceName, entry.internal),
          address: entry.address,
          family: entry.family,
          internal: entry.internal
        });
      }
    }

    return addresses;
  }
}

function classifyInterface(interfaceName: string, internal: boolean): NetworkInterfaceKind {
  if (internal) {
    return "loopback";
  }

  const normalized = interfaceName.toLowerCase();

  if (normalized.includes("wi-fi") || normalized.includes("wifi") || normalized.includes("wireless") || normalized.includes("wlan")) {
    return "wifi";
  }

  if (normalized.includes("ethernet") || normalized.includes("gbe") || normalized.includes("lan")) {
    return "ethernet";
  }

  return "unknown";
}
