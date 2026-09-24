import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/about/cccp")({
  beforeLoad: () => {
    throw redirect({ to: "/about/tnr", statusCode: 301 });
  },
});
