import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Factory, 
  PackageSearch, 
  Users, 
  Settings,
  BookText,
  ShoppingCart,
  Banknote,
  LineChart,
  X,
  Database,
  ChevronDown,
  Box,
  ChevronRight,
  Calculator
} from "lucide-react";
import { cn } from "../lib/utils";
import { useSettingsStore } from "../store/useSettingsStore";

type NavItem = {
  name: string;
  href?: string;
  icon?: React.ElementType;
  subItems?: { name: string; href: string }[];
};

const navigationGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Main",
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    ]
  },
  {
    title: "Operations",
    items: [
      {
        name: 'Masters',
        icon: Database,
        subItems: [
          { name: 'Customers', href: '/customers' },
          { name: 'Suppliers', href: '/suppliers' },
          { name: 'Processors', href: '/processors' },
          { name: 'Raw Materials', href: '/materials' },
          { name: 'Categories', href: '/categories' },
          { name: 'Products', href: '/products' },
        ]
      },
      {
        name: 'Purchases',
        icon: ShoppingCart,
        subItems: [
          { name: 'Purchase Orders', href: '/purchases' }, // For now mapping to purchases
        ]
      },
      {
        name: 'Processing',
        icon: Factory,
        subItems: [
          { name: 'Job Work', href: '/job-work' },
        ]
      },
      {
        name: 'Sales',
        icon: Banknote,
        subItems: [
          { name: 'Sales Invoices', href: '/sales' },
        ]
      },
      {
        name: 'Inventory',
        icon: PackageSearch,
        subItems: [
          { name: 'Current Stock', href: '/inventory/stock' },
        ]
      },
    ]
  },
  {
    title: "Financials",
    items: [
      {
        name: 'Accounting',
        icon: Calculator,
        subItems: [
                    { name: 'Chart of Accounts', href: '/accounting/chart-of-accounts' },
          { name: '💳 Cash Receipt Voucher', href: '/accounting/finance?tab=crv' },
          { name: '💰 Cash Payment Voucher', href: '/accounting/finance?tab=cpv' },
          { name: '🔄 Contra Voucher', href: '/accounting/finance?tab=contra' },
          { name: '📒 Cash Book', href: '/accounting/finance' },
          { name: '📊 Daily Cash Summary', href: '/accounting/finance?tab=daily-summary' },
          { name: 'Journal Vouchers', href: '/accounting/journal-vouchers' },
          { name: 'General Ledger', href: '/accounting/general-ledger' },
          { name: 'Trial Balance', href: '/accounting/trial-balance' },
          { name: 'Profit & Loss', href: '/accounting/profit-loss' },
          { name: 'Balance Sheet', href: '/accounting/balance-sheet' },
          { name: 'Cash Flow', href: '/accounting/cash-flow' },
          { name: 'Opening Balance', href: '/accounting/opening-balance' },
        ]
      },
      {
        name: 'Ledgers (Legacy)',
        icon: BookText,
        href: '/ledgers'
      }
    ]
  },
  {
    title: "Analytics",
    items: [
      {
        name: 'Reports',
        icon: LineChart,
        href: '/reports'
      }
    ]
  }
];

const NavGroup: React.FC<{ item: NavItem; onClose?: () => void }> = ({ item, onClose }) => {
  const location = useLocation();
  const isActive = item.href ? location.pathname === item.href : item.subItems?.some(sub => location.pathname.startsWith(sub.href));
  const [isOpen, setIsOpen] = useState(isActive);

  if (!item.subItems) {
    return (
      <NavLink
        to={item.href!}
        onClick={onClose}
        className={({ isActive }) =>
          cn(
            isActive
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors'
          )
        }
      >
        {item.icon && <item.icon className="h-4 w-4 flex-shrink-0" />}
        {item.name}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          isActive ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
          'group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors'
        )}
      >
        <div className="flex items-center gap-3">
          {item.icon && <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />}
          {item.name}
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
        )}
      </button>
      
      {isOpen && (
        <div className="mt-1 space-y-1 pl-10">
          {item.subItems.map((subItem) => (
            <NavLink
              key={subItem.name}
              to={subItem.href}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  'block rounded-md px-3 py-2 text-sm transition-colors'
                )
              }
            >
              {subItem.name}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const dashboardName = useSettingsStore(s => s.dashboardName);
  return (
    <div className="flex h-full w-72 flex-col border-r border-border bg-card shadow-sm">
      <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Box className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">{dashboardName || 'Manufacturing ERP'}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 text-muted-foreground/80 hover:bg-muted hover:text-foreground rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-hide">
        <nav className="space-y-8">
          {navigationGroups.map((group) => (
            <div key={group.title}>
              <h3 className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/80 mb-3">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavGroup key={item.name} item={item} onClose={onClose} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
      
      <div className="mt-auto border-t border-border/50 p-4">
        <NavLink 
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-4'
            )
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        
        <div className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/40/50 mb-2">
          <div className="h-9 w-9 rounded-full bg-muted-foreground/20 flex items-center justify-center text-sm font-semibold text-foreground/80 ring-1 ring-background">
            AD
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground truncate">Admin User</span>
            <span className="text-xs text-muted-foreground truncate">admin@miaoda.com</span>
          </div>
        </div>
        
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {import.meta.env.MODE === 'production' ? 'PROD' : 'DEV'} BUILD {import.meta.env.VITE_APP_BUILD || '20260718.1'}
          </span>
        </div>
      </div>
    </div>
  );
}

