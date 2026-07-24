import { Request, Response, NextFunction } from 'express';

interface AuditEntry {
  timestamp: string;
  user: string;
  role: string;
  action: string;
  target: string;
  details?: any;
}

const auditLog: AuditEntry[] = [];

/**
 * Logs mutations (acknowledge, report gen, etc.) with user, role, action.
 */
export function auditLogger(action: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      user: (req as any).userName || 'anonymous',
      role: (req as any).userRole || 'unknown',
      action,
      target: req.originalUrl,
      details: req.body
    };
    auditLog.push(entry);
    console.log(`📝 AUDIT: [${entry.timestamp}] ${entry.role}/${entry.user} → ${entry.action} → ${entry.target}`);
    next();
  };
}

export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}
