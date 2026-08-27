import type { PublicImpactItem } from "../../../lib/animals/publicImpact";

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("zh-HK", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Hong_Kong",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

/**
 * Ported from hkscdagpt app/page.tsx (impact-section). With no verified figures
 * the band says so explicitly. It never falls back to zero, an old number or an
 * estimate (plan section 10).
 */
export function ImpactBand({ items, asOf }: { items: PublicImpactItem[]; asOf: string | null }) {
  const asOfLabel = formatDate(asOf);

  return (
    <section className="impact-section" aria-labelledby="impact-title">
      <div className="public-container impact-shell">
        <div>
          <p className="eyebrow eyebrow-light">公開數據</p>
          <h2 id="impact-title">看得見的工作，查得到的資料。</h2>
        </div>
        {items.length && asOfLabel ? (
          <div className="impact-data">
            {items.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
            <p>資料截至 {asOfLabel}</p>
          </div>
        ) : (
          <div className="impact-unavailable">
            <strong>暫未發佈</strong>
            <p>即時數據接駁完成前，不會以零值、舊數字或估算數字代替。</p>
          </div>
        )}
      </div>
    </section>
  );
}
