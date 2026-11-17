import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { pool } from "../db.js";

// Add the authenticated user to Express's standard Request type.
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
      };
    }
  }
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });

    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      res.status(401).json({ error: "Invalid authentication token." });
      return;
    }

    req.user = { sub: decoded.sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired authentication token." });
  }
}

/**
 * Use after requireAuth. Lets admins through. The flag is read from the database
 * on every call (not from the token), so demoting someone takes effect immediately.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const result = await pool.query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = $1`,
    [req.user!.sub],
  );

  if (!result.rows[0]?.is_admin) {
    res.status(403).json({ error: "Only an admin can do this." });
    return;
  }

  next();
}
