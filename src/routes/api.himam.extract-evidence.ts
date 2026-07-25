import { createFileRoute } from "@tanstack/react-router";

// Server boundary for AI-assisted evidence extraction. All secrets stay on
// the server; the browser only sees `configured | not_configured | unavailable`
// via GET, and posts a minimized payload via POST. Until a provider is
// wired in, the endpoint reports `not_configured` and refuses all POSTs —
// the client falls back to manual evidence.
export const Route = createFileRoute("/api/himam/extract-evidence")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ availability: "not_configured" }, { status: 200 }),
      POST: async () =>
        Response.json(
          {
            ok: false,
            candidates: [],
            modelName: null,
            errorCode: "not_configured",
            errorMessage: null,
          },
          { status: 200 },
        ),
    },
  },
});