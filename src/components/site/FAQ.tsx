import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getFaqText, helpFaqs } from "@/lib/help/faq";
import { MessageCircleQuestion } from "lucide-react";
import dog1 from "@/assets/dog1.jpg";
import { Reveal } from "@/lib/reveal";

const homepageFaqs = helpFaqs.slice(0, 5);
const language = "zh-HK" as const;

export function FAQ() {
  return (
    <section
      className="px-6 py-16 lg:py-24 bg-[var(--color-surface-offset)]"
      aria-labelledby="faq-h"
    >
      <div className="container-wide grid lg:grid-cols-5 gap-10 lg:gap-14 items-start">
        <Reveal className="lg:col-span-2">
          <h2
            id="faq-h"
            className="font-display text-3xl lg:text-4xl font-bold text-[var(--color-panel)] mb-4 leading-tight"
          >
            常見問題
            <br />
            助養、領養與收據
          </h2>
          <p className="text-[var(--color-text-muted)] mb-8 max-w-[40ch]">
            如果找不到合適答案，可 WhatsApp 9864 1089 或電郵 info@hkscda.com 聯絡職員。
          </p>
          <div className="relative hidden lg:block">
            <div
              className="absolute inset-3 rounded-md -rotate-3 bg-[var(--color-secondary-highlight)]"
              aria-hidden="true"
            />
            <img
              src={dog1}
              alt="等待領養的狗狗"
              loading="lazy"
              className="relative rounded-md w-full aspect-[4/3] object-cover shadow-soft"
            />
          </div>
        </Reveal>

        <Reveal className="lg:col-span-3">
          <div className="rounded-[2rem] bg-[var(--color-panel)] text-white px-6 py-4 mb-4 font-display font-bold flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-[var(--color-secondary)]" />
            Frequently Asked Questions
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {homepageFaqs.map((faq, i) => {
              const faqText = getFaqText(faq, language);

              return (
                <AccordionItem
                  key={faq.id}
                  value={`faq-${i}`}
                  className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] px-5 data-[state=open]:shadow-md transition-shadow"
                >
                  <AccordionTrigger className="font-bold text-[var(--color-panel)] hover:no-underline py-4.5">
                    {faqText.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[var(--color-text-muted)] leading-relaxed">
                    {faqText.answer}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
