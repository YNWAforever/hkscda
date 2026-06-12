import { createFileRoute } from '@tanstack/react-router'
import * as Tabs from '@radix-ui/react-tabs'

export const Route = createFileRoute('/adoption/instructions')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://hkscda.com/adoption/instructions' }],
  }),
  component: InstructionsPage,
})

const adoptionRules = [
  '申請人須年滿18歲，並持有香港居留權或工作證。',
  '申請人須提供真實個人資料及住址，以便協會進行家訪。',
  '領養前須繳付領養費（貓：HK$800；狗：HK$1,000），費用包括絕育、晶片及疫苗。',
  '領養後不得遺棄、轉讓或出售動物，如無法繼續飼養須通知協會安排。',
  '須確保動物生活在安全、舒適的室內環境。',
  '須定期帶動物進行健康檢查及接種疫苗。',
  '如住所為租住單位，須提供業主同意飼養寵物的書面証明。',
  '申請人須同意協會進行跟進家訪，以確保動物受到妥善照顧。',
  '每個家庭最多可領養兩隻動物（特殊情況除外，需協會批准）。',
  '申請人須了解並接受動物的生理及行為特性，有耐心照顧。',
  '領養後如動物出現健康問題，須立即尋求獸醫協助。',
  '協會保留拒絕不合適申請的權利，並無需解釋原因。',
]

const catCareTopics = [
  { value: 'home', label: '家居', content: '為貓貓提供安全的室內環境。安裝防護網防止貓咪跌出窗外或逃跑。移除家中有毒植物及危險物品。提供足夠的躲藏空間及高處休息位置。' },
  { value: 'collection', label: '領取', content: '領取當日請自備貓籠。建議準備毛巾蓋住貓籠，減少貓咪緊張情緒。回家後讓貓咪在安靜的房間慢慢適應新環境，不要急於介紹給家中其他寵物。' },
  { value: 'food', label: '糧食', content: '提供高質素的貓糧，可混合乾糧及濕糧。確保隨時有新鮮清水。避免餵食人類食物，特別是洋蔥、大蒜、朱古力及葡萄。' },
  { value: 'cleaning', label: '清潔', content: '每日清潔貓砂盆，定期更換貓砂。每月為貓咪梳毛，長毛貓需更頻繁。定期修剪指甲。' },
  { value: 'health', label: '保健', content: '每年接種疫苗及進行健康檢查。定期驅蟲（體內及體外）。留意貓咪的飲食及排便習慣，如有異常盡快求醫。' },
  { value: 'supplies', label: '用品', content: '必備用品：貓籠/外出籠、貓砂盆及貓砂、食具及水具、抓板及玩具、梳毛工具。' },
  { value: 'window', label: '安窗', content: '必須安裝貓網或防護網，防止貓咪從高處墜落或走失。市面上有多款適合不同窗型的貓網，請在貓咪到來前安裝妥當。' },
]

const dogCareTopics = [
  { value: 'home', label: '家居', content: '為狗狗提供安全的空間，移除危險物品。準備舒適的狗床或睡墊。確保門窗關閉防止逃跑。' },
  { value: 'collection', label: '領取', content: '領取當日請自備狗籠或牽引繩。讓狗狗有時間適應新家，保持安靜環境。' },
  { value: 'food', label: '食物', content: '提供適合體型及年齡的優質狗糧。確保隨時有新鮮清水。避免洋蔥、大蒜、朱古力、葡萄及過鹹食物。' },
  { value: 'rest', label: '休息', content: '為狗狗提供固定的休息位置。幼犬每日需要較多睡眠，勿過度打擾。' },
  { value: 'cleaning', label: '清潔', content: '定期洗澡及梳毛。定期清潔耳朵及修剪指甲。訓練狗狗在指定地點排便。' },
  { value: 'health', label: '保健', content: '每年接種疫苗及驅蟲。定期獸醫檢查。注意狗狗的飲食及行為變化。' },
  { value: 'walk', label: '溜狗', content: '每日帶狗狗外出散步，提供適量運動。外出時必須使用牽引繩及佩戴狗牌。在允許的地方才可讓狗狗放開繩子。' },
  { value: 'training', label: '教育', content: '盡早開始基本服從訓練，如坐下、等待、召回等。使用正向強化方法，避免體罰。如有行為問題，可尋求專業訓練師協助。' },
]

function InstructionsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-12">
      <h1 className="font-display text-3xl font-bold">領養需知</h1>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">領養規則</h2>
        <ol className="space-y-3">
          {adoptionRules.map((rule, i) => (
            <li key={i} className="flex gap-3 text-[var(--color-text-muted)]">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <span className="leading-relaxed">{rule}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">養貓需知</h2>
        <Tabs.Root defaultValue="home">
          <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
            {catCareTopics.map(t => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-cat)] data-[state=active]:text-[var(--color-cat)] text-[var(--color-text-muted)]"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {catCareTopics.map(t => (
            <Tabs.Content key={t.value} value={t.value} className="text-[var(--color-text-muted)] leading-relaxed">
              {t.content}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">養狗需知</h2>
        <Tabs.Root defaultValue="home">
          <Tabs.List className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-4">
            {dogCareTopics.map(t => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="px-3 py-2 text-sm rounded-t data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-dog)] data-[state=active]:text-[var(--color-dog)] text-[var(--color-text-muted)]"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {dogCareTopics.map(t => (
            <Tabs.Content key={t.value} value={t.value} className="text-[var(--color-text-muted)] leading-relaxed">
              {t.content}
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>
    </main>
  )
}
