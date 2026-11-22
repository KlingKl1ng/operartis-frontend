import { memo, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import operartisLogo from '../icononly_transparent_quadratic.png';
import operartisWatermark from '../fulllogo_transparent_nobuffer.png';

/** operartis-auth-ui.js mounts the account button here; it must never re-render. */
const AuthSlot = memo(function AuthSlot() {
  return <div id="operartis-auth-topbar-slot" className="ops-auth-slot" />;
});

export interface AppShellLabels {
  expandSidebar: string;
  collapseSidebar: string;
  openMenu: string;
  closeMenu: string;
  footerTitle: string;
  footerTagline: string;
}

/**
 * The frame every module shares: a collapsible sidebar on the left (a narrow
 * icon rail when collapsed, a slide-in panel on phones), a header with the
 * module title and the account button, and the working area.
 */
export function AppShell({
  title,
  labels,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
  sidebar,
  sidebarFooter,
  rail,
  headerActions,
  belowHeader,
  children,
}: {
  title: string;
  labels: AppShellLabels;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  /** Sidebar content when expanded. */
  sidebar: ReactNode;
  /** Pinned above the brand footer, for the main action buttons. */
  sidebarFooter?: ReactNode;
  /** Icon buttons shown when the sidebar is collapsed. */
  rail?: ReactNode;
  headerActions?: ReactNode;
  /** Status and KPI bars that stay under the header. */
  belowHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ops-app">
      {mobileOpen && <button className="ops-sidebar-backdrop" type="button" aria-label={labels.closeMenu} onClick={() => onMobileOpenChange(false)} />}
      <div className={`ops-sidebar-shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
        <button
          className="ops-sidebar-toggle"
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
          title={collapsed ? labels.expandSidebar : labels.collapseSidebar}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <aside className="ops-sidebar">
          <div className="ops-brand-header">
            <a className="ops-brand" href="/" aria-label="Operartis">
              <img src={operartisLogo} alt="" />
              <span>OPERARTIS</span>
            </a>
            <button className="ops-icon-button ops-mobile-only" type="button" onClick={() => onMobileOpenChange(false)} aria-label={labels.closeMenu}>
              <X size={18} />
            </button>
          </div>
          {collapsed ? (
            <div className="ops-rail">{rail}</div>
          ) : (
            <>
              <div className="ops-sidebar-scroll ops-scroller">{sidebar}</div>
              {sidebarFooter && <div className="ops-sidebar-actions">{sidebarFooter}</div>}
              <div className="ops-sidebar-brand-footer">
                <strong>{labels.footerTitle}</strong>
                <em>{labels.footerTagline}</em>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="ops-main-shell">
        <header className="ops-header">
          <button className="ops-icon-button ops-mobile-only" type="button" onClick={() => onMobileOpenChange(true)} aria-label={labels.openMenu}>
            <Menu size={18} />
          </button>
          <h1 className="ops-module-title">{title}</h1>
          <div className="ops-header-actions">
            {headerActions}
            <AuthSlot />
          </div>
        </header>
        {belowHeader}
        <main className="ops-main ops-scroller">{children}</main>
      </div>
    </div>
  );
}

/** The faint logo shown while a module has nothing loaded. */
export function EmptyWatermark() {
  return (
    <div className="ops-empty">
      <img src={operartisWatermark} alt="" />
    </div>
  );
}
