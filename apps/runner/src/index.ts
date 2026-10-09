import express from "express";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const app = express();
const dashboard = fileURLToPath(
  new URL("../../dashboard/dist/", import.meta.url),
);
app.disable("x-powered-by");
app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "vibeguard-runner" });
});
app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Unknown API route" });
});
if (existsSync(dashboard)) {
  app.use(express.static(dashboard));
  app.get("/{*path}", (_request, response) => {
    response.sendFile("index.html", { root: dashboard });
  });
}
const server = app.listen(4310, "127.0.0.1", () => {
  console.log("VibeGuard: http://127.0.0.1:4310");
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
