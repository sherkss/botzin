export type CheckState = "ok" | "missing" | "unknown";

export interface CheckStatus {
  readonly state: CheckState;
  readonly detail: string;
}

export interface RuntimeEnvironmentStatus {
  readonly checkedAt: string;
  readonly computerId: string;
  readonly obsOpen: CheckStatus;
  readonly tibiaOpen: CheckStatus;
  readonly obsShared: CheckStatus;
  readonly tibiaShared: CheckStatus;
}

export function isEnvironmentReady(status: RuntimeEnvironmentStatus): boolean {
  return (
    status.obsOpen.state === "ok" &&
    status.tibiaOpen.state === "ok" &&
    status.obsShared.state === "ok" &&
    status.tibiaShared.state === "ok"
  );
}
