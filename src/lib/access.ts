import { useAccessStore } from '../store/useAccessStore';

export const PERMISSION_ACTIONS = ['View', 'Create', 'Edit', 'Delete', 'Print', 'Export'] as const;

export type PermissionAction = typeof PERMISSION_ACTIONS[number];

export const MODULE_ORDER = [
  'Dashboard',
  'Master Data',
  'Customers',
  'Suppliers',
  'Processors',
  'Raw Materials',
  'Products',
  'Purchases',
  'Sales',
  'Processing',
  'Inventory',
  'Accounting',
  'Ledgers',
  'Reports',
  'Settings',
  'Users',
];

export const MODULE_ICONS: Record<string, string> = {
  Dashboard: 'LayoutDashboard',
  'Master Data': 'Database',
  Customers: 'Users',
  Suppliers: 'Truck',
  Processors: 'UserCog',
  'Raw Materials': 'PackageSearch',
  Products: 'Package',
  Purchases: 'ShoppingCart',
  Sales: 'DollarSign',
  Processing: 'Factory',
  Inventory: 'Warehouse',
  Accounting: 'Calculator',
  Ledgers: 'BookOpen',
  Reports: 'BarChart3',
  Settings: 'Settings',
  Users: 'Shield',
};

export function moduleIcon(module: string): string {
  return MODULE_ICONS[module] || 'Circle';
}

export function moduleDisplayName(module: string): string {
  return module;
}

export function actionDisplayName(action: string): string {
  return action;
}

export async function logAuditEvent(
  module: string,
  action: string,
  recordId?: string,
  details?: Record<string, any>
) {
  try {
    const store = useAccessStore.getState();
    store.logAudit({
      action_type: action,
      target_object: module,
      target_id: recordId,
      changes: details,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
