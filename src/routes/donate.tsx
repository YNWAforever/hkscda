import { createFileRoute } from "@tanstack/react-router";
import {
  Heart,
  Smartphone,
  Zap,
  Building,
  Globe,
  ReceiptText,
  Check,
  PawPrint,
} from "lucide-react";

const donateMethods = [
  { Icon: Smartphone, title: "PayMe Business", desc: "WhatsApp 至 9864 1089 索取 QR Code 過數" },
  { Icon: Zap, title: "轉數快 FPS", desc: "電話 9864 1089 · FPS ID 8727588" },
  { Icon: Building, title: "銀行入帳", desc: "匯豐 124-511320-838 · 中銀 012-351-1-025023-2" },
  { Icon: Globe, title: "PayPal / GIVE.asia", desc: "支持每月定額捐款，持續支援救助行動" },
];

export const Route = createFileRoute("/donate")({
  head: () => ({
    meta: [
      { title: "捐助我們 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "支持香港拯救貓狗協會，捐款HK$100可申請退稅。PayMe、轉數快FPS、銀行入帳、PayPal多種捐款方式。慈善牌照91/14493。",
      },
      { property: "og:title", content: "捐助我們 · HKSCDA" },
      {
        property: "og:description",
        content: "您的每一份善意，都是生命的希望。立即捐款支持流浪貓狗。",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/donate" }],
  }),
  component: DonatePage,
});

function DonatePage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5" /> 捐助我們
        </div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold mb-4 leading-tight">
          您的每一份善意
          <br />
          都是生命的希望
        </h1>
        <p className="text-[var(--color-text-muted)] max-w-[52ch]">
          本會為政府認可慈善機構（91/14493），捐款 HK$100 以上可申請退稅收條（IRD
          §88）。所有善款均用於小動物醫療及護理。
        </p>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-success-highlight)] text-[var(--color-success)] text-xs font-bold">
        <Check className="h-3 w-3" /> 稅務局認可 IRD §88 免稅機構
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {donateMethods.map((d) => (
          <div
            key={d.title}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex gap-4 hover:shadow-md transition-shadow"
          >
            <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center shrink-0">
              <d.Icon className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm mb-1">{d.title}</h2>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed break-words">
                {d.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded-2xl p-6 space-y-3">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-[var(--color-primary)]" /> 退稅收條申請
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          每月25日前提交退稅收條申請，正式收條於次月中發出。請WhatsApp 致 9864 1089 或電郵至
          info@hkscda.com 提交以下資料：
        </p>
        <ul className="text-sm text-[var(--color-text-muted)] space-y-1 list-disc pl-5">
          <li>捐款人全名（須與報稅姓名一致）</li>
          <li>捐款金額及日期</li>
          <li>捐款方式（PayMe/FPS/銀行入帳/PayPal）</li>
          <li>聯絡電話</li>
        </ul>
      </div>

      <div className="text-center">
        <a
          href="/sponsors"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-primary)] text-white font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
        >
          <PawPrint className="h-4 w-4" /> 查看助養動物
        </a>
      </div>
    </main>
  );
}
