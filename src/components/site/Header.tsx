import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { brand } from "../../lib/brand/brand";
import { findCurrentNavigation, navGroups } from "./navigation";

const DESKTOP_QUERY = "(min-width: 1120px)";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="menu-chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function Header() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentNavigation = findCurrentNavigation(pathname);
  const currentGroupIndex = currentNavigation?.groupIndex ?? -1;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopMenu, setDesktopMenu] = useState<number | null>(null);
  const [mobileGroup, setMobileGroup] = useState(currentGroupIndex >= 0 ? currentGroupIndex : 0);

  const brandRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const desktopTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Crossing the desktop breakpoint tears down whichever menu belongs to the
  // other layout, and carries focus with it so it never lands on a hidden node.
  useEffect(() => {
    const desktopViewport = window.matchMedia(DESKTOP_QUERY);

    function handleViewportChange(event: MediaQueryListEvent) {
      const activeElement = document.activeElement;
      if (event.matches) {
        const focusNeedsTransfer =
          activeElement === triggerRef.current ||
          Boolean(drawerRef.current?.contains(activeElement));
        setDrawerOpen(false);
        if (focusNeedsTransfer) {
          requestAnimationFrame(() => {
            (desktopTriggerRefs.current[currentGroupIndex] ?? brandRef.current)?.focus();
          });
        }
      } else {
        const focusNeedsTransfer = Boolean(desktopNavRef.current?.contains(activeElement));
        setDesktopMenu(null);
        if (focusNeedsTransfer) requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    desktopViewport.addEventListener("change", handleViewportChange);
    return () => desktopViewport.removeEventListener("change", handleViewportChange);
  }, [currentGroupIndex]);

  // Desktop popover: dismiss on outside pointer or Escape, returning focus to
  // the trigger that opened it.
  useEffect(() => {
    if (desktopMenu === null) return;

    function handlePointerDown(event: PointerEvent) {
      if (!desktopNavRef.current?.contains(event.target as Node)) setDesktopMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeIndex = desktopMenu;
      setDesktopMenu(null);
      if (activeIndex !== null) desktopTriggerRefs.current[activeIndex]?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopMenu]);

  // Mobile drawer: lock scroll without shifting layout, make the background
  // inert to assistive tech, trap Tab, and restore focus on close.
  useEffect(() => {
    if (!drawerOpen) return;

    const drawer = drawerRef.current;
    const trigger = triggerRef.current;
    const background = document.querySelectorAll<HTMLElement>(
      ".site-header, [data-site-content], [data-site-footer]",
    );
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    background.forEach((element) => element.setAttribute("inert", ""));

    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusable()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      background.forEach((element) => element.removeAttribute("inert"));
      if (!window.matchMedia(DESKTOP_QUERY).matches) trigger?.focus();
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="site-header">
        <div className="header-shell">
          <Link ref={brandRef} className="brand-lockup" to="/" aria-label={`${brand.nameZh}首頁`}>
            <BrandLogo eager />
            <span>
              <strong>{brand.nameZh}</strong>
              <small>{brand.acronym}</small>
            </span>
          </Link>

          <nav
            ref={desktopNavRef}
            className="desktop-nav"
            aria-label="主要選單"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDesktopMenu(null);
              }
            }}
          >
            {navGroups.map((group, index) => {
              const expanded = desktopMenu === index;
              const groupIsCurrent = currentGroupIndex === index;
              return (
                <div
                  key={group.label}
                  className={`nav-group${expanded ? " is-open" : ""}${groupIsCurrent ? " is-current" : ""}`}
                >
                  <button
                    ref={(element) => {
                      desktopTriggerRefs.current[index] = element;
                    }}
                    className="nav-group-trigger"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`desktop-menu-${index}`}
                    onFocus={() => {
                      if (desktopMenu !== null && desktopMenu !== index) setDesktopMenu(null);
                    }}
                    onClick={() => setDesktopMenu(expanded ? null : index)}
                  >
                    {group.label}
                    <ChevronIcon />
                  </button>
                  {expanded ? (
                    <div
                      id={`desktop-menu-${index}`}
                      className={`nav-popover${index >= navGroups.length - 2 ? " nav-popover-end" : ""}`}
                      aria-label={`${group.label}子選單`}
                    >
                      {group.items.map((item) => (
                        <Link
                          key={item.to}
                          to={item.to}
                          aria-current={
                            groupIsCurrent && currentNavigation?.to === item.to ? "page" : undefined
                          }
                          onClick={() => setDesktopMenu(null)}
                        >
                          <span>{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="header-actions">
            {/* Adoption leads, donation follows: the association's positioning is
                adopt-don't-buy, so the listing CTA precedes the donate CTA. */}
            <Link className="button button-primary desktop-adopt" to="/animals/cat">
              查看待領養動物
            </Link>
            <Link className="button button-accent desktop-donate" to="/donate">
              立即捐助
            </Link>
            <button
              ref={triggerRef}
              className="menu-trigger"
              type="button"
              aria-expanded={drawerOpen}
              aria-controls="mobile-drawer"
              aria-label={drawerOpen ? "關閉選單" : "開啟選單"}
              onClick={() => {
                setDesktopMenu(null);
                const nextOpen = !drawerOpen;
                if (nextOpen) setMobileGroup(currentGroupIndex >= 0 ? currentGroupIndex : 0);
                setDrawerOpen(nextOpen);
              }}
            >
              <MenuIcon open={drawerOpen} />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen ? (
        <div className="drawer-layer">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="關閉選單"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            id="mobile-drawer"
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
          >
            <div className="drawer-topline">
              <div>
                <strong id="drawer-title">網站選單</strong>
                <small>{brand.nameZh}</small>
              </div>
              <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
                <MenuIcon open />
                <span className="sr-only">關閉選單</span>
              </button>
            </div>
            <nav className="drawer-nav" aria-label="流動版主要選單">
              <Link
                className="drawer-home"
                to="/"
                aria-current={pathname === "/" ? "page" : undefined}
                onClick={() => setDrawerOpen(false)}
              >
                <span>首頁</span>
                <span aria-hidden="true">→</span>
              </Link>
              {navGroups.map((group, index) => {
                const expanded = mobileGroup === index;
                const groupIsCurrent = currentGroupIndex === index;
                return (
                  <div
                    key={group.label}
                    className={`drawer-group${groupIsCurrent ? " is-current" : ""}`}
                  >
                    <button
                      className="drawer-group-trigger"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`mobile-menu-${index}`}
                      onClick={() => setMobileGroup(expanded ? -1 : index)}
                    >
                      <span>{group.label}</span>
                      <ChevronIcon />
                    </button>
                    {expanded ? (
                      <div id={`mobile-menu-${index}`} className="drawer-submenu">
                        {group.items.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            aria-current={
                              groupIsCurrent && currentNavigation?.to === item.to
                                ? "page"
                                : undefined
                            }
                            onClick={() => setDrawerOpen(false)}
                          >
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <div className="drawer-footer">
              <Link className="button button-primary drawer-adopt" to="/animals/cat">
                查看待領養動物
              </Link>
              <Link className="button button-accent drawer-donate" to="/donate">
                立即捐助
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
