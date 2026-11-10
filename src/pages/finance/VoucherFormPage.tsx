import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CashbookVoucherForm, VoucherFormMode } from '../../components/CashbookVoucherForm';

const META: Record<VoucherFormMode, { eyebrow: string; title: string; subtitle: string; segment: string }> = {
  'cash-payment': { eyebrow: 'Cashbook', title: 'New Cash Payment Voucher', subtitle: 'Record money paid out of the cash in hand', segment: 'cash-payment' },
  'bank-payment': { eyebrow: 'Cashbook', title: 'New Bank Payment Voucher', subtitle: 'Record money paid out of a bank account', segment: 'bank-payment' },
  'cash-receipt': { eyebrow: 'Cashbook', title: 'New Cash Receipt Voucher', subtitle: 'Record money received into the cash in hand', segment: 'cash-receipt' },
  'bank-receipt': { eyebrow: 'Cashbook', title: 'New Bank Receipt Voucher', subtitle: 'Record money received into a bank account', segment: 'bank-receipt' },
  journal: { eyebrow: 'Journal Voucher', title: 'New Journal Voucher', subtitle: 'Manual adjusting entries — the system auto-posts balanced double entries', segment: 'journal-voucher' },
};

const EDIT_TITLES: Record<VoucherFormMode, string> = {
  'cash-payment': 'Edit Cash Payment Voucher',
  'bank-payment': 'Edit Bank Payment Voucher',
  'cash-receipt': 'Edit Cash Receipt Voucher',
  'bank-receipt': 'Edit Bank Receipt Voucher',
  journal: 'Edit Journal Voucher',
};

/**
 * Full-page voucher editor — routes /accounting/<kind>/new and
 * /accounting/<kind>/edit/:voucherId. Same anatomy as the purchase/sale
 * entry pages (sticky back header, one column, no modal chrome).
 */
export function VoucherFormPage({ kind }: { kind: VoucherFormMode }) {
  const { voucherId } = useParams<{ voucherId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(voucherId);

  const meta = META[kind];
  const listRoute = `/accounting/${meta.segment}`;
  const title = isEdit ? EDIT_TITLES[kind] : meta.title;

  const sourceModule = kind === 'journal' ? 'Manual' as const : 'Cashbook' as const;

  const close = () => navigate(listRoute);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* ── Sticky header ── */}
      <header className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">{meta.eyebrow}</p>
            <h1 className="text-lg font-semibold leading-tight text-foreground">{title}</h1>
          </div>
          <span className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isEdit ? 'Editing' : 'Draft'}
          </span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto w-full max-w-7xl py-6">
        <p className="mb-6 text-sm text-muted-foreground">{meta.subtitle}</p>
        <CashbookVoucherForm
          key={`${kind}-${voucherId || 'new'}`}
          mode={kind}
          editVoucherId={voucherId}
          defaultAccountId={searchParams.get('account') || undefined}
          sourceModule={sourceModule}
          onSaved={close}
          onCancel={close}
        />
      </div>
    </div>
  );
}
