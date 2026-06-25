import { Router } from "express";
import { analyze } from "../api/analyze.js";
import { logRouteWarning } from "../shared/routeLogging.js";
import type { AnalyzeRequest } from "../shared/types.js";

export const analyzeRouter = Router();

analyzeRouter.post("/", async (req, res) => {
  try {
    const response = await analyze(req.body as AnalyzeRequest);
    res.status(200).json(response);
  } catch (error) {
    logRouteWarning(req, "analyze fallback response used", { error });
    const response = await analyze({} as AnalyzeRequest);
    res.status(200).json(response);
  }
});
