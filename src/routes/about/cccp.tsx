import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { brand } from "../../lib/brand/brand";
import { getCccpPageContent } from "../../lib/aboutPages/publicPage.functions";
import type { CccpPageContent } from "../../lib/aboutPages/types";

export const Route = createFileRoute("/about/cccp")({
  head: () => ({
    meta: [
      { title: "CCCP 社區貓照顧計劃 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "CCCP 是香港拯救貓狗協會的社區流浪貓管理計劃，透過義工訓練、日常照顧與絕育合作改善社區與貓隻的生活。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/cccp") }],
  }),
  loader: () => getCccpPageContent(),
  component: CCCPPage,
});

const DEFAULT_CCCP_CONTENT: CccpPageContent = {
  hero: {
    eyebrow: "我們的工作",
    title: "CCCP 社區貓照顧計劃",
    description:
      "社區貓照顧計劃（Community Cat Care Program）以社區參與、日常觀察和絕育合作，建立可持續的照顧網絡。",
  },
  chapters: [
    {
      title: "什麼是 CCCP",
      description:
        "CCCP 是香港拯救貓狗協會推行的社區流浪貓管理計劃。計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合 TNR 絕育工作，逐步改善貓隻和社區的生活質素。",
    },
    {
      title: "為何需要 CCCP",
      description:
        "有系統的照顧能讓社區居民與流浪貓和諧共存，並及早發現受傷、疾病和未絕育的貓隻，連接合適的義工和獸醫支援。",
    },
  ],
  workRows: [
    { scope: "日常照顧", method: "定點餵食、清潔和觀察", result: "及早發現需要協助的動物" },
    { scope: "絕育合作", method: "配合 TNR 安排手術", result: "減少繁殖和流浪壓力" },
    { scope: "社區溝通", method: "由義工連接居民和協會", result: "降低衝突，分享正確照顧方法" },
  ],
  workSectionTitle: "CCCP 的工作方式",
  cta: {
    eyebrow: "參與其中",
    title: "你可以擔任義工、捐款或捐贈物資。",
    description: "如有興趣參與社區貓照顧工作，可先了解目前的義工崗位，或直接聯絡團隊。",
    points: ["義工訓練與日常照顧", "配合絕育安排", "社區溝通與教育"],
  },
};

// Two fallback layers, both needed: the default parameter covers an omitted
// `content` prop, while the `??` below covers the loader explicitly
// resolving to `null`.
export function CCCPPage() {
  const content = Route.useLoaderData();
  return <CCCPContent content={content} />;
}

export function CCCPContent({ content }: { content?: CccpPageContent | null }) {
  const page = content ?? DEFAULT_CCCP_CONTENT;
  return (
    <PublicPageFrame
      eyebrow={page.hero.eyebrow}
      title={page.hero.title}
      description={page.hero.description}
      chapters={page.chapters.map((chapter) => ({
        title: chapter.title,
        description: chapter.description,
      }))}
      cta={{
        eyebrow: page.cta.eyebrow,
        title: page.cta.title,
        description: page.cta.description,
        points: [...page.cta.points],
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    >
      <section className="section">
        <div className="public-container">
          <div className="content-chapter">
            <h2>{page.workSectionTitle}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">工作範圍</th>
                    <th scope="col">社區做法</th>
                    <th scope="col">動物福利結果</th>
                  </tr>
                </thead>
                <tbody>
                  {page.workRows.map((row, index) => (
                    <tr key={row.scope + index}>
                      <th scope="row">{row.scope}</th>
                      <td>{row.method}</td>
                      <td>{row.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              查詢可電郵 <a href={"mailto:" + brand.org.email}>{brand.org.email}</a> 或 WhatsApp{" "}
              {brand.org.phone}。
            </p>
          </div>
        </div>
      </section>
    </PublicPageFrame>
  );
}
