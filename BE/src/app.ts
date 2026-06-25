import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { analyzeRouter } from "./routes/analyze.js";
import { analysesRouter, storyAnalysesRouter } from "./routes/analyses.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { projectStoriesRouter, storiesRouter } from "./routes/stories.js";
import { logger } from "./shared/logger.js";
import { getRequestId, requestLogger } from "./shared/requestLogger.js";

export const app = express();

/** 끝 슬래시 제거 + localhost↔127.0.0.1 양쪽을 허용 목록에 넣는다. */
function buildAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ORIGIN || "http://localhost:5173";
  const allowed = new Set<string>();

  for (const entry of raw.split(",")) {
    const normalized = entry.trim().replace(/\/+$/, "");
    if (!normalized) {
      continue;
    }
    allowed.add(normalized);
    // localhost와 127.0.0.1은 사실상 같은 출처라 둘 다 허용한다.
    allowed.add(normalized.replace("://localhost", "://127.0.0.1"));
    allowed.add(normalized.replace("://127.0.0.1", "://localhost"));
  }

  return allowed;
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    // origin이 없으면(curl, 서버 간 호출 등) 통과. 그 외엔 허용 목록과 대조.
    if (!origin || allowedOrigins.has(origin.replace(/\/+$/, ""))) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
};
const jsonErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    logger.warn("invalid json request body", {
      requestId: getRequestId(req),
      method: req.method,
      path: req.originalUrl || req.url,
      error,
    });
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
    return;
  }

  next(error);
};

const unhandledErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  logger.error("unhandled route error", {
    requestId: getRequestId(req),
    method: req.method,
    path: req.originalUrl || req.url,
    error,
  });

  if (res.headersSent) {
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error.",
    },
  });
};

app.use(requestLogger);
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(jsonErrorHandler);

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "storyguard-be",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/analyze", analyzeRouter);
app.use("/api/stories/:storyId/analyses", storyAnalysesRouter);
app.use("/api/projects/:projectId/stories", projectStoriesRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/analyses", analysesRouter);
app.use("/api/stories", storiesRouter);
app.use(unhandledErrorHandler);
