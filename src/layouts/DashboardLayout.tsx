import { BarChart3, Bell, Briefcase, Calculator, ChevronDown, ChevronRight, Database, DollarSign, Factory, FileText, LayoutDashboard, LogOut, Menu, Monitor, Moon, PackageSearch, Search, Settings, ShoppingCart, Sun, Truck, UserCog, Users, Wallet, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SyncStatusIndicator } from '../components/common/SyncStatusIndicator';
import { useAuth } from "../contexts/AuthContext";
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { cn, } from "../lib/utils";
import { useERPStore } from "../store/useERPStore";
import { useSettingsStore } from "../store/useSettingsStore";

const NavAccordionItem: React.FC<{ item: any, onClose?: () => void }> = ({ item, onClose }) => {
  const location = useLocation();
  const isActive = item.subItems 
    ? item.subItems.some((sub: any) => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/'))
    : location.pathname === item.path;
    
  const [isOpen, setIsOpen] = useState(isActive);

  if (!item.subItems) {
    return (
      <NavLink
        to={item.path}
        onClick={onClose}
        className={({ isActive }) => cn(
          "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          isActive 
            ? "bg-primary/10 text-primary" 
            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        )}
      >
        <span className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full transition-all duration-200",
          location.pathname === item.path ? "bg-primary" : "bg-transparent"
        )} />
        <item.icon className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-200",
          location.pathname === item.path ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground"
        )} />
        {item.label}
        {item.badge != null && item.badge > 0 && (
          <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {item.badge}
          </span>
        )}
      </NavLink>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
          isActive 
            ? "text-primary font-semibold bg-primary/5" 
            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className={cn(
            "h-4 w-4 shrink-0 transition-colors duration-200",
            isActive ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground"
          )} />
          {item.label}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
        )}
      </button>
      
      {isOpen && (
        <div className="pl-9 pr-2 space-y-1 mt-1 pb-1">
          {item.subItems.map((sub: any) => (
            <NavLink
              key={sub.label}
              to={sub.path}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors duration-200",
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {sub.label}
              {sub.badge != null && sub.badge > 0 && (
                <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground/80">
                  {sub.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { materials, products, processingSends, vouchers, customers, suppliers, processors } = useERPStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const results = [
    ...customers.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).map(c => ({
      id: c.id, type: 'Customer', label: c.name, path: '/customers', icon: Users
    })),
    ...suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).map(s => ({
      id: s.id, type: 'Supplier', label: s.name, path: '/suppliers', icon: Truck
    })),
    ...processors.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => ({
      id: p.id, type: 'Processor', label: p.name, path: '/processors', icon: UserCog
    })),
    ...materials.filter(m => m.name.toLowerCase().includes(query.toLowerCase())).map(m => ({
      id: m.id, type: 'Material', label: m.name, path: '/materials', icon: PackageSearch
    })),
    ...products.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(p => ({
      id: p.id, type: 'Product', label: p.name, path: '/products', icon: PackageSearch
    })),
    ...processingSends.filter(s => s.remarks && s.remarks.toLowerCase().includes(query.toLowerCase())).map(s => ({
      id: s.id, type: 'Job Work', label: s.remarks, path: '/job-work', icon: Briefcase
    })),
    ...vouchers.filter(v => v.voucherNo.toLowerCase().includes(query.toLowerCase()) || v.narration?.toLowerCase().includes(query.toLowerCase())).map(v => ({
      id: v.id, type: 'Voucher', label: `${v.voucherNo} - ${v.narration || 'Voucher'}`, path: '/accounting/general-ledger', icon: Wallet
    }))
  ].slice(0, 10);

  const actions = [
    { label: "Go to Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Create Purchase Order", path: "/purchases", icon: ShoppingCart },
    { label: "Create Sales Invoice", path: "/sales", icon: ShoppingCart },
    { label: "View Reports", path: "/reports", icon: FileText }
  ].filter(a => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 sm:px-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsOpen(false)} />
      
      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-border/50">
          <Search className="h-5 w-5 text-muted-foreground/80" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for materials, ledger entries, or type a command..."
            className="w-full h-14 bg-transparent border-0 focus:ring-0 text-foreground placeholder:text-muted-foreground/80 px-4 text-lg"
          />
          <div className="text-xs font-semibold text-muted-foreground/80 border border-border rounded px-1.5 py-0.5">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-4">
          {query.length === 0 && (
            <div className="px-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-4">Quick Actions</h3>
              {actions.map((action, i) => (
                <button
                  key={`action-${i}`}
                  onClick={() => { navigate(action.path); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-foreground/80 transition-colors text-left"
                >
                  <div className="bg-card p-2 rounded-lg border border-border shadow-sm"><action.icon className="h-4 w-4 text-muted-foreground" /></div>
                  <span className="font-medium text-sm">{action.label}</span>
                </button>
              ))}
            </div>
          )}

          {query.length > 0 && results.length > 0 && (
            <div className="px-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-2">Search Results</h3>
              {results.map((result, i) => (
                <button
                  key={result.id + i}
                  onClick={() => { navigate(result.path); setIsOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                     <div className="bg-card p-2 rounded-lg border border-border shadow-sm"><result.icon className="h-4 w-4 text-muted-foreground group-hover:text-blue-500 transition-colors" /></div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{result.label}</span>
                      <span className="text-xs text-muted-foreground">{result.type}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {query.length > 0 && results.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No results found for "{query}". Try a different keyword.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { vouchers, materials } = useERPStore();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const alerts: any[] = [];
  materials.forEach(m => {
    if (m.stockPcs < 100) {
      alerts.push({
        id: `alert-${m.id}`,
        date: new Date().toISOString(),
        type: 'Alert',
        desc: `Low stock for ${m.name} (${m.stockPcs} PCS left)`,
        status: 'Warning'
      });
    }
  });

  const recentActivity = [
    ...alerts,
    ...vouchers.map(v => ({ id: v.id, date: v.date, type: 'Voucher', desc: `${v.voucherNo} - ${v.narration || v.type}`, status: v.status === 'Cancelled' ? 'Warning' : 'Completed' }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

  const unreadCount = recentActivity.filter(a => !readIds.has(a.id)).length;

  return (
    <div ref={wrapperRef} className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl shadow-xl border border-border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-muted/40">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={() => setReadIds(new Set(recentActivity.map(a => a.id)))}
                className="text-xs font-medium text-info hover:text-info"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {recentActivity.length > 0 ? (
              <div className="divide-y divide-border/50">
                {recentActivity.map(activity => (
                  <div 
                    key={activity.id}
                    onClick={() => {
                      const newRead = new Set(readIds);
                      newRead.add(activity.id);
                      setReadIds(newRead);
                    }}
                    className={cn(
                      "px-4 py-3 hover:bg-muted/40 cursor-pointer transition-colors flex gap-3",
                      !readIds.has(activity.id) && "bg-info/10"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 h-2 w-2 rounded-full shrink-0",
                      activity.type === 'Alert' ? 'bg-destructive' : 
                      !readIds.has(activity.id) ? 'bg-info' : 'bg-transparent'
                    )} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">{activity.type}</span>
                      <span className="text-xs text-muted-foreground leading-snug">{activity.desc}</span>
                      <span className="text-[10px] font-medium text-muted-foreground/80 mt-1">
                        {new Date(activity.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No recent activity
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardLayout() {
  const { user, profile, hasPermission, signOut } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { dashboardName, tagline, logo, profilePhoto, theme, setTheme } = useSettingsStore();

  // Live record counts for the nav badges (data-dense sidebar)
  const badgeCounts = {
    categories: useERPStore(s => s.categories.length),
    materials: useERPStore(s => s.materials.length),
    products: useERPStore(s => s.products.length),
    customers: useERPStore(s => s.customers.length),
    suppliers: useERPStore(s => s.suppliers.length),
    processors: useERPStore(s => s.processors.length),
    purchases: useERPStore(s => s.purchases.length),
    sales: useERPStore(s => s.sales.length),
  };
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Initialize realtime sync across master modules
  useRealtimeSync(['categories', 'materials', 'products', 'customers', 'suppliers', 'processors', 'purchases', 'sales']);

  const navGroups = [
    {
      title: "Overview",
      items: [
        { icon: LayoutDashboard, label: "Dashboard", path: "/", requiredModule: null },
        { icon: Monitor, label: "Live Monitor", path: "/monitor", requiredModule: null },
      ]
    },
    {
      title: "Master Data",
      items: [
        {
          icon: Database,
          label: "Master Data",
          path: "/master",
          requiredModule: "Master Data",
          subItems: [
            { label: "Categories", path: "/categories", badge: badgeCounts.categories },
            { label: "Raw Materials", path: "/materials", badge: badgeCounts.materials },
            { label: "Products", path: "/products", badge: badgeCounts.products },
            { label: "Customers", path: "/customers", badge: badgeCounts.customers },
            { label: "Suppliers", path: "/suppliers", badge: badgeCounts.suppliers },
            { label: "Processors", path: "/processors", badge: badgeCounts.processors }
          ]
        }
      ]
    },
    {
      title: "Operations",
      items: [
        { icon: ShoppingCart, label: "Purchases", path: "/purchases", requiredModule: "Purchases", badge: badgeCounts.purchases },
        { icon: Factory, label: "Processing", path: "/processing", requiredModule: "Processing" },
        { icon: DollarSign, label: "Sales", path: "/sales", requiredModule: "Sales", badge: badgeCounts.sales },
        { icon: Users, label: "Ledgers", path: "/ledgers", requiredModule: "Ledgers" },
      ]
    },
    {
      title: "Finance & Reports",
      items: [
        {
          icon: Calculator,
          label: "Accounting",
          path: "/accounting",
          requiredModule: "Accounting",
          subItems: [
            { label: "Chart of Accounts", path: "/accounting/chart-of-accounts" },
            { label: "Cash Payment Voucher", path: "/accounting/cash-payment" },
            { label: "Bank Payment Voucher", path: "/accounting/bank-payment" },
            { label: "Cash Receipt Voucher", path: "/accounting/cash-receipt" },
            { label: "Bank Receipt Voucher", path: "/accounting/bank-receipt" },
            { label: "Journal Voucher", path: "/accounting/journal-voucher" },
            { label: "Cash Book", path: "/accounting/cashbook" },
            { label: "General Ledger", path: "/accounting/general-ledger" },
            { label: "Trial Balance", path: "/accounting/trial-balance" },
            { label: "Profit & Loss", path: "/accounting/profit-loss" },
            { label: "Balance Sheet", path: "/accounting/balance-sheet" },
            { label: "Cash Flow", path: "/accounting/cash-flow" },
          ]
        },
        { icon: BarChart3, label: "Reports", path: "/reports", requiredModule: "Reports" },
      ]
    },
  ];

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-muted/40 font-sans selection:bg-muted-foreground/20">
      <CommandPalette />
      
      <div className="fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg lg:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            {logo ? (
              <img src={logo} alt="Logo" className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-8 bg-zinc-900 dark:bg-zinc-950 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">{dashboardName.substring(0, 3).toUpperCase()}</span>
              </div>
            )}
            {/* Brand name + tagline — both come from Settings → Dashboard Branding */}
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-bold text-lg tracking-tight text-foreground">{dashboardName}</span>
              {tagline && <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[240px]">{tagline}</span>}
            </div>
          </div>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <button 
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
            className="w-full flex items-center gap-2 h-10 px-4 bg-muted/50 hover:bg-muted border border-transparent hover:border-border rounded-lg text-sm text-muted-foreground transition-all"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search anything...</span>
            <kbd className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] font-medium text-muted-foreground/80 bg-card px-1.5 py-0.5 border border-border rounded">
              <span className="text-sm leading-none">⌘</span>K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <button 
            onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <NotificationBell />
          <div className="flex flex-col text-right mr-2 hidden sm:flex">
          <SyncStatusIndicator />
            <span className="text-sm font-semibold text-foreground">{profile?.name || user?.email || "User"}</span>
            <span className="text-xs text-muted-foreground">{profile?.roles?.name || 'User'}</span>
          </div>
          <div className="h-8 w-8 rounded-full bg-muted-foreground/20 border border-border overflow-hidden ml-2">
            {profilePhoto ? (
              <img src={profilePhoto} alt="User" className="h-full w-full object-cover" />
            ) : (
              <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=e4e4e7" alt="User" />
            )}
          </div>
          <button 
            onClick={signOut}
            className="p-2 ml-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={cn(
        "fixed top-16 left-0 bottom-0 w-64 bg-card border-r border-border overflow-y-auto z-30 transition-transform duration-300 ease-in-out lg:translate-x-0 scrollbar-hide",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <nav className="p-4 space-y-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {idx > 0 && <div className="h-px bg-border/60 my-3" />}
              <h4 className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-2">
                {group.title}
              </h4>
              {group.items.filter(item => !item.requiredModule || hasPermission(item.requiredModule, 'View')).map((item) => (
                <NavAccordionItem key={item.label} item={item} onClose={() => setIsMobileMenuOpen(false)} />
              ))}
            </div>
          ))}
        </nav>
        
        <div className="p-4 mt-auto border-t border-border/50">
          <NavLink
            to="/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0 transition-colors duration-200" />
            Settings
          </NavLink>
        </div>
      </aside>

      <main className={cn(
        "pt-16 min-h-screen transition-all duration-300",
        "lg:pl-64"
      )}>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
