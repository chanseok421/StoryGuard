import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "./logger.js";

export const REQUEST_ID_HEADER = "x-request-id";

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function getRequestId(req: Request): string | undefined {
  return readHeaderValue(req.headers[REQUEST_ID_HEADER]);
}

export const requestLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = process.hrtime.bigint();
  const requestId = getRequestId(req) ?? randomUUID();
  req.headers[REQUEST_ID_HEADER] = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const meta = {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ip: req.ip,
      userAgent: req.get("user-agent"),
    };

    if (res.statusCode >= 500) {
      logger.error("http request completed", meta);
      return;
    }

    if (res.statusCode >= 400) {
      logger.warn("http request completed", meta);
      return;
    }

    logger.info("http request completed", meta);
  });

  next();
};
