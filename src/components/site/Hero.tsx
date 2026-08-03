import heroImg from "@/assets/hero.jpg";
import { PublicPageHero } from "./PublicPageHero";

export function Hero() {
  return (
    <div id="top">
      <PublicPageHero
        eyebrow="香港本地動物救援慈善機構"
        title="領養代替購買"
        description="救援、醫療、絕育與負責任領養，以社區力量守護香港流浪貓狗。"
        imageSrc={heroImg}
        imageAlt="義工懷抱獲救小動物"
        actions={(
          <>
            <a href="/animals/cat" className="btn-primary min-h-11 px-5">查看待領養動物</a>
            <a href="/donate" className="btn-secondary min-h-11 px-5">立即捐助</a>
          </>
        )}
      />
    </div>
  );
}