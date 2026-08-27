import { Link } from "@tanstack/react-router";

const WAYS: [string, string, string][] = [
  ["領養", "讓一隻獲救貓狗得到安全、穩定的永久家庭。", "/animals/cat"],
  ["助養", "以每月支持分擔長期照護、膳食與醫療需要。", "/sponsors"],
  ["義工", "用時間與專長支援照護、活動及社區工作。", "/volunteer"],
  ["捐助", "讓救援團隊能回應突發個案及持續醫療開支。", "/donate"],
];

/** Ported from hkscdagpt app/page.tsx (help-section). */
export function HelpCards() {
  return (
    <section className="section help-section" aria-labelledby="help-title">
      <div className="public-container">
        <div className="section-heading centered-heading">
          <p className="eyebrow">選擇你的參與方式</p>
          <h2 id="help-title">每一種支持，都能推動下一次救援。</h2>
        </div>
        <div className="help-grid">
          {WAYS.map(([title, description, to], index) => (
            <Link className="help-card" to={to} key={title}>
              <span>{"0" + (index + 1)}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <b>了解更多 →</b>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
