import type { NextFunction, Request, Response } from "express";
import type { User } from "../shared/types.js";
import { getUserFromRequest } from "./session.js";

export type AuthenticatedRequest = Request & {
  user: User;
};

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUserFromRequest(req);

  if (!user) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Login required.",
      },
    });
    return;
  }

  (req as AuthenticatedRequest).user = user;
  next();
}

