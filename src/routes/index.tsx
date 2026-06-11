import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/site/Hero";
import { SocialProof } from "@/components/site/SocialProof";
import { VolunteerCarousel } from "@/components/site/VolunteerCarousel";
import { SocialWall } from "@/components/site/SocialWall";
import heroImg from "@/assets/hero.jpg";
import cat1 from "@/assets/cat1.jpg";
import cat2 from "@/assets/cat2.jpg";
import dog1 from "@/assets/dog1.jpg";
import dog2 from "@/assets/dog2.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "香港拯救貓狗協會 HKSCDA · 領養代替購買" },
      {
        name: "description",
        content:
          "香港拯救貓狗協會（HKSCDA）成立於2007年，致力為流浪貓狗提供糧食、醫療、絕育及領養服務。支持領養等於拯救生命。",
      },
      { property: "og:title", content: "香港拯救貓狗協會 HKSCDA" },
      {
        property: "og:description",
        content: "支持領養 · 拯救生命 · 不殺機構 · 每年救助超過600隻毛孩",
      },
      { property: "og:image", content: heroImg },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Index,
});

const animals = {
  cats: [
    { img: cat1, name: "Mochi 麻糬", age: "1.5 歲", sex: "母", note: "親人", id: "C-241" },
    { img: cat2, name: "Pebble 石仔", age: "4 個月", sex: "公", note: "BB一對", id: "C-256" },
    { img: cat1, name: "Latte 拿鐵", age: "2 歲", sex: "母", note: "靜靜", id: "C-201" },
    { img: cat2, name: "Soba 蕎麥", age: "3 個月", sex: "公", note: "BB一對", id: "C-257" },
  ],
  dogs: [
    { img: dog1, name: "Brownie 布朗尼", age: "3 歲", sex: "公", note: "親人", id: "D-118" },
    { img: dog2, name: "Coco 可可", age: "8 歲", sex: "母", note: "適合靜家庭", id: "D-095" },
    { img: dog1, name: "Lucky 大旺", age: "2 歲", sex: "公", note: "活潑", id: "D-122" },
    { img: dog2, name: "Bagel", age: "6 歲", sex: "母", note: "TNR康復", id: "D-110" },
  ],
};

const programs = [
  { icon: "🚨", title: "緊急救援", desc: "接報後迅速行動，拯救受傷、被棄養或來自繁殖場的貓狗，提供即時醫療護理。" },
  { icon: "🐱", title: "貓隻領域護理 CCCP", desc: "為社區貓隻提供持續餵食、健康監察及環境管理。" },
  { icon: "✂️", title: "TNR 捕捉絕育放回", desc: "透過絕育有效控制流浪動物數量，減少苦難循環。" },
  { icon: "🏡", title: "暫托安置", desc: "由義工家庭提供臨時安置，讓動物在溫暖環境中等待領養。" },
  { icon: "💊", title: "每月助養計劃", desc: "每月 HK$100，助養一隻貓或狗，支援日常膳食及醫療。" },
  { icon: "📊", title: "透明工作報告", desc: "定期發布月度領養及核數報告，對每一位支持者負責。" },
];

const donateMethods = [
  { icon: "📱", title: "PayMe Business", desc: "WhatsApp 至 9864 1089 索取 QR Code 過數" },
  { icon: "⚡", title: "轉數快 FPS", desc: "電話 9864 1089 · FPS ID 8727588" },
  { icon: "🏦", title: "銀行入帳", desc: "匯豐 124-511320-838 · 中銀 012-351-1-025023-2" },
  { icon: "🌐", title: "PayPal / GIVE.asia", desc: "支持每月定額捐款，持續支援救助行動" },
];

