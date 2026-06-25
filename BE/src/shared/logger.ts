export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

type LogWriter = (level: Exclude<LogLevel, "silent">, line: string) => void;

type LoggerOptions = {
  level?: LogLevel;
  write?: LogWriter;
};

type LogMeta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const REDACTED = "[REDACTED]";

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();

  if (normalized.includes("password") || normalized.includes("authorization") || normalized.includes("token")) {
    return true;
  }

  if (normalized.includes("secret")) {
    return true;
  }

  if (normalized.includes("key") && !normalized.includes("status") && !normalized.includes("name")) {
    return true;
  }

  if (normalized === "cookie" || normalized === "set-cookie") {
    return true;
  }

  return normalized === "content" || normalized === "manuscripttext" || normalized === "settingstext";
}

function normalizeLevel(level: string | undefined): LogLevel {
  if (level === "debug" || level === "info" || level === "warn" || level === "error" || level === "silent") {
    return level;
  }

  return "info";
}

function serializeError(error: Error): Record<string, string | undefined> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function redactValue(key: string, value: unknown): unknown {
  if (shouldRedactKey(key)) {
    return REDACTED;
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value && typeof value === "object") {
    return redactRecord(value as Record<string, unknown>);
  }

  return value;
}

function redactUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item));
  }

  if (value && typeof value === "object") {
    return redactRecord(value as Record<string, unknown>);
  }

  return value;
}

function redactRecord(record: Record<string, unknown>): LogMeta {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, redactValue(key, value)]));
}

export function redactLogMeta(meta: LogMeta): LogMeta {
  return redactRecord(meta);
}

function defaultWrite(level: Exclude<LogLevel, "silent">, line: string): void {
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function createLogger(options: LoggerOptions = {}) {
  const configuredLevel = options.level ?? normalizeLevel(process.env.LOG_LEVEL);
  const write = options.write ?? defaultWrite;

  function shouldLog(level: Exclude<LogLevel, "silent">): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel];
  }

  function log(level: Exclude<LogLevel, "silent">, message: string, meta: LogMeta = {}): void {
    if (!shouldLog(level)) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...redactLogMeta(meta),
    };

    write(level, JSON.stringify(entry));
  }

  return {
    debug(message: string, meta?: LogMeta): void {
      log("debug", message, meta);
    },
    info(message: string, meta?: LogMeta): void {
      log("info", message, meta);
    },
    warn(message: string, meta?: LogMeta): void {
      log("warn", message, meta);
    },
    error(message: string, meta?: LogMeta): void {
      log("error", message, meta);
    },
  };
}

export const logger = createLogger();
