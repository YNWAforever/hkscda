import { useState } from "react";
import cat1 from "@/assets/cat1.jpg";
import cat2 from "@/assets/cat2.jpg";
import dog1 from "@/assets/dog1.jpg";
import dog2 from "@/assets/dog2.jpg";
import hero from "@/assets/hero.jpg";

const FB_PAGE = "https://www.facebook.com/HKSCDA";
const IG_HANDLE = "hkscda";

const igPosts = [
  { img: cat1, caption: "本週新到 · Mochi 等待你的家 🧡", likes: 482 },
  { img: dog1, caption: "Brownie 找到家了！恭喜 🎉", likes: 1204 },
  { img: cat2, caption: "BB貓一對 · 必須一齊領養", likes: 318 },
  { img: hero, caption: "義工日 · 多謝大家來幫手 🙌", likes: 856 },
  { img: dog2, caption: "TNR 行動進行中 · 灣仔後巷", likes: 290 },
  { img: cat1, caption: "助養計劃 · HK$100 起 💛", likes: 612 },
];

export function SocialWall() {
  const [tab, setTab] = useState<"fb" | "ig">("fb");
  return (
    <section
      id="social"
      className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]"
    >
      <div className="container-wide">
        <div className="text-center mb-10">
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3">
            📱 社群動態
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold mb-4">
            追蹤我們，與毛孩同步
          </h2>
          <p className="text-[var(--color-text-muted)] max-w-[52ch] mx-auto">
            每日最新領養動物、義工活動、TNR 行動報告，都在我們的 Facebook 與
            Instagram。
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-8 border-b border-[var(--color-border)]">
          {(
            [
              ["fb", "📘 Facebook"],
              ["ig", "📸 Instagram"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`relative -mb-px px-6 py-3 text-sm font-bold transition-colors ${
                tab === k
                  ? "text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "fb" && (
          <div className="grid lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
              <iframe
                title="HKSCDA Facebook Page"
                src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
                  FB_PAGE
                )}&tabs=timeline&width=500&height=700&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true&locale=zh_HK`}
                width="100%"
                height={700}
                style={{ border: "none", overflow: "hidden" }}
                scrolling="no"
                allow="encrypted-media"
                loading="lazy"
              />
            </div>
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6">
              <div className="text-4xl mb-3">📘</div>
              <h3 className="font-display text-xl font-bold mb-2">
                HKSCDA Facebook
              </h3>
              <p className="text-sm text-[var(--color-text-muted)] mb-5">
                追蹤本會官方專頁，獲取最新領養通告、義工招募、緊急救援報告及月度透明報表。
              </p>
              <a
                href={FB_PAGE}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-5 py-3 rounded-full bg-[#1877F2] text-white font-bold text-sm hover:opacity-90 transition-opacity"
              >
                前往 Facebook 專頁 →
              </a>
              <div className="mt-6 pt-6 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <p>💡 提示：如未能載入專頁內容，請允許瀏覽器接受第三方Cookie。</p>
              </div>
            </div>
          </div>
        )}

        {tab === "ig" && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:gap-4">
              {igPosts.map((p, i) => (
                <a
                  key={i}
                  href={`https://www.instagram.com/${IG_HANDLE}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square overflow-hidden rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]"
                >
                  <img
                    src={p.img}
                    alt={p.caption}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 text-white">
                    <p className="text-xs lg:text-sm font-medium line-clamp-3">
                      {p.caption}
                    </p>
                    <div className="text-xs mt-2 opacity-80">♥ {p.likes}</div>
                  </div>
                </a>
              ))}
            </div>
            <div className="text-center mt-8">
              <a
                href={`https://www.instagram.com/${IG_HANDLE}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold text-sm transition-opacity hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)",
                }}
              >
                📸 在 Instagram 追蹤 @{IG_HANDLE}
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
