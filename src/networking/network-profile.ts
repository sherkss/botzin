export type NetworkInterfaceKind = "ethernet" | "wifi" | "loopback" | "unknown";

export interface LocalNetworkAddress {
  readonly interfaceName: string;
  readonly kind: NetworkInterfaceKind;
  readonly address: string;
  readonly family: "IPv4" | "IPv6";
  readonly internal: boolean;
}

export interface NetworkProfile {
  readonly bindHost: string;
  readonly coordinatorHost: string;
  readonly coordinatorPort: number;
  readonly preferredKinds: readonly string[];
  readonly discoveredAddresses: readonly LocalNetworkAddress[];
  readonly advertisedHosts: readonly string[];
}
