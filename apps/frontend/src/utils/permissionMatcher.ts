export function hasPermission(
  userPermissions: string[] | null | undefined,
  requiredPermission: string
): boolean {
  if (!userPermissions) return true;

  for (const pattern of userPermissions) {
    const patternParts = pattern.split('.');
    const permissionParts = requiredPermission.split('.');
    if (patternParts.length > permissionParts.length) continue;

    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') continue;
      if (patternParts[i] !== permissionParts[i]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

export function hasAnyPermission(
  userPermissions: string[] | null | undefined,
  requiredPermissions: string[],
  role?: string
): boolean {
  if (role === 'contract_admin') return true;
  if (!userPermissions) return true;
  return requiredPermissions.some((p) => hasPermission(userPermissions, p));
}
