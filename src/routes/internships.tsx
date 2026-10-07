import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";
import { InternshipForm } from "../components/site/InternshipForm";
export const Route = createFileRoute("/internships")({
  ssr: false,
  head: () =>
    pageHead({
      title: "獸醫學生實習申請",
      description: "實習由職員獨立審核院校及課程證據，不按一般義工級別或出席次數批准。",
      path: "/internships",
    }),
  component: InternshipForm,
});
