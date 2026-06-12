import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircleQuestion } from "lucide-react";
import dog1 from "@/assets/dog1.jpg";

const faqs = [
  {
    q: "領養需要收費嗎？",
    a: "貓咪領養費為 HK$500，用於補貼絕育、疫苗及晶片費用；唐狗領養費全免。所有動物領養前均已完成基本醫療檢查。",
  },
  {
    q: "家訪審核會檢查甚麼？",
    a: "義工會確認居住環境安全（如窗戶有防護網）、家庭成員意願一致，並了解飼養計劃。家訪不是審查，而是為毛孩找一個真正合適的永久家庭。",
  },
  {
    q: "我可以先和動物見面嗎？",
    a: "可以。歡迎透過 WhatsApp（9864 1089）預約探訪，或參加定期舉行的領養日活動，親身認識等待家園的毛孩。",
  },
  {
    q: "捐款可以申請退稅嗎？",
    a: "可以。本會為政府認可慈善機構（檔案 91/14493），捐款 HK$100 或以上可申請退稅收條（IRD §88）。",
  },
  {
    q: "不能領養，還有其他幫忙方式嗎？",
    a: "有很多！您可以參加每月 HK$100 的助養計劃、成為暫托家庭、加入義工團隊，或捐贈糧食及醫療物資。每一份力量都很重要。",
  },
];

export function FAQ() {
  return (
    <section className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]" aria-labelledby="faq-h">
      <div className="container-wide grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
        <div className="lg:col-span-2">
          <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
            <MessageCircleQuestion className="h-3.5 w-3.5" /> 常見問題
          </div>
          <h2
            id="faq-h"
            className="font-display text-3xl lg:text-4xl font-bold text-[var(--color-panel)] mb-4 leading-tight"
          >
            領養前，
            <br />
            你可能想知道
          </h2>
          <p className="text-[var(--color-text-muted)] mb-8 max-w-[40ch]">
            找不到答案？歡迎 WhatsApp 9864 1089 或電郵 info@hkscda.com 查詢。
          </p>
          <div className="relative hidden lg:block">
            <div className="absolute inset-3 rounded-[2rem] -rotate-3 bg-[var(--color-accent-soft)]" aria-hidden="true" />
            <img
              src={dog1}
              alt="等待領養的唐狗"
              loading="lazy"
              className="relative rounded-[2rem] w-full aspect-[4/3] object-cover shadow-lg"
            />
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="rounded-[2rem] bg-[var(--color-panel)] text-white px-6 py-4 mb-4 font-display font-bold flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-[var(--color-accent-warm)]" />
            Frequently Asked Questions
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem
                key={f.q}
                value={`faq-${i}`}
                className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] px-5 data-[state=open]:shadow-md transition-shadow"
              >
                <AccordionTrigger className="font-bold text-[var(--color-panel)] hover:no-underline py-4.5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[var(--color-text-muted)] leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
