import type { ConfigUserRole } from "../core/config-user.js";

const roleRank: Record<ConfigUserRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3
};

export function hasRole(userRole: ConfigUserRole, requiredRole: ConfigUserRole): boolean {
  return roleRank[userRole] >= roleRank[requiredRole];
}
