import { PawPrint, Mail, Smartphone, BadgeCheck, Building2, ReceiptText } from 'lucide-react'

export function Footer() {
  return (
    <footer
      id="contact"
      className="bg-[var(--color-footer-bg)] text-[var(--color-text-inverse)] px-6 pt-16"
    >
      <div className="container-wide grid md:grid-cols-4 gap-10">
        <div className="rounded-3xl bg-[var(--color-panel-2)] p-6 -mt-2 self-start">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
              <PawPrint className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold">香港拯救貓狗協會</div>
              <div className="text-xs text-white/60">HKSCDA · since 2007</div>
            </div>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            「支持領養等於拯救生命」— 為流浪貓狗提供糧食、醫療、絕育及領養服務的「不殺」機構。
          </p>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider text-[var(--color-accent-warm)]">
            聯絡我們
          </h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 opacity-70" /> info@hkscda.com</li>
            <li className="flex items-center gap-2"><Smartphone className="h-4 w-4 opacity-70" /> WhatsApp / FPS: 9864 1089</li>
            <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 opacity-70" /> 慈善牌照：91/14493</li>
            <li className="flex items-center gap-2"><Building2 className="h-4 w-4 opacity-70" /> 漁農署 ORG-00041</li>
            <li className="flex items-center gap-2"><ReceiptText className="h-4 w-4 opacity-70" /> IRD §88 免稅機構</li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider text-[var(--color-accent-warm)]">
            追蹤我們
          </h4>
          <div className="flex gap-3 mb-4">
            <a
              href="https://www.facebook.com/HKSCDA"
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 w-10 rounded-full bg-[var(--color-accent-warm)] text-[var(--color-panel)] hover:bg-[var(--color-cta-hover)] flex items-center justify-center transition-colors"
              aria-label="Facebook 專頁"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/hkscda/"
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 w-10 rounded-full bg-[var(--color-accent-warm)] text-[var(--color-panel)] hover:bg-[var(--color-cta-hover)] flex items-center justify-center transition-colors"
              aria-label="Instagram 專頁"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
              </svg>
            </a>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            每月25日前提交退稅收條申請，正式收條於次月中發出。
          </p>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider text-[var(--color-accent-warm)]">
            透明度
          </h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li><a href="/report/adoption" className="hover:text-white transition-colors">每月領養報告</a></li>
            <li><a href="/report/audit" className="hover:text-white transition-colors">年度核數報告</a></li>
            <li><a href="/donate" className="hover:text-white transition-colors">捐助我們</a></li>
            <li><a href="/volunteer" className="hover:text-white transition-colors">加入義工團隊</a></li>
          </ul>
        </div>
      </div>
      <div className="container-wide mt-12 pb-8 text-xs text-white/50 flex flex-wrap gap-3 justify-between">
        <span>© 2007–{new Date().getFullYear()} HK Saving Cat And Dog Association Limited</span>
        <span>支持領養 · 拯救生命</span>
      </div>
      <div className="-mx-6 bg-[var(--color-pink-strip)] text-[var(--color-panel)] text-xs font-bold text-center py-3 px-6">
        支持領養等於拯救生命 🐾 HKSCDA
      </div>
    </footer>
  );
}
