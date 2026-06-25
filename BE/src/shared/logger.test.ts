import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, redactLogMeta } from "./logger.js";

test("redactLogMeta masks sensitive nested fields", () => {
  const meta = redactLogMeta({
    email: "writer@example.com",
    password: "secret-password",
    headers: {
      authorization: "Bearer secret-token",
      cookie: "storyguard_session=abc",
    },
    content: "full manuscript text",
    safe: {
      statusCode: 500,
    },
  });

  assert.deepEqual(meta, {
    email: "writer@example.com",
    password: "[REDACTED]",
    headers: {
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
    },
    content: "[REDACTED]",
    safe: {
      statusCode: 500,
    },
  });
});

test("createLogger filters messages below the configured level", () => {
  const lines: string[] = [];
  const logger = createLogger({
    level: "warn",
    write: (_level, line) => {
      lines.push(line);
    },
  });

  logger.info("ignored info");
  logger.warn("visible warning", { password: "secret-password" });

  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /visible warning/);
  assert.match(lines[0] ?? "", /\[REDACTED\]/);
  assert.doesNotMatch(lines[0] ?? "", /secret-password/);
});
