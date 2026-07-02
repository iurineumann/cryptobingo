export function hasPermission(
  userPermissions: string[] | null | undefined,
  requiredPermission: string
): boolean {
  if (!userPermissions) return true;

  for (const pattern of userPermissions) {
    if (matchPermission(pattern, requiredPermission)) return true;
  }
  return false;
}

export function matchPermission(pattern: string, permission: string): boolean {
  const patternParts = pattern.split('.');
  const permissionParts = permission.split('.');

  if (patternParts.length > permissionParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== permissionParts[i]) return false;
  }

  return true;
}