function Index() {
  return (
    <div>
      <main>
        <Hero />

        {/* Impact bar */}
        <div className="bg-[var(--color-primary)] px-6 py-6">
          <div className="container-wide grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white">
            {[
              ["600+", "每年救助毛孩"],
              ["每14小時", "一隻動物獲領養"],
              ["HK$100+", "捐款可申請退稅"],
              ["不殺承諾", "No Kill 機構"],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="font-display text-xl lg:text-2xl font-bold">{n}</div>
                <div className="text-xs text-white/80 mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Adoption */}
        <section id="adoption" className="px-6 py-16 lg:py-24 bg-[var(--color-surface)]">
          <div className="container-wide">
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
              🐾 領養動物
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">
              牠們在等待一個家
            </h2>
            <p className="text-[var(--color-text-muted)] max-w-[52ch] mb-10">
              現時待領養的貓貓和狗狗，所有動物均需家訪審核。貓咪領養費 HK$500 · 唐狗免費。
            </p>

            <h3 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              🐱 待領養貓貓
              <span className="text-sm bg-[var(--color-cat-bg)] text-[var(--color-cat)] px-3 py-1 rounded-full">
                {animals.cats.length} 隻精選
              </span>
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
              {animals.cats.map((a) => (
                <AnimalCard key={a.id} a={a} type="cat" />
              ))}
            </div>

            <h3 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              🐶 待領養狗狗
              <span className="text-sm bg-[var(--color-dog-bg)] text-[var(--color-dog)] px-3 py-1 rounded-full">
                {animals.dogs.length} 隻精選
              </span>
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {animals.dogs.map((a) => (
                <AnimalCard key={a.id} a={a} type="dog" />
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]">
          <div className="container-wide grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
                🏠 關於協會
              </div>
              <h2 className="font-display text-3xl lg:text-5xl font-bold mb-6 leading-tight">
                拯救生命的使命
                <br />
                從 2007 年延續至今
              </h2>
              <div className="space-y-4 text-[var(--color-text)]">
                <p>
                  香港拯救貓狗協會（HKSCDA）於 <strong>2007 年 4 月 1 日</strong> 成立，由創辦人{" "}
                  <strong>Linda Tse</strong> 帶領，以「<strong>支持領養等於拯救生命</strong>」為宗旨，為本地非牟利慈善機構（檔案 91/14493）。
                </p>
                <p>
                  本會致力為流浪貓狗提供糧食、醫療、絕育及領養服務，同時積極援救街頭受傷或被遺棄的小動物，為牠們尋找<strong>永久的家</strong>。
                </p>
                <p>
                  我們是一個「<strong>不殺（No Kill）</strong>」機構，只要小動物一息尚存，絕不放棄任何生命。平均每 14 小時就有一隻動物獲成功領養。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 mt-6">
                {["慈善牌照 91/14493", "漁農署 ORG-00041", "IRD §88 免稅", "No Kill 機構"].map(
                  (b) => (
                    <span
                      key={b}
                      className="text-xs px-3 py-1 rounded-full bg-[var(--color-surface-offset)] border border-[var(--color-border)] font-medium"
                    >
                      {b}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="grid gap-4">
              {[
                ["🏥", "醫療救援", "為拯救的貓狗提供全面醫療護理，包括絕育、疫苗及日常保健。"],
                ["🏠", "領養媒合", "透過嚴格家訪審核，為每隻動物配對最適合的永久家庭。"],
                ["🌍", "社區教育", "推廣領養代替購買、愛護動物及生育控制理念。"],
                ["🤝", "跨機構合作", "與其他動物組織保持開放合作，共同改善流浪動物福祉。"],
              ].map(([icon, t, d]) => (
                <div
                  key={t}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="text-3xl shrink-0">{icon}</div>
                  <div>
                    <h3 className="font-display font-bold mb-1">{t}</h3>
                    <p className="text-sm text-[var(--color-text-muted)]">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Programs */}
        <section id="programs" className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]">
          <div className="container-wide">
            <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
              🛡️ 服務計劃
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">
              全面照顧流浪動物
            </h2>
            <p className="text-[var(--color-text-muted)] max-w-[52ch] mb-10">
              從緊急拯救到永久領養，我們提供全方位的動物福利服務。
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {programs.map((p) => (
                <div
                  key={p.title}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 hover:shadow-md hover:-translate-y-1 transition-all"
                >
                  <div className="text-3xl mb-3">{p.icon}</div>
                  <h3 className="font-display font-bold mb-2">{p.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social proof — NEW */}
        <SocialProof />

        {/* Volunteer carousel — NEW */}
        <VolunteerCarousel />

        {/* Social media wall — NEW */}
        <SocialWall />

        {/* Donate */}
        <section id="donate" className="px-6 py-16 lg:py-24 bg-[var(--color-bg)]">
          <div className="container-wide grid lg:grid-cols-5 gap-10 items-start">
            <div className="lg:col-span-2">
              <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
                💛 捐助我們
              </div>
              <h2 className="font-display text-3xl lg:text-5xl font-bold mb-6 leading-tight">
                您的每一份善意
                <br />
                都是生命的希望
              </h2>
              <p className="text-[var(--color-text-muted)] mb-6">
                本會為政府認可慈善機構（91/14493），捐款 HK$100 以上可申請退稅收條（IRD §88）。所有善款均用於小動物醫療及護理。
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-success-highlight)] text-[var(--color-success)] text-xs font-bold">
                ✅ 稅務局認可 IRD §88 免稅機構
              </div>
            </div>
            <div className="lg:col-span-3 grid sm:grid-cols-2 gap-4">
              {donateMethods.map((d) => (
                <div
                  key={d.title}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center text-xl shrink-0">
                    {d.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm mb-1">{d.title}</h3>
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed break-words">
                      {d.desc}
                    </p>
                  </div>
                </div>
              ))}
              <a
                href="#contact"
                className="sm:col-span-2 mt-2 inline-flex items-center justify-center px-6 py-4 rounded-full bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                🧾 申請退稅收條 / 聯絡我們
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function AnimalCard({
  a,
  type,
}: {
  a: { img: string; name: string; age: string; sex: string; note: string; id: string };
  type: "cat" | "dog";
}) {
  const isCat = type === "cat";
  return (
    <article className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl overflow-hidden hover:-translate-y-1 hover:shadow-md transition-all">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={a.img}
          alt={a.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span
          className={`absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full ${
            isCat
              ? "bg-[var(--color-cat-bg)] text-[var(--color-cat)]"
              : "bg-[var(--color-dog-bg)] text-[var(--color-dog)]"
          }`}
        >
          {a.id}
        </span>
      </div>
      <div className="p-4">
        <h4 className="font-display font-bold mb-2">{a.name}</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {[a.age, a.sex, a.note].map((t) => (
            <span
              key={t}
              className="text-xs bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] px-2 py-0.5 rounded-full"
            >
              {t}
            </span>
          ))}
        </div>
        <a
          href="#contact"
          className={`block text-center w-full px-4 py-2 rounded-full text-sm font-bold border-[1.5px] transition-colors ${
            isCat
              ? "bg-[var(--color-cat-bg)] text-[var(--color-cat)] border-[var(--color-cat)] hover:bg-[var(--color-cat)] hover:text-white"
              : "bg-[var(--color-dog-bg)] text-[var(--color-dog)] border-[var(--color-dog)] hover:bg-[var(--color-dog)] hover:text-white"
          }`}
        >
          申請領養
        </a>
      </div>
    </article>
  );
}
