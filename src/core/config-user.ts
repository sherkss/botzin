export type ConfigUserRole = "admin" | "operator" | "viewer";

export interface ConfigUser {
  readonly id: number;
  readonly username: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly role: ConfigUserRole;
  readonly enabled: boolean;
}

export interface AuthenticatedConfigUser {
  readonly id: number;
  readonly username: string;
  readonly displayName: string;
  readonly role: ConfigUserRole;
}
