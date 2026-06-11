import { createFileRoute } from '@tanstack/react-router'
import { Box, Stethoscope, House } from 'lucide-react'

export const Route = createFileRoute('/about/tnr')({
  component: TNRPage,
})

function TNRPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">TNR計劃</h1>
      <p className="text-[var(--color-text-muted)] text-lg">誘捕—絕育—放回（Trap-Neuter-Return）</p>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">什麼是TNR？</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          TNR是目前國際公認最有效管理流浪貓數目的人道方法。研究顯示，
          若一個地區有超過70%的流浪貓完成絕育，該地區的流浪貓數目將逐漸自然減少。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">TNR三個階段</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { step: '1', title: '誘捕 Trap', Icon: Box, desc: '義工使用人道捕捉籠，安全捕捉目標流浪貓，過程不傷害動物。' },
            { step: '2', title: '絕育 Neuter', Icon: Stethoscope, desc: '將捕捉到的貓送往合作獸醫診所進行絕育手術，同時進行基本健康檢查及注射疫苗。' },
            { step: '3', title: '放回 Return', Icon: House, desc: '手術後在原地放回，耳尖剪作識別記號，繼續由CCCP義工照顧。' },
          ].map(({ step, title, Icon, desc }) => (
            <div key={step} className="bg-[var(--color-surface-offset)] rounded-xl p-5 space-y-2">
              <div className="h-10 w-10 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center">
                <Icon className="h-5 w-5 text-[var(--color-primary)]" />
              </div>
              <div className="font-bold text-[var(--color-primary)]">第{step}步</div>
              <div className="font-semibold">{title}</div>
              <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">沒有TNR的情況</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          若缺乏TNR介入，流浪貓群落會持續繁殖，數目不斷上升。
          大量流浪貓可能引致社區衛生問題、鄰里衝突，
          同時增加捕捉安樂死的開支。TNR是更人道、更有效的長期解決方案。
        </p>
      </section>
    </main>
  )
}
