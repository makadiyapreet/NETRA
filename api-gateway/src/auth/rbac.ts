import { Request, Response, NextFunction } from 'express';

export type Role = 'Analyst' | 'Admin';

/**
 * RBAC middleware — reads role from X-User-Role header (demo mode).
 * Defaults to 'Analyst' if not provided.
 */
export function extractRole(req: Request, _res: Response, next: NextFunction): void {
  const role = (req.headers['x-user-role'] as string) || 'Analyst';
  (req as any).userRole = role;
  (req as any).userName = (req.headers['x-user-name'] as string) || 'anonymous';
  next();
}

/**
 * Require a specific role to access a route.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = (req as any).userRole as Role;
    if (roles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({
        error: 'Forbidden',
        message: `Role '${userRole}' does not have permission. Required: ${roles.join(' or ')}`
      });
    }
  };
}
