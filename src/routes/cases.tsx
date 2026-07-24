import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cases")({
  head: () => ({
    meta: [
      { title: "لوحة حالات المراجعة — HIMAM" },
      {
        name: "description",
        content: "لوحة حالات المراجعة داخل حزمة HIMAM 1A — Foundation.",
      },
      { property: "og:title", content: "لوحة حالات المراجعة — HIMAM" },
      {
        property: "og:description",
        content: "لوحة حالات المراجعة داخل حزمة HIMAM 1A — Foundation.",
      },
    ],
  }),
  component: () => <Outlet />,
});