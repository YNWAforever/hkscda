import { useState } from "react";

const links = [
  { href: "#adoption", label: "領養" },
  { href: "#about", label: "關於協會" },
  { href: "#programs", label: "服務計劃" },
  { href: "#stories", label: "義工故事" },
  { href: "#social", label: "社群" },
  { href: "#contact", label: "聯絡我們" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
      <div className="container-wide flex h-[68px] items-center gap-4">
        <a href="#top" className="flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-2xl">
            🐾
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm font-bold text-[var(--color-primary)]">
              香港拯救貓狗協會
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
              HKSCDA · since 2007
            </span>
          </div>
        </a>
        <nav className="ml-auto hidden lg:flex items-center gap-1">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#donate"
            className="ml-2 px-5 py-2 rounded-full bg-[var(--color-primary)] text-white text-sm font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            💛 立即捐助
          </a>
        </nav>
        <button
          aria-label="Menu"
          onClick={() => setOpen(!open)}
          className="ml-auto lg:hidden h-10 w-10 flex items-center justify-center rounded-md"
        >
          <span className="text-2xl">{open ? "✕" : "☰"}</span>
        </button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 rounded-lg text-base font-medium hover:bg-[var(--color-surface-offset)]"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#donate"
                onClick={() => setOpen(false)}
                className="block mt-2 px-4 py-3 rounded-full bg-[var(--color-primary)] text-white text-center font-bold"
              >
                💛 立即捐助
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
