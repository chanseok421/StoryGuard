import { app } from "./app.js";
import { logger } from "./shared/logger.js";
import { logRuntimeDiagnostics } from "./shared/runtimeDiagnostics.js";

const port = Number(process.env.PORT ?? 4000);

process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", { error });
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled promise rejection", {
    reason: reason instanceof Error ? reason : String(reason),
  });
});

app.listen(port, () => {
  logger.info("StoryGuard backend listening", { port });
  logRuntimeDiagnostics(port);
}).on("error", (error) => {
  logger.error("StoryGuard backend failed to listen", { port, error });
});
