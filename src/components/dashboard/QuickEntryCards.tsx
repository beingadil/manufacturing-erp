import { ArrowUpRight, BookOpenCheck, DollarSign, Factory, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';

/**
 * Quick Entry — four direct-entry launch cards for the Dashboard.
 *
 * Each card deep-links into its module with ?new=1; the target page opens its
 * create form automatically on mount (and strips the param), so one click
 * lands the user inside a ready-to-fill form.
 */

interface QuickEntryCard {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: typeof ShoppingCart;
  iconWrap: string;
  hoverRing: string;
}

const CARDS: QuickEntryCard[] = [
  {
    key: 'purchase',
    title: 'New Purchase',
    description: 'Record raw material intake with weight & piece calculation',
    path: '/purchases?new=1',
    icon: ShoppingCart,
    iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    hoverRing: 'hover:border-emerald-500/40 hover:shadow-emerald-500/5',
  },
  {
    key: 'sale',
    title: 'New Sale',
    description: 'Bill finished goods against live finished stock',
    path: '/sales?new=1',
    icon: DollarSign,
    iconWrap: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    hoverRing: 'hover:border-blue-500/40 hover:shadow-blue-500/5',
  },
  {
    key: 'processor',
    title: 'Add Processor',
    description: 'Register a processing worker and their linked AP account',
    path: '/processors?new=1',
    icon: Factory,
    iconWrap: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    hoverRing: 'hover:border-violet-500/40 hover:shadow-violet-500/5',
  },
  {
    key: 'journal',
    title: 'JV Entry',
    description: 'Post a manual adjusting journal voucher',
    path: '/accounting/journal-voucher?new=1',
    icon: BookOpenCheck,
    iconWrap: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    hoverRing: 'hover:border-amber-500/40 hover:shadow-amber-500/5',
  },
];

export function QuickEntryCards() {
  const navigate = useNavigate();

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-foreground">Quick Entry</h3>
        <span className="text-xs text-muted-foreground">One click to a ready form</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map(card => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => navigate(card.path)}
              className={cn(
                'group relative flex items-start gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                card.hoverRing,
              )}
            >
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', card.iconWrap)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  {card.title}
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {card.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
