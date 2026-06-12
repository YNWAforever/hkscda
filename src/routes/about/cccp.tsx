import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about/cccp')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://hkscda.com/about/cccp' }],
  }),
  component: CCCPPage,
})

function CCCPPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">CCCP計劃</h1>
      <p className="text-[var(--color-text-muted)] text-lg">社區貓照顧計劃（Community Cat Care Program）</p>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">什麼是CCCP？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          CCCP（社區貓照顧計劃）是香港拯救貓狗協會推行的社區流浪貓管理計劃。
          計劃透過訓練義工，讓社區居民學習如何妥善照顧流浪貓，同時配合TNR絕育計劃，
          逐步減少社區內流浪貓的數目，改善貓隻的生活質素。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">為何需要CCCP？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          香港有大量流浪貓生活在社區內。若缺乏妥善管理，流浪貓可能受到傷害、感染疾病或引起鄰里衝突。
          CCCP提供一個有系統的方法，讓社區居民與流浪貓和諧共存。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">CCCP vs 傳統方式對比</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface-offset)]">
                <th className="p-3 border border-[var(--color-border)] text-left">項目</th>
                <th className="p-3 border border-[var(--color-border)] text-left">傳統方式</th>
                <th className="p-3 border border-[var(--color-border)] text-left">CCCP方式</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['貓隻管理', '移除/撲殺', '原地絕育照顧'],
                ['貓隻數目', '短期減少，長期回升', '逐步穩定減少'],
                ['社區衝突', '頻繁', '顯著減少'],
                ['動物福利', '低', '高'],
                ['費用效益', '持續高費用', '一次性投入，長期效益'],
              ].map(([item, traditional, cccp]) => (
                <tr key={item}>
                  <td className="p-3 border border-[var(--color-border)] font-medium">{item}</td>
                  <td className="p-3 border border-[var(--color-border)] text-[var(--color-error)]">{traditional}</td>
                  <td className="p-3 border border-[var(--color-border)] text-[var(--color-success)]">{cccp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">每月運作</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          義工每日定時為指定地區的流浪貓提供食物及清水，定期記錄貓隻狀況，
          並配合TNR計劃安排未絕育貓隻進行手術。協會定期舉辦義工培訓，
          確保所有參與者具備正確的護理知識。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">如何支持CCCP</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          您可以透過擔任義工、捐款或捐贈物資支持CCCP計劃。
          如有興趣參與，請透過協會電郵聯絡我們。
        </p>
      </section>
    </main>
  )
}
