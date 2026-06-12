import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.com/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold text-[var(--color-text)]">協會簡介</h1>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">關於香港拯救貓狗協會</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          香港拯救貓狗協會（HKSCDA）是一個非牟利慈善團體，致力於拯救、照顧及為流浪及被遺棄的貓狗尋找領養家庭。
          協會成立以來，已協助數以百計的動物重獲新生，在愛心義工及捐助者的支持下持續運作。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">協會宗旨</h2>
        <ul className="space-y-2 list-none">
          {[
            "拯救流浪及被遺棄的貓狗",
            "提供臨時住所及醫療照顧",
            "推廣負責任的寵物主人文化",
            "協助動物尋找永久愛心家庭",
            "推行絕育計劃減少流浪動物數目",
            "提高社會人士對動物福利的關注",
            "與政府及其他動物福利機構合作",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-[var(--color-text-muted)]">
              <span className="text-[var(--color-primary)] mt-1">•</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">主要工作</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會主要工作包括：拯救行動、醫療救治、義工招募、領養配對、CCCP社區貓照顧計劃及TNR（誘捕-絕育-放回）計劃。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">貓舍及狗舍</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會設有貓舍及狗舍，為等待領養的動物提供安全舒適的居住環境，
          動物在等待領養期間均獲得適當的食物、醫療及社交化訓練。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">收費表</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-offset)]">
                <th className="text-left p-3 border border-[var(--color-border)]">服務</th>
                <th className="text-left p-3 border border-[var(--color-border)]">貓</th>
                <th className="text-left p-3 border border-[var(--color-border)]">狗</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["領養費", "HK$800", "HK$1,000"],
                ["絕育手術（已包含在領養費內）", "✓", "✓"],
                ["晶片及疫苗（已包含在領養費內）", "✓", "✓"],
              ].map(([service, cat, dog]) => (
                <tr key={service} className="border-b border-[var(--color-border)]">
                  <td className="p-3 border border-[var(--color-border)]">{service}</td>
                  <td className="p-3 border border-[var(--color-border)]">{cat}</td>
                  <td className="p-3 border border-[var(--color-border)]">{dog}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
