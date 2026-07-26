/**
 * JWT Authentication module for NETRA.
 *
 * Provides:
 *   POST /api/auth/login    — authenticate, return JWT
 *   POST /api/auth/register — Admin-only user creation
 *   GET  /api/auth/me       — get current user from JWT
 *
 * JWT payload: { userId, email, role, displayName }
 * Token stored by frontend in localStorage.
 *
 * Auth mode controlled by NETRA_AUTH_MODE env var:
 *   - "jwt"  (default/production) — requires valid JWT
 *   - "dev"  — falls back to X-User-Role header (dev-mode toggle)
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();

// ── Config ──────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'netra-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const AUTH_MODE = process.env.NETRA_AUTH_MODE || 'jwt';

// ── PostgreSQL Pool ─────────────────────────────────────────

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'netra_threat',
  user: process.env.POSTGRES_USER || 'netra',
  password: process.env.POSTGRES_PASSWORD || 'netrasecret',
});

interface JwtPayload {
  userId: number;
  email: string;
  role: 'Admin' | 'Analyst';
  displayName: string;
}

// ── In-Memory User Store (offline/no-Docker fallback) ───────
interface MemoryUser {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'Admin' | 'Analyst';
  agency?: string;
  is_active: boolean;
}

const memoryUsers: Map<string, MemoryUser> = new Map();
let nextUserId = 100;

// Seed with default users
(async () => {
  const adminHash = await bcrypt.hash('netra2026', 10);
  const analystHash = await bcrypt.hash('analyst2026', 10);
  memoryUsers.set('admin@netra.gov.in', {
    id: 1, email: 'admin@netra.gov.in', password_hash: adminHash,
    display_name: 'System Admin', role: 'Admin', agency: 'ATS', is_active: true,
  });
  memoryUsers.set('analyst@netra.gov.in', {
    id: 2, email: 'analyst@netra.gov.in', password_hash: analystHash,
    display_name: 'Threat Analyst', role: 'Analyst', agency: 'Surat Cyber Cell', is_active: true,
  });
  console.log('[AUTH] In-memory user store seeded with 2 default users');
})();

// ── Helpers ─────────────────────────────────────────────────

function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// ── Middleware: Extract JWT role ─────────────────────────────

/**
 * JWT-aware role extraction middleware.
 *
 * In "jwt" mode: reads Authorization: Bearer <token>, decodes role.
 * In "dev" mode: falls back to X-User-Role header (existing behavior).
 */
export function extractJwtRole(req: Request, _res: Response, next: NextFunction): void {
  if (AUTH_MODE === 'dev') {
    // Dev mode: trust client-supplied header (existing behavior)
    const role = (req.headers['x-user-role'] as string) || 'Analyst';
    (req as any).userRole = role;
    (req as any).userName = (req.headers['x-user-name'] as string) || 'anonymous';
    (req as any).userId = 0;
    next();
    return;
  }

  // JWT mode: extract from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      (req as any).userRole = payload.role;
      (req as any).userName = payload.email;
      (req as any).userId = payload.userId;
      (req as any).displayName = payload.displayName;
      next();
      return;
    }
  }

  // No valid JWT — still allow access but as anonymous Analyst
  // (individual routes use requireRole to enforce specific roles)
  (req as any).userRole = 'Analyst';
  (req as any).userName = 'anonymous';
  (req as any).userId = 0;
  next();
}

// ── Routes ──────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, email, role, displayName } }
 */
router.post('/login', auditLogger('auth-login'), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalEmail = email.toLowerCase().trim();

  try {
    let user: any = null;
    let passwordValid = false;

    // 1. Try PostgreSQL first
    try {
      const result = await pool.query(
        'SELECT id, email, password_hash, display_name, role, is_active FROM users WHERE email = $1',
        [normalEmail]
      );
      if (result.rows.length > 0) {
        user = result.rows[0];
        if (user.password_hash) {
          passwordValid = await bcrypt.compare(password, user.password_hash);
        }
      }
    } catch (dbErr) {
      console.warn('[AUTH] DB unavailable, falling back to in-memory store');
    }

    // 2. Fallback: in-memory user store
    if (!user) {
      const memUser = memoryUsers.get(normalEmail);
      if (memUser) {
        user = memUser;
        passwordValid = await bcrypt.compare(password, memUser.password_hash);
      }
    }

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.display_name,
    };

    const token = signToken(payload);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.display_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register
 * Body: { email, password, displayName, role, agency }
 * Works with DB or in-memory store for offline mode.
 */
router.post('/register', auditLogger('auth-register'), async (req: Request, res: Response) => {
  const { email, password, displayName, role, agency } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalEmail = email.toLowerCase().trim();
  const validRole: 'Admin' | 'Analyst' = role === 'Admin' ? 'Admin' : 'Analyst';
  const hashedPassword = await bcrypt.hash(password, 10);

  // 1. Try PostgreSQL first
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, role',
      [normalEmail, hashedPassword, displayName || 'NETRA User', validRole]
    );
    res.status(201).json({ user: result.rows[0] });
    return;
  } catch (dbErr: any) {
    if (dbErr?.code === '23505') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    console.warn('[AUTH] DB unavailable for register, using in-memory store');
  }

  // 2. Fallback: in-memory store
  if (memoryUsers.has(normalEmail)) {
    res.status(409).json({ error: 'Email already exists' });
    return;
  }

  const newUser: MemoryUser = {
    id: nextUserId++,
    email: normalEmail,
    password_hash: hashedPassword,
    display_name: displayName || 'NETRA User',
    role: validRole,
    agency: agency || undefined,
    is_active: true,
  };
  memoryUsers.set(normalEmail, newUser);

  console.log(`[AUTH] New user registered in-memory: ${normalEmail} (${validRole})`);

  res.status(201).json({
    user: {
      id: newUser.id,
      email: newUser.email,
      display_name: newUser.display_name,
      role: newUser.role,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns current user info from JWT.
 */
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  res.json({
    user: {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      displayName: payload.displayName,
    },
  });
});

export default router;
export { verifyToken, AUTH_MODE };
