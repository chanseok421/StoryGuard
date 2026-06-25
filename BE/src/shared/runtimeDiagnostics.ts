import { logger } from "./logger.js";

type RuntimeDiagnostics = {
  port: number;
  corsOrigin: string;
  cookieSecure: boolean;
  sessionCookieName: string;
  supabaseUrlHost: string;
  supabaseKeyStatus: "missing" | "secret" | "legacy_or_publishable" | "unknown";
};

function getSupabaseUrlHost(): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return "missing";
  }

  try {
    return new URL(supabaseUrl).host;
  } catch {
    return "invalid";
  }
}

function getSupabaseKeyStatus(): RuntimeDiagnostics["supabaseKeyStatus"] {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    return "missing";
  }

  if (key.startsWith("sb_secret_")) {
    return "secret";
  }

  if (key.startsWith("ey")) {
    return "legacy_or_publishable";
  }

  return "unknown";
}

export function getRuntimeDiagnostics(port: number): RuntimeDiagnostics {
  return {
    port,
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
    cookieSecure: process.env.COOKIE_SECURE === "true",
    sessionCookieName: process.env.SESSION_COOKIE_NAME || "storyguard_session",
    supabaseUrlHost: getSupabaseUrlHost(),
    supabaseKeyStatus: getSupabaseKeyStatus(),
  };
}

export function logRuntimeDiagnostics(port: number): void {
  logger.info("StoryGuard backend configuration", getRuntimeDiagnostics(port));
}
