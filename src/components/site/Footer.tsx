export function Footer() {
  return (
    <footer
      id="contact"
      className="bg-[#2a1f14] text-[var(--color-text-inverse)] px-6 py-16"
    >
      <div className="container-wide grid md:grid-cols-3 gap-10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-xl">
              🐾
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
          <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider">
            聯絡我們
          </h4>
          <ul className="space-y-2 text-sm text-white/80">
            <li>📧 info@hkscda.com</li>
            <li>📱 WhatsApp / FPS: 9864 1089</li>
            <li>🆔 慈善牌照：91/14493</li>
            <li>🏛️ 漁農署 ORG-00041</li>
            <li>🧾 IRD §88 免稅機構</li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-4 uppercase tracking-wider">
            追蹤我們
          </h4>
          <div className="flex gap-3 mb-4">
            <a
              href="https://www.facebook.com/HKSCDA"
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Facebook"
            >
              📘
            </a>
            <a
              href="https://www.instagram.com/hkscda/"
              target="_blank"
              rel="noopener noreferrer"
              className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Instagram"
            >
              📸
            </a>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            每月25日前提交退稅收條申請，正式收條於次月中發出。
          </p>
        </div>
      </div>
      <div className="container-wide mt-12 pt-6 border-t border-white/10 text-xs text-white/50 flex flex-wrap gap-3 justify-between">
        <span>© 2007–{new Date().getFullYear()} HK Saving Cat And Dog Association Limited</span>
        <span>支持領養 · 拯救生命</span>
      </div>
    </footer>
  );
}
