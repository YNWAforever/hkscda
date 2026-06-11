import { createFileRoute } from "@tanstack/react-router"
import { Users, UserPlus, House, Cat, Dog, Scissors, Heart } from "lucide-react"

const volunteerRoles = [
  { Icon: House, title: "暫托家庭", desc: "為等待領養的動物提供臨時居所，讓牠們在溫暖的家中等待領養。需家訪審核。" },
  { Icon: Cat, title: "貓舍義工", desc: "清潔貓舍、餵食、社交化貓咪、協助領養日活動。彈性時間，適合學生或在職人士。" },
  { Icon: Dog, title: "狗舍義工", desc: "溜狗、清潔狗舍、餵食、協助基本訓練。需要體力，適合喜歡戶外活動的人士。" },
  { Icon: Scissors, title: "TNR義工", desc: "協助捕捉、運送及放回流浪貓。需要耐性和體力，通常於清晨或晚間行動。" },
  { Icon: UserPlus, title: "領養日義工", desc: "協助每月領養日佈置、接待訪客、介紹動物。適合喜歡與人交流的人士。" },
  { Icon: Heart, title: "專業義工", desc: "如你擁有獸醫、攝影、設計、翻譯等專業技能，歡迎以專業支持協會。" },
]

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "加入義工團隊 — 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "加入香港拯救貓狗協會義工團隊。暫托家庭、貓狗舍義工、TNR行動、領養日義工等多種義工機會。一起拯救生命。",
      },
      { property: "og:title", content: "加入義工團隊 — HKSCDA" },
      { property: "og:description", content: "多種義工機會：暫托、貓舍、狗舍、TNR、領養日。一起為毛孩出力。" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/volunteer" }],
  }),
  component: VolunteerPage,
})

function VolunteerPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> 義工招募
        </div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold mb-4 leading-tight">
          他們，需要你的援手
        </h1>
        <p className="text-[var(--color-text-muted)] max-w-[52ch]">
          協會依靠義工的力量運作。無論你是學生、在職人士或退休人士，都能找到適合自己的義工崗位。
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {volunteerRoles.map(({ Icon, title, desc }) => (
          <div key={title} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:shadow-md transition-shadow">
            <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center mb-4">
              <Icon className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display font-bold mb-2">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold">如何加入？</h2>
        <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
          {[
            "透過電郵 info@hkscda.com 或 WhatsApp 9864 1089 聯絡我們，說明你想參與的義工崗位。",
            "我們會安排一次簡短面談，了解你的背景、可付出的時間及期望。",
            "完成基本培訓後，即可開始義工服務。協會會為所有義工提供持續支援及指導。",
          ].map((text, i) => (
            <div key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
