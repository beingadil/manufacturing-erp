/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import RouteFallback from './components/RouteFallback';
import UpdateManager from '@/components/UpdateManager';
import UpdateMigrationNotice from '@/components/UpdateMigrationNotice';
import { Toaster } from '@/components/ui/sonner';
import { RouteGuard } from './components/common/RouteGuard';
import { AuthProvider } from './contexts/AuthContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';

// Route-level code splitting — every page ships as its own chunk and loads
// on first navigation. The Dashboard is preloaded at idle so the landing
// view appears instantly without holding 2.9 MB in the critical path.
const Accounting = lazy(() => import('@/pages/Accounting').then(m => ({ default: m.Accounting })));
const Categories = lazy(() => import('@/pages/Categories'));
const Customers = lazy(() => import('@/pages/Customers').then(m => ({ default: m.Customers })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const FinishedGoods = lazy(() => import('@/pages/FinishedGoods').then(m => ({ default: m.FinishedGoods })));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const ProductionOrderDetail = lazy(() => import('@/pages/products/ProductionOrderDetail'));
const BankPaymentVoucher = lazy(() => import('@/pages/finance/BankPaymentVoucher').then(m => ({ default: m.BankPaymentVoucher })));
const BankReceiptVoucher = lazy(() => import('@/pages/finance/BankReceiptVoucher').then(m => ({ default: m.BankReceiptVoucher })));
const CashBookPage = lazy(() => import('@/pages/finance/CashBookPage').then(m => ({ default: m.CashBookPage })));
const CashPaymentVoucher = lazy(() => import('@/pages/finance/CashPaymentVoucher').then(m => ({ default: m.CashPaymentVoucher })));
const CashReceiptVoucher = lazy(() => import('@/pages/finance/CashReceiptVoucher').then(m => ({ default: m.CashReceiptVoucher })));
const JournalVoucher = lazy(() => import('@/pages/finance/JournalVoucher').then(m => ({ default: m.JournalVoucher })));
const VoucherFormPage = lazy(() => import('@/pages/finance/VoucherFormPage').then(m => ({ default: m.VoucherFormPage })));
const JobWork = lazy(() => import('@/pages/JobWork').then(m => ({ default: m.JobWork })));
const Ledgers = lazy(() => import('@/pages/Ledgers').then(m => ({ default: m.Ledgers })));
const BillFormPage = lazy(() => import('@/pages/processing/BillFormPage'));
const SendFormPage = lazy(() => import('@/pages/processing/SendFormPage'));
const ReceiveFormPage = lazy(() => import('@/pages/processing/ReceiveFormPage'));
const MaterialDetail = lazy(() => import('@/pages/MaterialDetail').then(m => ({ default: m.MaterialDetail })));
const MonitorMetric = lazy(() => import('@/pages/monitor/MonitorMetric').then(m => ({ default: m.MonitorMetric })));
const MonitorScreen = lazy(() => import('@/pages/MonitorScreen').then(m => ({ default: m.MonitorScreen })));
const ProcessorDetail = lazy(() => import('@/pages/ProcessorDetail').then(m => ({ default: m.ProcessorDetail })));
const Processors = lazy(() => import('@/pages/Processors').then(m => ({ default: m.Processors })));
const PurchaseDetail = lazy(() => import('@/pages/PurchaseDetail').then(m => ({ default: m.PurchaseDetail })));
const PurchaseFormPage = lazy(() => import('@/pages/PurchaseFormPage'));
const Purchases = lazy(() => import('@/pages/Purchases').then(m => ({ default: m.Purchases })));
const RawMaterials = lazy(() => import('@/pages/RawMaterials').then(m => ({ default: m.RawMaterials })));
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })));
const Sales = lazy(() => import('@/pages/Sales').then(m => ({ default: m.Sales })));
const SalesFormPage = lazy(() => import('@/pages/SalesFormPage'));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Suppliers = lazy(() => import('@/pages/Suppliers').then(m => ({ default: m.Suppliers })));

