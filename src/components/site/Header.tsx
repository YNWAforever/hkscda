import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Link } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { PawPrint, Heart, Menu, X, ChevronDown, Users, BookOpen, BarChart3, FileText } from 'lucide-react'

const aboutLinks = [
  { to: '/about', label: '協會簡介', desc: '了解我們的使命與歷史' },
  { to: '/about/cccp', label: 'CCCP計劃', desc: '社區貓隻照顧計劃' },
  { to: '/about/tnr', label: 'TNR計劃', desc: '捕捉絕育放回行動' },
  { to: '/about/team', label: '團隊', desc: '董事會及核心義工' },
  { to: '/about/privacy', label: '私隱聲明', desc: '個人資料收集政策' },
]

const adoptLinks = [
  { to: '/adoption/instructions', label: '領養需知', desc: '申請流程及飼養指引' },
  { to: '/animals/cat', label: '待領養貓貓', desc: '目前等待家園的貓咪' },
  { to: '/animals/dog', label: '待領養狗狗', desc: '目前等待家園的狗狗' },
]

const reportLinks = [
  { to: '/report/adoption', label: '每月領養報告', desc: '領養數據及趨勢分析' },
  { to: '/report/audit', label: '年度核數報告', desc: '財務透明度及審計' },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let ticking = false
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <style>{`
        @keyframes navItemSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mobileSlideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 800px; }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .nav-item-enter { animation: navItemSlideIn 0.3s ease-out both; }
        .mobile-enter { animation: mobileSlideDown 0.3s ease-out; overflow: hidden; }
        .shimmer-surface {
          background: linear-gradient(120deg, transparent 25%, rgba(255,255,255,0.15) 50%, transparent 75%);
          background-size: 200% 100%;
        }
      `}</style>

      <header
        ref={headerRef}
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md shadow-[0_1px_3px_rgba(42,31,20,0.06)]'
            : 'border-b border-transparent bg-[var(--color-surface)]/90 backdrop-blur-sm'
        }`}
      >
        <div className="container-wide flex h-[70px] items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0 group">
            <div className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[var(--color-primary)] shadow-[0_2px_8px_rgba(192,74,42,0.25)] transition-shadow group-hover:shadow-[0_4px_16px_rgba(192,74,42,0.35)]">
              <PawPrint className="h-[22px] w-[22px] text-white transition-transform duration-300 group-hover:scale-110" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-[13px] font-bold text-[var(--color-primary)] tracking-tight">
                香港拯救貓狗協會
              </span>
              <span className="text-[10px] text-[var(--color-text-faint)] font-medium tracking-wide uppercase">
                HKSCDA · since 2007
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <NavigationMenu.Root className="ml-auto hidden lg:flex relative" delayDuration={100}>
            <NavigationMenu.List className="flex items-center">

              <NavLink to="/">主頁</NavLink>

              <NavDropdown trigger="關於協會" links={aboutLinks} />
              <NavDropdown trigger="領養" links={adoptLinks} />

              <NavLink to="/sponsors">助養區</NavLink>

              <NavDropdown trigger="透明度" links={reportLinks} />

              <NavigationMenu.Item>
                <NavigationMenu.Link asChild>
                  <Link
                    to="/volunteer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)]/70 transition-all duration-200"
                  >
                    <Users className="h-3.5 w-3.5" aria-hidden="true" /> 加入義工
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>

              <NavigationMenu.Item className="ml-3">
                <NavigationMenu.Link asChild>
                  <Link
                    to="/donate"
                    className="group/donate relative inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--color-primary)] text-white text-[13px] font-bold shadow-[0_2px_8px_rgba(192,74,42,0.3)] hover:shadow-[0_4px_16px_rgba(192,74,42,0.4)] hover:bg-[var(--color-primary-hover)] hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 overflow-hidden"
                  >
                    <span className="shimmer-surface absolute inset-0 animate-[shimmer_3s_ease-in-out_infinite] pointer-events-none" />
                    <Heart className="relative h-4 w-4 transition-transform duration-300 group-hover/donate:scale-110" fill="currentColor" aria-hidden="true" /> 立即捐助
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>

            </NavigationMenu.List>
          </NavigationMenu.Root>

          {/* Mobile hamburger */}
          <button
            aria-label={mobileOpen ? '關閉選單' : '開啟選單'}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="ml-auto lg:hidden relative h-11 w-11 flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-offset)] hover:border-[var(--color-primary)]/30 transition-all duration-200"
          >
            <span className={`absolute transition-all duration-300 ${mobileOpen ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`}>
              <Menu className="h-5 w-5" />
            </span>
            <span className={`absolute transition-all duration-300 ${mobileOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`}>
              <X className="h-5 w-5" />
            </span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden mobile-enter border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="px-5 py-5 space-y-1 max-h-[calc(100vh-80px)] overflow-y-auto">
              <MobileSheetLink to="/" setOpen={setMobileOpen}>主頁</MobileSheetLink>

              <MobileSheetSection title="關於協會" links={aboutLinks} setOpen={setMobileOpen} />
              <MobileSheetSection title="領養" links={adoptLinks} setOpen={setMobileOpen} />

              <MobileSheetLink to="/sponsors" setOpen={setMobileOpen}>助養區</MobileSheetLink>

              <MobileSheetSection title="透明度" links={reportLinks} setOpen={setMobileOpen} />

              <MobileSheetLink to="/volunteer" setOpen={setMobileOpen}>
                <Users className="h-4 w-4" aria-hidden="true" /> 加入義工
              </MobileSheetLink>

              <div className="pt-3">
                <Link
                  to="/donate"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-full bg-[var(--color-primary)] text-white font-bold text-[15px] shadow-lg hover:bg-[var(--color-primary-hover)] transition-colors"
                >
                  <Heart className="h-4 w-4" fill="currentColor" aria-hidden="true" /> 立即捐助
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Link asChild>
        <Link
          to={to}
          className="relative px-3.5 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors duration-200 group/nav"
        >
          {children}
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 rounded-full bg-[var(--color-primary)] transition-all duration-300 group-hover/nav:w-4/5" />
        </Link>
      </NavigationMenu.Link>
    </NavigationMenu.Item>
  )
}

function NavDropdown({ trigger, links }: { trigger: string; links: { to: string; label: string; desc: string }[] }) {
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Trigger className="group/trigger relative px-3.5 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors duration-200 flex items-center gap-1 select-none">
        {trigger} <ChevronDown className="h-3 w-3 opacity-50 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-0 rounded-full bg-[var(--color-primary)] transition-all duration-300 group-hover/trigger:w-4/5" />
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute top-full left-0 mt-2 w-[260px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-[0_12px_40px_rgba(42,31,20,0.12)] p-2 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
        {links.map((link, i) => (
          <NavigationMenu.Link key={link.to} asChild>
            <Link
              to={link.to}
              className="block px-4 py-3 rounded-xl hover:bg-[var(--color-primary-highlight)]/50 transition-colors duration-150 nav-item-enter"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="text-[13px] font-bold text-[var(--color-text)]">{link.label}</div>
              <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-tight">{link.desc}</div>
            </Link>
          </NavigationMenu.Link>
        ))}
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  )
}

function MobileSheetSection({ title, links, setOpen }: { title: string; links: { to: string; label: string; desc: string }[]; setOpen: (v: boolean) => void }) {
  return (
    <>
      <div className="px-4 pt-5 pb-2 text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-[0.12em]">{title}</div>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          onClick={() => setOpen(false)}
          className="flex items-start gap-3 px-4 py-3 rounded-xl hover:bg-[var(--color-primary-highlight)]/40 transition-colors duration-150"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-medium text-[var(--color-text)]">{link.label}</div>
            <div className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{link.desc}</div>
          </div>
        </Link>
      ))}
    </>
  )
}

function MobileSheetLink({ to, setOpen, children }: { to: string; setOpen: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      onClick={() => setOpen(false)}
      className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-[15px] font-medium text-[var(--color-text)] hover:bg-[var(--color-primary-highlight)]/40 transition-colors duration-150"
    >
      {children}
    </Link>
  )
}
