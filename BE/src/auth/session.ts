import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { getSupabase } from "../db/supabase.js";
import type { User } from "../shared/types.js";

const DEFAULT_SESSION_COOKIE_NAME = "storyguard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
};

export function getSessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME;
}

function getSameSite(): "lax" | "strict" | "none" {
  const value = process.env.COOKIE_SAMESITE?.trim().toLowerCase();
  return value === "none" || value === "strict" ? value : "lax";
}

export function getSessionCookieOptions(): CookieOptions {
  const sameSite = getSameSite();
  // FE/BE가 다른 도메인(예: vercel + render)이면 크로스사이트 요청에 쿠키가 실리려면
  // SameSite=None 이어야 하고, 브라우저는 그때 Secure를 강제한다.
  const secure = process.env.COOKIE_SECURE === "true" || sameSite === "none";

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  };
}

export function getExpiredSessionCookieOptions(): CookieOptions {
  return {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

export function createRawSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createSession(userId: string): Promise<string> {
  const sessionToken = createRawSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString();

  const { error } = await getSupabase().from("app_sessions").insert({
    user_id: userId,
    session_token_hash: sessionTokenHash,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }

  return sessionToken;
}

export async function deleteSession(sessionToken: string): Promise<void> {
  const sessionTokenHash = hashSessionToken(sessionToken);

  await getSupabase().from("app_sessions").delete().eq("session_token_hash", sessionTokenHash);
}

export async function getUserBySessionToken(sessionToken: string | undefined): Promise<User | null> {
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = hashSessionToken(sessionToken);
  const { data: session, error: sessionError } = await getSupabase()
    .from("app_sessions")
    .select("id,user_id,expires_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle<SessionRow>();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteSession(sessionToken);
    return null;
  }

  const { data: user, error: userError } = await getSupabase()
    .from("app_users")
    .select("id,email,name,created_at")
    .eq("id", session.user_id)
    .maybeSingle<UserRow>();

  if (userError || !user) {
    return null;
  }

  return toPublicUser(user);
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const sessionToken = req.cookies?.[getSessionCookieName()];
  return getUserBySessionToken(typeof sessionToken === "string" ? sessionToken : undefined);
}

export function setSessionCookie(res: Response, sessionToken: string): void {
  res.cookie(getSessionCookieName(), sessionToken, getSessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(getSessionCookieName(), getExpiredSessionCookieOptions());
}

