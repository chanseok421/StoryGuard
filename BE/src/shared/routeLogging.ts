import type { Request } from "express";
import { logger } from "./logger.js";
import { getRequestId } from "./requestLogger.js";

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function serializeUnknownError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function requestMeta(req: Request): Record<string, unknown> {
  return {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl || req.url,
  };
}

export function logRouteError(req: Request, context: string, error: unknown, meta: Record<string, unknown> = {}): void {
  logger.error(context, {
    ...requestMeta(req),
    ...meta,
    error: serializeUnknownError(error),
  });
}

export function logRouteWarning(req: Request, context: string, meta: Record<string, unknown> = {}): void {
  logger.warn(context, {
    ...requestMeta(req),
    ...meta,
  });
}

export function logSupabaseError(
  req: Request,
  context: string,
  error: SupabaseErrorLike,
  meta: Record<string, unknown> = {},
): void {
  logger.error(context, {
    ...requestMeta(req),
    ...meta,
    supabase: {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    },
  });
}
