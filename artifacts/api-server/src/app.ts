import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";

const app: Express = express();

// In production the frontend lives at PUBLIC_BASE_URL and reaches /api via the
// Netlify proxy (same-origin, no CORS preflight). Any other origin hitting the
// Railway URL directly is rejected here.
const allowedOrigins = new Set(
  [
    process.env.PUBLIC_BASE_URL,
    process.env.PUBLIC_BASE_URL?.replace("https://", "https://www."),
    "http://localhost:5173",
    "http://localhost:5000",
  ].filter((o): o is string => !!o),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin requests have no Origin header — pass them through.
      // Disallowed origins get no Access-Control-Allow-Origin header,
      // so the browser blocks the response without us 500-ing the request.
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

app.use("/api", router);

export default app;
