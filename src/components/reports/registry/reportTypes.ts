import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ReportCategoryId = 'purchase' | 'sales' | 'processing' | 'inventory' | 'financial';

export interface ReportDefinition {
  id: string;
  category: ReportCategoryId;
  categoryLabel: string;
  title: string;
  component: ComponentType;
  icon?: LucideIcon;
  description?: string;
  isPointInTime?: boolean;
  tags?: string[];
}

export interface ReportShellProps {
  definition: ReportDefinition;
  children: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  summary?: ReactNode;
  showHeader?: boolean;
}
