import { createFileRoute, redirect } from "@tanstack/react-router";

// Root entry point: HIMAM is an operational review tool, so "/" sends the
// user straight to the review-cases start screen. The reference file package
// lives at /framework-package.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/cases", replace: true });
  },
  head: () => ({
    meta: [
      { title: "HIMAM — بدء مراجعة خطة تربوية" },
      {
        name: "description",
        content: "ابدأ مراجعة خطة تربوية فردية عبر منصة HIMAM: أنشئ حالة، ارفع الخطة، وتابع الرحلة.",
      },
      { property: "og:title", content: "HIMAM — بدء مراجعة خطة تربوية" },
      {
        property: "og:description",
        content: "ابدأ مراجعة خطة تربوية فردية عبر منصة HIMAM: أنشئ حالة، ارفع الخطة، وتابع الرحلة.",
      },
    ],
  }),
});
