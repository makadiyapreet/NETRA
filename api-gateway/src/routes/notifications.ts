/**
 * Web Push notification module for NETRA.
 *
 * Uses web-push npm package to deliver mobile push notifications
 * to subscribed analyst browsers when SEV >= 4 alerts occur.
 */

import webpush from 'web-push';
import { Router, Request, Response } from 'express';

const router = Router();

// Generate or use VAPID keys from env
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgTzkS_D3FCWpGzE_Wz-y5H4P7nO-y5nO-y5nO-y5nO-y';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'uX_Z5nO-y5nO-y5nO-y5nO-y5nO-y5nO-y5nO-y5nO4';

try {
  webpush.setVapidDetails(
    'mailto:admin@netra.gov.in',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.warn('VAPID setup warning (using fallback mock keys):', e);
}

// In-memory subscriptions store
const subscriptions: webpush.PushSubscription[] = [];

/**
 * GET /api/notifications/vapid-key
 * Returns public key for frontend subscription.
 */
router.get('/vapid-key', (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /api/notifications/subscribe
 * Register a browser push subscription.
 */
router.post('/subscribe', (req: Request, res: Response) => {
  const sub: webpush.PushSubscription = req.body;
  if (!sub || !sub.endpoint) {
    res.status(400).json({ error: 'Invalid subscription object' });
    return;
  }

  // Avoid duplicate subscriptions
  if (!subscriptions.some(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
  }

  res.status(201).json({ status: 'subscribed', total: subscriptions.length });
});

/**
 * Helper to dispatch push notifications for high-severity alerts.
 */
export async function sendAlertPushNotification(alert: {
  alert_id: string;
  threat_category: string;
  severity: number;
  triggering_reason?: string;
}): Promise<number> {
  if (alert.severity < 4 || subscriptions.length === 0) {
    return 0;
  }

  const payload = JSON.stringify({
    title: `🚨 SEV-${alert.severity} Alert: ${alert.threat_category}`,
    body: alert.triggering_reason || `High-severity threat detected in ${alert.threat_category}`,
    icon: '/icon-192.png',
    data: { alert_id: alert.alert_id, url: '/alerts' },
  });

  let sent = 0;
  const expired: number[] = [];

  for (let i = 0; i < subscriptions.length; i++) {
    try {
      await webpush.sendNotification(subscriptions[i], payload);
      sent++;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        expired.push(i);
      }
    }
  }

  // Clean up expired subscriptions
  for (let idx = expired.length - 1; idx >= 0; idx--) {
    subscriptions.splice(expired[idx], 1);
  }

  return sent;
}

export default router;
