import * as NavigationMenu from '@radix-ui/react-navigation-menu'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PawPrint, Heart, Menu, X, ChevronDown, Users } from 'lucide-react'

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur">
      <div className="container-wide flex h-[68px] items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)]">
            <PawPrint className="h-5 w-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm font-bold text-[var(--color-primary)]">
              香港拯救貓狗協會
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
              HKSCDA · since 2007
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <NavigationMenu.Root className="ml-auto hidden lg:flex relative">
          <NavigationMenu.List className="flex items-center gap-1">

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/"
                  className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
                >
                  主頁
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Trigger className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors flex items-center gap-1 select-none">
                關於協會 <ChevronDown className="h-3 w-3 opacity-60" />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="absolute top-full left-0 mt-2 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1.5 z-50">
                {[
                  { to: '/about', label: '協會簡介' },
                  { to: '/about/cccp', label: 'CCCP計劃' },
                  { to: '/about/tnr', label: 'TNR計劃' },
                  { to: '/about/team', label: '團隊' },
                  { to: '/about/privacy', label: '私隱聲明' },
                ].map(({ to, label }) => (
                  <NavigationMenu.Link key={to} asChild>
                    <Link
                      to={to}
                      className="block px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]"
                    >
                      {label}
                    </Link>
                  </NavigationMenu.Link>
                ))}
              </NavigationMenu.Content>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Trigger className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors flex items-center gap-1 select-none">
                領養 <ChevronDown className="h-3 w-3 opacity-60" />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="absolute top-full left-0 mt-2 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1.5 z-50">
                {[
                  { to: '/adoption/instructions', label: '領養需知' },
                  { to: '/animals/cat', label: '待領養貓貓' },
                  { to: '/animals/dog', label: '待領養狗狗' },
                ].map(({ to, label }) => (
                  <NavigationMenu.Link key={to} asChild>
                    <Link
                      to={to}
                      className="block px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]"
                    >
                      {label}
                    </Link>
                  </NavigationMenu.Link>
                ))}
              </NavigationMenu.Content>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/sponsors"
                  className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
                >
                  助養區
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Trigger className="px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors flex items-center gap-1 select-none">
                透明度 <ChevronDown className="h-3 w-3 opacity-60" />
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="absolute top-full left-0 mt-2 w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg py-1.5 z-50">
                {[
                  { to: '/report/adoption', label: '每月領養報告' },
                  { to: '/report/audit', label: '年度核數報告' },
                ].map(({ to, label }) => (
                  <NavigationMenu.Link key={to} asChild>
                    <Link
                      to={to}
                      className="block px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]"
                    >
                      {label}
                    </Link>
                  </NavigationMenu.Link>
                ))}
              </NavigationMenu.Content>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/volunteer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-highlight)] transition-colors"
                >
                  <Users className="h-3.5 w-3.5" /> 加入義工
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

            <NavigationMenu.Item>
              <NavigationMenu.Link asChild>
                <Link
                  to="/donate"
                  className="ml-2 inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[var(--color-primary)] text-white text-sm font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
                >
                  <Heart className="h-4 w-4" fill="currentColor" /> 立即捐助
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>

          </NavigationMenu.List>
          <NavigationMenu.Viewport />
        </NavigationMenu.Root>

        {/* Mobile hamburger */}
        <button
          aria-label={mobileOpen ? '關閉選單' : '開啟選單'}
          onClick={() => setMobileOpen(!mobileOpen)}
          className="ml-auto lg:hidden h-10 w-10 flex items-center justify-center rounded-md hover:bg-[var(--color-surface-offset)] transition-colors"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
          <ul className="flex flex-col gap-1">
            <li>
              <Link to="/" onClick={() => setMobileOpen(false)} className="block px-4 py-3 rounded-lg text-base font-medium hover:bg-[var(--color-surface-offset)]">
                主頁
              </Link>
            </li>
            <li className="px-4 pt-3 pb-1 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">關於協會</li>
            {[
              { to: '/about', label: '協會簡介' },
              { to: '/about/cccp', label: 'CCCP計劃' },
              { to: '/about/tnr', label: 'TNR計劃' },
              { to: '/about/team', label: '團隊' },
              { to: '/about/privacy', label: '私隱聲明' },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to} onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-lg text-sm pl-8 hover:bg-[var(--color-surface-offset)]">
                  {label}
                </Link>
              </li>
            ))}
            <li className="px-4 pt-3 pb-1 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">領養</li>
            {[
              { to: '/adoption/instructions', label: '領養需知' },
              { to: '/animals/cat', label: '待領養貓貓' },
              { to: '/animals/dog', label: '待領養狗狗' },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to} onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-lg text-sm pl-8 hover:bg-[var(--color-surface-offset)]">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/sponsors" onClick={() => setMobileOpen(false)} className="block px-4 py-3 rounded-lg text-base font-medium hover:bg-[var(--color-surface-offset)]">
                助養區
              </Link>
            </li>
            <li className="px-4 pt-3 pb-1 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">透明度</li>
            {[
              { to: '/report/adoption', label: '每月領養報告' },
              { to: '/report/audit', label: '年度核數報告' },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to} onClick={() => setMobileOpen(false)} className="block px-4 py-2.5 rounded-lg text-sm pl-8 hover:bg-[var(--color-surface-offset)]">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/volunteer" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-4 py-3 rounded-lg text-base font-medium hover:bg-[var(--color-surface-offset)]">
                <Users className="h-4 w-4" /> 加入義工
              </Link>
            </li>
            <li>
              <Link
                to="/donate"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-1.5 mt-2 px-4 py-3 rounded-full bg-[var(--color-primary)] text-white text-center font-bold"
              >
                <Heart className="h-4 w-4" fill="currentColor" /> 立即捐助
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  )
}
