// Catch-all Netlify Function: serves the entire Express API.
// It imports the PRE-BUILT app bundle (dist/app.mjs) so Netlify's function
// bundler never has to resolve the pnpm-workspace `./src/*.ts` exports.
// Build order is enforced by netlify.toml (api-server build runs first).
import serverless from "serverless-http";
// @ts-expect-error - generated CJS bundle, no type declarations
import app from "../../artifacts/api-server/dist/app.cjs";

export const handler = serverless(app.default ?? app);