import { useSettingsStore } from './store/useSettingsStore';

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

  useEffect(() => {
    // Warm the landing route's chunk at idle so the first paint needs no
    // network round-trip for it.
    const preload = () => void import('@/pages/Dashboard');
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(preload);
    } else {
      const t = setTimeout(preload, 300);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
        <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route path="/" element={<RouteGuard><DashboardLayout /></RouteGuard>}>
          <Route index element={<Dashboard />} />
          <Route path="job-work" element={<Navigate to="/processing" replace />} />
          <Route path="purchases" element={<RouteGuard requireModule="Purchases" requireAction="View"><Purchases /></RouteGuard>} />
          <Route path="purchases/new" element={<RouteGuard requireModule="Purchases" requireAction="View"><PurchaseFormPage /></RouteGuard>} />
          <Route path="purchases/edit/:id" element={<RouteGuard requireModule="Purchases" requireAction="View"><PurchaseFormPage /></RouteGuard>} />
          <Route path="processing" element={<RouteGuard requireModule="Processing" requireAction="View"><JobWork /></RouteGuard>} />
          <Route path="processing/send/:id?" element={<RouteGuard requireModule="Processing" requireAction="View"><SendFormPage /></RouteGuard>} />
          <Route path="processing/receive/:id?" element={<RouteGuard requireModule="Processing" requireAction="View"><ReceiveFormPage /></RouteGuard>} />
          <Route path="processing/generate-bill/:id?" element={<RouteGuard requireModule="Processing" requireAction="View"><BillFormPage /></RouteGuard>} />
          {/* Manufacturing is retired — the Products page is the factory floor. Keep /manufacturing as a redirect for old bookmarks. */}
          <Route path="manufacturing" element={<Navigate to="/products" replace />} />
          <Route path="sales" element={<RouteGuard requireModule="Sales" requireAction="View"><Sales /></RouteGuard>} />
          <Route path="sales/new" element={<RouteGuard requireModule="Sales" requireAction="View"><SalesFormPage /></RouteGuard>} />
          <Route path="sales/edit/:id" element={<RouteGuard requireModule="Sales" requireAction="View"><SalesFormPage /></RouteGuard>} />
          <Route path="categories" element={<RouteGuard requireModule="Master Data" requireAction="View"><Categories /></RouteGuard>} />
          <Route path="materials" element={<RouteGuard requireModule="Master Data" requireAction="View"><RawMaterials /></RouteGuard>} />
          <Route path="materials/:id" element={<RouteGuard requireModule="Master Data" requireAction="View"><MaterialDetail /></RouteGuard>} />
          <Route path="materials/:id/purchases/:batchId" element={<RouteGuard requireModule="Master Data" requireAction="View"><PurchaseDetail /></RouteGuard>} />
          <Route path="products" element={<RouteGuard requireModule="Master Data" requireAction="View"><FinishedGoods /></RouteGuard>} />
<Route path="products/:id" element={<RouteGuard requireModule="Master Data" requireAction="View"><ProductDetail /></RouteGuard>} />
<Route path="products/:id/mo/:moId" element={<RouteGuard requireModule="Master Data" requireAction="View"><ProductionOrderDetail /></RouteGuard>} />
          
          <Route path="ledgers" element={<RouteGuard requireModule="Ledgers" requireAction="View"><Ledgers /></RouteGuard>} />
          <Route path="processors/:processorId" element={<RouteGuard requireModule="Master Data" requireAction="View"><ProcessorDetail /></RouteGuard>} />
          <Route path="processors" element={<RouteGuard requireModule="Master Data" requireAction="View"><Processors /></RouteGuard>} />
          <Route path="suppliers" element={<RouteGuard requireModule="Master Data" requireAction="View"><Suppliers /></RouteGuard>} />
          <Route path="customers" element={<RouteGuard requireModule="Master Data" requireAction="View"><Customers /></RouteGuard>} />
          <Route path="reports" element={<RouteGuard requireModule="Reports" requireAction="View"><Reports /></RouteGuard>} />
          <Route path="accounting" element={<Navigate to="/accounting/chart-of-accounts" replace />} />
          <Route path="accounting/chart-of-accounts" element={<RouteGuard requireModule="Accounting" requireAction="View"><Accounting /></RouteGuard>} />
          <Route path="accounting/cash-payment" element={<RouteGuard requireModule="Accounting" requireAction="View"><CashPaymentVoucher /></RouteGuard>} />
          <Route path="accounting/cash-payment/new" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="cash-payment" /></RouteGuard>} />
          <Route path="accounting/cash-payment/edit/:voucherId" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="cash-payment" /></RouteGuard>} />
          <Route path="accounting/bank-payment" element={<RouteGuard requireModule="Accounting" requireAction="View"><BankPaymentVoucher /></RouteGuard>} />
          <Route path="accounting/bank-payment/new" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="bank-payment" /></RouteGuard>} />
          <Route path="accounting/bank-payment/edit/:voucherId" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="bank-payment" /></RouteGuard>} />
          <Route path="accounting/cash-receipt" element={<RouteGuard requireModule="Accounting" requireAction="View"><CashReceiptVoucher /></RouteGuard>} />
          <Route path="accounting/cash-receipt/new" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="cash-receipt" /></RouteGuard>} />
          <Route path="accounting/cash-receipt/edit/:voucherId" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="cash-receipt" /></RouteGuard>} />
          <Route path="accounting/bank-receipt" element={<RouteGuard requireModule="Accounting" requireAction="View"><BankReceiptVoucher /></RouteGuard>} />
          <Route path="accounting/bank-receipt/new" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="bank-receipt" /></RouteGuard>} />
          <Route path="accounting/bank-receipt/edit/:voucherId" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="bank-receipt" /></RouteGuard>} />
          <Route path="accounting/journal-voucher" element={<RouteGuard requireModule="Accounting" requireAction="View"><JournalVoucher /></RouteGuard>} />
          <Route path="accounting/journal-voucher/new" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="journal" /></RouteGuard>} />
          <Route path="accounting/journal-voucher/edit/:voucherId" element={<RouteGuard requireModule="Accounting" requireAction="View"><VoucherFormPage kind="journal" /></RouteGuard>} />
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
        <Route path="/monitor/:metric" element={<MonitorMetric />} />
        </Routes>
        </Suspense>
      </HashRouter>
      <Toaster position="top-right" richColors />
      <UpdateManager />
      <UpdateMigrationNotice />
    </AuthProvider>
  );
}
