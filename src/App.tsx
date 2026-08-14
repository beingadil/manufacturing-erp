/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { MonitorScreen } from './pages/MonitorScreen';
import { JobWork } from './pages/JobWork';
import { RawMaterials } from './pages/RawMaterials';
import { MaterialDetail } from './pages/MaterialDetail';
import { FinishedGoods } from './pages/FinishedGoods';
import { Processors } from './pages/Processors';
import { Ledgers } from './pages/Ledgers';
import { Settings } from './pages/Settings';
import { Purchases } from './pages/Purchases';
import { Sales } from './pages/Sales';
import { Suppliers } from './pages/Suppliers';
import { Customers } from './pages/Customers';
import { Reports } from './pages/Reports';
import Categories from './pages/Categories';
import { Accounting } from './pages/Accounting';
import { CashPaymentVoucher } from './pages/finance/CashPaymentVoucher';
import { BankPaymentVoucher } from './pages/finance/BankPaymentVoucher';
import { CashReceiptVoucher } from './pages/finance/CashReceiptVoucher';
import { BankReceiptVoucher } from './pages/finance/BankReceiptVoucher';
import { JournalVoucher } from './pages/finance/JournalVoucher';
import { CashBookPage } from './pages/finance/CashBookPage';
import { AuthProvider } from './contexts/AuthContext';
import { RouteGuard } from './components/common/RouteGuard';
import { Login } from './pages/Login';
import { useSettingsStore } from './store/useSettingsStore';
import { Toaster } from '@/components/ui/sonner';
import UpdateManager from '@/components/UpdateManager';
import UpdateMigrationNotice from '@/components/UpdateMigrationNotice';

export default function App() {
  const theme = useSettingsStore(state => state.theme);
  const primaryColor = useSettingsStore(state => state.primaryColor);
  const secondaryColor = useSettingsStore(state => state.secondaryColor);
  const favicon = useSettingsStore(state => state.favicon);

  useEffect(() => {
    if (favicon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = favicon;
    }
  }, [favicon]);


  useEffect(() => {
    const hexToHSL = (hex: string) => {
      let r = 0, g = 0, b = 0;
      if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
      } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
      }
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return `${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
    };

    const root = document.documentElement;
    // Custom brand colors are light-mode values. In dark mode the .dark CSS
    // variables (primary = light, primary-foreground = dark) must win, or every
    // text-primary / bg-primary element renders dark-on-dark. This was the
    // root cause of the broken dark-mode contrast on buttons and KPI cards.
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--secondary');
      return;
    }
    root.style.setProperty('--primary', hexToHSL(primaryColor));
    root.style.setProperty('--secondary', hexToHSL(secondaryColor));
  }, [theme, primaryColor, secondaryColor]);


  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark');
        root.classList.add(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
        <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route path="/" element={<RouteGuard><DashboardLayout /></RouteGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="job-work" element={<Navigate to="/processing" replace />} />
          <Route path="purchases" element={<RouteGuard requireModule="Purchases" requireAction="View"><Purchases /></RouteGuard>} />
          <Route path="processing" element={<RouteGuard requireModule="Processing" requireAction="View"><JobWork /></RouteGuard>} />
          <Route path="sales" element={<RouteGuard requireModule="Sales" requireAction="View"><Sales /></RouteGuard>} />
          <Route path="categories" element={<RouteGuard requireModule="Master Data" requireAction="View"><Categories /></RouteGuard>} />
          <Route path="materials" element={<RouteGuard requireModule="Master Data" requireAction="View"><RawMaterials /></RouteGuard>} />
          <Route path="materials/:id" element={<RouteGuard requireModule="Master Data" requireAction="View"><MaterialDetail /></RouteGuard>} />
          <Route path="products" element={<RouteGuard requireModule="Master Data" requireAction="View"><FinishedGoods /></RouteGuard>} />
          <Route path="ledgers" element={<RouteGuard requireModule="Ledgers" requireAction="View"><Ledgers /></RouteGuard>} />
          <Route path="processors" element={<RouteGuard requireModule="Master Data" requireAction="View"><Processors /></RouteGuard>} />
          <Route path="suppliers" element={<RouteGuard requireModule="Master Data" requireAction="View"><Suppliers /></RouteGuard>} />
          <Route path="customers" element={<RouteGuard requireModule="Master Data" requireAction="View"><Customers /></RouteGuard>} />
          <Route path="reports" element={<RouteGuard requireModule="Reports" requireAction="View"><Reports /></RouteGuard>} />
          <Route path="accounting" element={<Navigate to="/accounting/chart-of-accounts" replace />} />
          <Route path="accounting/chart-of-accounts" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/cash-payment" element={<RouteGuard requireModule="Accounting" requireAction="View"><CashPaymentVoucher /></RouteGuard>} />
          <Route path="accounting/bank-payment" element={<RouteGuard requireModule="Accounting" requireAction="View"><BankPaymentVoucher /></RouteGuard>} />
          <Route path="accounting/cash-receipt" element={<RouteGuard requireModule="Accounting" requireAction="View"><CashReceiptVoucher /></RouteGuard>} />
          <Route path="accounting/bank-receipt" element={<RouteGuard requireModule="Accounting" requireAction="View"><BankReceiptVoucher /></RouteGuard>} />
          <Route path="accounting/journal-voucher" element={<RouteGuard requireModule="Accounting" requireAction="View"><JournalVoucher /></RouteGuard>} />
          <Route path="accounting/cashbook" element={<RouteGuard requireModule="Accounting" requireAction="View"><CashBookPage /></RouteGuard>} />
          <Route path="accounting/journal-vouchers" element={<Navigate to="/accounting/journal-voucher" replace />} />
          <Route path="accounting/opening-balance" element={<Navigate to="/accounting/chart-of-accounts" replace />} />
          <Route path="accounting/general-ledger" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/trial-balance" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/profit-loss" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/balance-sheet" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/cash-flow" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="settings" element={<RouteGuard requireModule="Settings" requireAction="View"><Settings /></RouteGuard>} />
          <Route path="users" element={<Navigate to="/settings" replace />} />
          <Route path="maintenance" element={<Navigate to="/settings" replace />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        <Route path="/monitor" element={<MonitorScreen />} />
      </Routes>
      </HashRouter>
      <Toaster position="top-right" richColors />
      <UpdateManager />
      <UpdateMigrationNotice />
    </AuthProvider>
  );
}
