import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about/privacy')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://hkscda.com/about/privacy' }],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <h1 className="font-display text-3xl font-bold">私隱聲明</h1>
      <p className="text-[var(--color-text-muted)]">最後更新：2024年</p>

      {[
        {
          title: '1. 個人資料的收集',
          content: '香港拯救貓狗協會（「協會」）可能收集您的個人資料，包括姓名、聯絡電話、電郵地址及住址等，以處理領養申請、接受捐款及提供相關服務。我們只會收集所需的最少個人資料。',
        },
        {
          title: '2. 個人資料的使用',
          content: '您的個人資料將只用於：處理您的領養或助養申請；與您聯絡有關您的申請事宜；如您同意，向您發送協會的最新消息及活動資訊。我們不會將您的個人資料出售或出租予第三方。',
        },
        {
          title: '3. 個人資料的安全',
          content: '協會採取合理措施保護您的個人資料，防止未經授權的存取、披露、複製、使用或修改。所有個人資料均儲存在安全的系統內。',
        },
        {
          title: '4. 個人資料的披露',
          content: '在以下情況下，協會可能需要披露您的個人資料：根據法律規定；為保護協會的合法權益；獲得您的事先同意。',
        },
        {
          title: '5. 個人資料的保留',
          content: '協會只會在達到收集目的所需的期限內保留您的個人資料，或根據適用法律規定的保留期限內保留。',
        },
        {
          title: '6. 查閱及更正權利',
          content: '根據《個人資料（私隱）條例》，您有權查閱及更正我們持有的您的個人資料。如需提出要求，請電郵至協會的聯絡電郵。',
        },
      ].map(({ title, content }) => (
        <section key={title} className="space-y-3">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <p className="text-[var(--color-text-muted)] leading-relaxed">{content}</p>
        </section>
      ))}
    </main>
  )
}
