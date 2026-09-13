import { createFileRoute } from "@tanstack/react-router";
import { InternshipForm } from "../components/site/InternshipForm";
export const Route = createFileRoute("/internships")({ ssr: false, component: InternshipForm });
