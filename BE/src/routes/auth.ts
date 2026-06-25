import { Router, type Request, type Response } from "express";
import type { LoginRequest, SignupRequest } from "../shared/types.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionCookieName,
  getUserFromRequest,
  setSessionCookie,
  toPublicUser,
} from "../auth/session.js";
import { getSupabase } from "../db/supabase.js";
import { logger } from "../shared/logger.js";
import { getRequestId } from "../shared/requestLogger.js";

type UserWithPasswordRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: string;
};

export const authRouter = Router();

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "invalid-email";
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

function logDatabaseError(
  req: Request,
  context: string,
  error: { code?: string; message?: string; details?: string; hint?: string },
  email?: string,
): void {
  logger.error(`${context} database error`, {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl || req.url,
    email: email ? maskEmail(email) : undefined,
    supabase: {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    },
  });
}

function logUnexpectedError(req: Request, context: string, error: unknown, email?: string): void {
  logger.error(`${context} unexpected error`, {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl || req.url,
    email: email ? maskEmail(email) : undefined,
    error,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getStringField(body: unknown, field: string): string | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function validateCredentials(body: SignupRequest | LoginRequest): string | null {
  if (!body.email || !body.email.includes("@")) {
    return "A valid email is required.";
  }

  if (!body.password || body.password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
}

authRouter.post("/signup", async (req, res) => {
  try {
    const email = normalizeEmail(getStringField(req.body, "email") ?? "");
    const password = getStringField(req.body, "password") ?? "";
    const name = getStringField(req.body, "name")?.trim() || null;
    const signupRequest: SignupRequest = { email, password, name: name ?? undefined };
    const validationError = validateCredentials(signupRequest);

    if (validationError) {
      sendError(res, 400, "INVALID_SIGNUP_REQUEST", validationError);
      return;
    }

    const passwordHash = await hashPassword(password);
    const { data: user, error } = await getSupabase()
      .from("app_users")
      .insert({
        email,
        name,
        password_hash: passwordHash,
      })
      .select("id,email,name,created_at")
      .single();

    if (error) {
      logDatabaseError(req, "auth.signup.app_users_insert", error, email);
      const isDuplicateEmail = error.code === "23505";
      sendError(
        res,
        isDuplicateEmail ? 409 : 500,
        isDuplicateEmail ? "EMAIL_ALREADY_EXISTS" : "SIGNUP_FAILED",
        isDuplicateEmail ? "Email already exists." : "Failed to create user.",
      );
      return;
    }

    let sessionToken: string;
    try {
      sessionToken = await createSession(user.id);
    } catch (error) {
      logUnexpectedError(req, "auth.signup.create_session", error, email);
      sendError(res, 500, "SIGNUP_FAILED", "Failed to create user session.");
      return;
    }

    setSessionCookie(res, sessionToken);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (error) {
    logUnexpectedError(req, "auth.signup", error);
    sendError(res, 500, "SIGNUP_FAILED", "Failed to create user.");
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(getStringField(req.body, "email") ?? "");
    const password = getStringField(req.body, "password") ?? "";
    const loginRequest: LoginRequest = { email, password };
    const validationError = validateCredentials(loginRequest);

    if (validationError) {
      sendError(res, 400, "INVALID_LOGIN_REQUEST", validationError);
      return;
    }

    const { data: user, error } = await getSupabase()
      .from("app_users")
      .select("id,email,name,password_hash,created_at")
      .eq("email", email)
      .maybeSingle<UserWithPasswordRow>();

    if (error || !user) {
      if (error) {
        logDatabaseError(req, "auth.login.app_users_select", error, email);
      }
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      return;
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);

    if (!passwordMatches) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Invalid email or password.");
      return;
    }

    let sessionToken: string;
    try {
      sessionToken = await createSession(user.id);
    } catch (error) {
      logUnexpectedError(req, "auth.login.create_session", error, email);
      sendError(res, 500, "LOGIN_FAILED", "Failed to create user session.");
      return;
    }

    setSessionCookie(res, sessionToken);
    res.status(200).json({ user: toPublicUser(user) });
  } catch (error) {
    logUnexpectedError(req, "auth.login", error);
    sendError(res, 500, "LOGIN_FAILED", "Failed to log in.");
  }
});

authRouter.post("/logout", async (req, res) => {
  try {
    const sessionToken = req.cookies?.[getSessionCookieName()];

    if (typeof sessionToken === "string") {
      await deleteSession(sessionToken);
    }

    clearSessionCookie(res);
    res.status(204).send();
  } catch (error) {
    logUnexpectedError(req, "auth.logout", error);
    sendError(res, 500, "LOGOUT_FAILED", "Failed to log out.");
  }
});

authRouter.get("/me", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      sendError(res, 401, "UNAUTHORIZED", "Login required.");
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    logUnexpectedError(req, "auth.me", error);
    sendError(res, 500, "CURRENT_USER_FAILED", "Failed to read current user.");
  }
});
