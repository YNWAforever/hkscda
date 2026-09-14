import "../components/site/volunteer/volunteer-centre.css";
import { PolicySignup } from "../components/site/volunteer/PolicySignup";
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { CalendarDays, Cat, Dog, Heart, House, Scissors, UserPlus, Users } from "lucide-react";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
const volunteerRoles = [
  {
    Icon: House,
    title: "暫托家庭",
    desc: "為等待領養的動物提供臨時居所，讓牠們在溫暖的家中等待領養。需家訪審核。",
  },
  {
    Icon: Cat,
    title: "貓舍義工",
    desc: "清潔貓舍、餵食、社交化貓咪、協助領養日活動。彈性時間，適合學生或在職人士。",
  },
  {
    Icon: Dog,
    title: "狗舍義工",
    desc: "溜狗、清潔狗舍、餵食、協助基本訓練。需要體力，適合喜歡戶外活動的人士。",
  },
  {
    Icon: Scissors,
    title: "TNR義工",
    desc: "協助捕捉、運送及放回流浪貓。需要耐性和體力，通常於清晨或晚間行動。",
  },
  {
    Icon: UserPlus,
    title: "領養日義工",
    desc: "協助每月領養日佈置、接待訪客、介紹動物。適合喜歡與人交流的人士。",
  },
  {
    Icon: Heart,
    title: "專業義工",
    desc: "如你擁有獸醫、攝影、設計、翻譯等專業技能，歡迎以專業支持協會。",
  },
];

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "加入義工團隊 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "加入香港拯救貓狗協會義工團隊。暫托家庭、貓狗舍義工、TNR行動、領養日義工等多種義工機會。一起拯救生命。",
      },
      { property: "og:title", content: "加入義工團隊 · HKSCDA" },
      {
        property: "og:description",
        content: "多種義工機會：暫托、貓舍、狗舍、TNR、領養日。一起為毛孩出力。",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/volunteer") }],
  }),
  component: VolunteerPage,
});

export function VolunteerPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (
    pathname.startsWith("/volunteer/status/") ||
    pathname.startsWith("/volunteer/group") ||
    pathname === "/volunteer/operations"
  ) {
    return <Outlet />;
  }

  return (
    <main>
      <PublicFormFrame trustNote="你的個人資料只會用於義工登記及聯絡，不會作其他用途。">
        <VolunteerDirectoryPage />
      </PublicFormFrame>
    </main>
  );
}

function VolunteerDirectoryPage() {
  return (
    <>
      <section className="section-container py-10 space-y-5">
        <p className="eyebrow">一起照顧貓狗</p>
        <h1>加入義工團隊</h1>
        <p>選擇合適的服務時間，一起為等待家的貓狗出一分力。</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn-primary" href="#volunteer-centre">
            <CalendarDays size={18} />
            瀏覽服務場次
          </a>
          <a className="btn-secondary" href="#volunteer-login">
            首次參與：登記身份
          </a>
          <a className="btn-secondary" href="#volunteer-login">
            已有義工身份：登入
          </a>
          <a className="btn-secondary" href="/volunteer/group">
            <Users size={18} />
            團體服務查詢
          </a>
        </div>
      </section>
      <PolicySignup />
      <details className="section-container py-8">
        <summary>了解義工服務類別</summary>
        <div className="grid gap-4 md:grid-cols-3">
          {volunteerRoles.map(({ Icon, title, desc }) => (
            <article key={title}>
              <Icon />
              <h2>{title}</h2>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </details>
    </>
  );
}
