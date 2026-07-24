import { Router, Request, Response } from 'express';
import { extractRole, requireRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();
router.use(extractRole);

/**
 * GET /api/alerts
 * Historical alerts, optionally filtered by minimum severity.
 */
router.get('/', (req: Request, res: Response) => {
  const dataStore = req.app.locals.dataStore;
  const severity = req.query.severity ? parseInt(req.query.severity as string) : undefined;
  const alerts = dataStore.getAlerts(severity);
  res.json({ data: alerts, total: alerts.length });
});

/**
 * POST /api/alerts/:id/acknowledge
 * Admin-only. Acknowledges an alert.
 */
router.post(
  '/:id/acknowledge',
  requireRole('Admin'),
  auditLogger('acknowledge_alert'),
  (req: Request, res: Response) => {
    const dataStore = req.app.locals.dataStore;
    const io = req.app.locals.io;
    const user = (req as any).userName;
    const alert = dataStore.acknowledgeAlert(req.params.id, user);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Broadcast acknowledgement
    io.emit('alert-acknowledged', { alert_id: alert.alert_id, acknowledged_by: user });

    res.json({ success: true, alert });
  }
);

export default router;
