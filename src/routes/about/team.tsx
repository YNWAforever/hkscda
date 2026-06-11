import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about/team')({
  component: TeamPage,
})

function TeamPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <h1 className="font-display text-3xl font-bold">團隊</h1>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">董事會</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { role: '主席', name: '謝曉梅女士', desc: '帶領協會多年，致力推動香港動物福利發展。' },
            { role: '名譽主席', name: '鄧殷女士', desc: '支持協會工作，積極推廣動物友善社區。' },
          ].map(({ role, name, desc }) => (
            <div key={name} className="bg-[var(--color-surface-offset)] rounded-xl p-6 space-y-2">
              <div className="text-sm text-[var(--color-primary)] font-semibold">{role}</div>
              <div className="font-display text-lg font-bold">{name}</div>
              <p className="text-sm text-[var(--color-text-muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">義工團隊</h2>
        <p className="text-[var(--color-text-muted)] leading-relaxed">
          協會有一群熱心的義工，定期參與喂飼、清潔貓舍狗舍、協助領養配對及活動籌辦等工作。
          如有興趣加入義工行列，歡迎透過電郵聯絡我們。
        </p>
      </section>
    </main>
  )
}
