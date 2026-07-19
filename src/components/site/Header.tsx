import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronDown,
  Facebook,
  Heart,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Phone,
  Users,
  X,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { reportLinks } from "./reportNavigation";

const aboutLinks = [
  { to: "/about", label: "協會簡介", desc: "了解我們的使命與歷史" },
  { to: "/about/cccp", label: "CCCP計劃", desc: "社區貓隻照顧計劃" },
  { to: "/about/tnr", label: "TNR計劃", desc: "捕捉絕育放回行動" },
  { to: "/about/team", label: "團隊", desc: "董事會及核心義工" },
  { to: "/about/privacy", label: "私隱聲明", desc: "個人資料收集政策" },
];

const adoptLinks = [
  { to: "/adoption/instructions", label: "領養需知", desc: "申請流程及飼養指引" },
  { to: "/animals/cat", label: "待領養貓貓", desc: "目前等待家園的貓咪" },
  { to: "/animals/dog", label: "待領養狗狗", desc: "目前等待家園的狗狗" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="bg-[var(--color-panel)] text-[12px] text-white/85">
        <div className="container-wide flex h-9 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <a href="tel:+85298641089" className="hidden items-center gap-1.5 hover:text-white sm:flex">
              <Phone className="h-3 w-3" aria-hidden="true" /> 9864 1089
            </a>
            <a href="mailto:info@hkscda.com" className="flex min-w-0 items-center gap-1.5 truncate hover:text-white">
              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" /> info@hkscda.com
            </a>
            <span className="hidden items-center gap-1.5 text-white/60 lg:flex">
              <MapPin className="h-3 w-3" aria-hidden="true" /> 香港 · 服務全港十八區
            </span>
          </div>
          <div className="flex items-center gap-1">
            <a href="https://www.facebook.com/HKSCDA" target="_blank" rel="noreferrer" aria-label="Facebook" className="flex h-9 w-9 items-center justify-center hover:bg-white/10">
              <Facebook className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a href="https://www.instagram.com/hkscda/" target="_blank" rel="noreferrer" aria-label="Instagram" className="flex h-9 w-9 items-center justify-center hover:bg-white/10">
              <Instagram className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>

      <header className="relative z-50 border-b border-[var(--color-divider)] bg-[var(--color-surface)]">
        <div className="container-wide flex min-h-20 items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="香港拯救貓狗協會首頁" className="shrink-0">
            <BrandLogo className="h-12 sm:h-14" eager />
          </Link>

          <NavigationMenu.Root className="ml-auto hidden lg:flex" delayDuration={100}>
            <NavigationMenu.List className="flex items-center gap-1">
              <NavLink to="/">主頁</NavLink>
              <NavDropdown trigger="關於協會" links={aboutLinks} />
              <NavDropdown trigger="領養" links={adoptLinks} />
              <NavLink to="/sponsors">助養區</NavLink>
              <NavLink to="/stories">故事</NavLink>
              <NavDropdown trigger="透明度" links={reportLinks} />
              <NavigationMenu.Item>
                <NavigationMenu.Link asChild>
                  <Link to="/volunteer" className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" /> 加入義工
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>
              <NavigationMenu.Item className="ml-2">
                <NavigationMenu.Link asChild>
                  <Link to="/animals/cat" className="btn-primary min-h-11 px-4 text-[13px]">查看待領養動物</Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>
              <NavigationMenu.Item>
                <NavigationMenu.Link asChild>
                  <Link to="/donate" className="btn-secondary min-h-11 px-4 text-[13px]">
                    <Heart className="h-4 w-4" fill="currentColor" aria-hidden="true" /> 立即捐助
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>
            </NavigationMenu.List>
          </NavigationMenu.Root>

          <button
            type="button"
            aria-label={mobileOpen ? "關閉選單" : "開啟選單"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            className="ml-auto flex h-11 w-11 items-center justify-center border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-offset)] lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        {mobileOpen ? (
          <nav id="mobile-nav" aria-label="主選單" className="border-t border-[var(--color-divider)] bg-[var(--color-surface)] lg:hidden">
            <div className="container-wide max-h-[calc(100vh-80px)] space-y-1 overflow-y-auto px-4 py-5 sm:px-6">
              <MobileSheetLink to="/" setOpen={setMobileOpen}>主頁</MobileSheetLink>
              <MobileSheetSection title="關於協會" links={aboutLinks} setOpen={setMobileOpen} />
              <MobileSheetSection title="領養" links={adoptLinks} setOpen={setMobileOpen} />
              <MobileSheetLink to="/sponsors" setOpen={setMobileOpen}>助養區</MobileSheetLink>
              <MobileSheetLink to="/stories" setOpen={setMobileOpen}>故事</MobileSheetLink>
              <MobileSheetSection title="透明度" links={reportLinks} setOpen={setMobileOpen} />
              <MobileSheetLink to="/volunteer" setOpen={setMobileOpen}>
                <Users className="h-4 w-4" aria-hidden="true" /> 加入義工
              </MobileSheetLink>
              <div className="grid gap-2 pt-3 sm:grid-cols-2">
                <Link to="/animals/cat" onClick={() => setMobileOpen(false)} className="btn-primary min-h-11 w-full">
                  查看待領養動物
                </Link>
                <Link to="/donate" onClick={() => setMobileOpen(false)} className="btn-secondary min-h-11 w-full">
                  <Heart className="h-4 w-4" fill="currentColor" aria-hidden="true" /> 立即捐助
                </Link>
              </div>
            </div>
          </nav>
        ) : null}
      </header>
    </>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Link asChild>
        <Link to={to} className="inline-flex min-h-11 items-center px-3 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
          {children}
        </Link>
      </NavigationMenu.Link>
    </NavigationMenu.Item>
  );
}

function NavDropdown({
  trigger,
  links,
}: {
  trigger: string;
  links: { to: string; label: string; desc: string }[];
}) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Trigger className="group/trigger inline-flex min-h-11 items-center gap-1 px-3 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
        {trigger}
        <ChevronDown className="h-3 w-3 opacity-50 transition-transform group-data-[state=open]/trigger:rotate-180" aria-hidden="true" />
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute left-0 top-full z-50 mt-2 w-[260px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-soft">
        {links.map((link) => (
          <NavigationMenu.Link key={link.to} asChild>
            <Link to={link.to} className="block min-h-11 px-4 py-3 hover:bg-[var(--color-primary-highlight)]">
              <div className="text-[13px] font-bold text-[var(--color-text)]">{link.label}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-[var(--color-text-muted)]">{link.desc}</div>
            </Link>
          </NavigationMenu.Link>
        ))}
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}

function MobileSheetSection({
  title,
  links,
  setOpen,
}: {
  title: string;
  links: { to: string; label: string; desc: string }[];
  setOpen: (value: boolean) => void;
}) {
  return (
    <>
      <div className="px-4 pb-2 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{title}</div>
      {links.map((link) => (
        <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="flex min-h-11 items-start gap-3 px-4 py-3 hover:bg-[var(--color-primary-highlight)]">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-[var(--color-text)]">{link.label}</div>
            <div className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{link.desc}</div>
          </div>
        </Link>
      ))}
    </>
  );
}

function MobileSheetLink({
  to,
  setOpen,
  children,
}: {
  to: string;
  setOpen: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2.5 px-4 py-3 text-[15px] font-medium text-[var(--color-text)] hover:bg-[var(--color-primary-highlight)]">
      {children}
    </Link>
  );
}