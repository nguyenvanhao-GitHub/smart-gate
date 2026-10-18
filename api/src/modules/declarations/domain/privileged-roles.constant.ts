export const PRIVILEGED_ROLES = new Set([
  'SYS_ADMIN',
  'BORDER_GUARD',
  'CUSTOMS',
  'QUARANTINE',
  'FEE_COLLECTOR',
  'DISPATCHER',
  'YARD_MANAGER',
  'MANAGEMENT',
]);

export function isPrivilegedRole(roleOrRoles?: string | string[]): boolean {
  if (!roleOrRoles) return false;
  const roles = Array.isArray(roleOrRoles)
    ? roleOrRoles
    : roleOrRoles.split('+').filter(Boolean);
  return roles.some((r) => PRIVILEGED_ROLES.has(r.trim().toUpperCase()));
}
