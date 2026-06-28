import pino from "pino";

// Sync JSON logging only. Netlify Functions (and most serverless runtimes)
// cannot use pino's worker-thread transports (e.g. pino-pretty), so we emit
// structured JSON to stdout in every environment. Pipe through `pino-pretty`
// manually in local dev if you want colorized output.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
});
