import { Coins } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { previewProcessingCostReclassification } from '../../lib/accounting/processingCostReclassification';
import { isManufacturingEnabled } from '../../lib/business/ManufacturingService';
import { formatCurrency, formatNumber } from '../../lib/utils';
import { useERPStore } from '../../store/useERPStore';
import { FormModal } from '../form/FormModal';
import { FormSection } from '../form/FormSection';
import { FormFooter } from '../form/FormFooter';

/**
 * One-time repair for databases migrated from before manufacturing v4:
 * processing charges that were expensed at bill time but are still embedded in
 * on-hand batches can be capitalised once (Dr Raw Material Inventory / Cr
 * Processing Expense). The amber banner renders ONLY while such an amount
 * exists — otherwise this section is invisible.
 *
 * Moved here from the Manufacturing page when that page was retired.
 */
export function OneTimeRepairSection() {
  const stateSchemaVersion = useERPStore(s => s.stateSchemaVersion);
  const enabled = isManufacturingEnabled({ stateSchemaVersion });
  const batches = useERPStore(s => s.batches);
  const processingReceipts = useERPStore(s => s.processingReceipts);
  const processorBills = useERPStore(s => s.processorBills);
  const materials = useERPStore(s => s.materials);
  const processingCostReclassification = useERPStore(s => s.processingCostReclassification);
  const reclassifyProcessingCosts = useERPStore(s => s.reclassifyProcessingCosts);

  const [reclassifyOpen, setReclassifyOpen] = useState(false);

  const reclassification = useMemo(
    () =>
      previewProcessingCostReclassification({
        stateSchemaVersion,
        batches,
        processingReceipts,
        processorBills,
        materials,
        processingCostReclassification,
      }),
    [stateSchemaVersion, batches, processingReceipts, processorBills, materials, processingCostReclassification],
  );

  const handleReclassify = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = reclassifyProcessingCosts();
      toast.success(
        `Capitalised ${formatCurrency(result.amount)} of historical processing cost — voucher ${result.voucherNo}.`,
      );
      setReclassifyOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not capitalise historical processing cost.');
    }
  };

  if (!enabled || reclassification.amount < 0.01) return null;

  return (
    <>
      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Coins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                One-time repair: historical processing cost needs capitalising
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
                {formatCurrency(reclassification.amount)} of processing charges was expensed in earlier
                periods and is still embedded in {formatNumber(reclassification.batchCount)} batch
                {reclassification.batchCount === 1 ? '' : 'es'} on hand. Capitalise it once so production
                can draw it from Raw Material Inventory. Sold quantities keep their historical expense.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReclassifyOpen(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            <Coins className="h-4 w-4" />
            Capitalise {formatCurrency(reclassification.amount)}
          </button>
        </div>
      </section>

      <FormModal
        isOpen={reclassifyOpen}
        onClose={() => setReclassifyOpen(false)}
        title="Capitalise historical processing cost"
        description="One forward journal moves the on-hand cost from expense into inventory. No historical voucher or COGS figure is rewritten."
        icon={<Coins />}
        size="lg"
        accent="from-amber-500 to-orange-600"
        footer={
          <FormFooter
            onCancel={() => setReclassifyOpen(false)}
            formId="processing-reclass-form"
            submitLabel="Post reclassification"
          />
        }
      >
        <form id="processing-reclass-form" onSubmit={handleReclassify} className="space-y-5">
          <FormSection icon={<Coins />} eyebrow="One-time adjustment" first>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To capitalise</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatCurrency(reclassification.amount)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Batches</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(reclassification.batchCount)}</dd>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Materials</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">{formatNumber(reclassification.lines.length)}</dd>
              </div>
            </dl>

            {reclassification.lines.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">Legacy cost on hand</th>
                      <th className="px-3 py-2 text-right font-medium">Expensed historically</th>
                      <th className="px-3 py-2 text-right font-medium">Capitalise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {reclassification.lines.map(line => (
                      <tr key={line.materialId}>
                        <td className="px-3 py-2 font-medium text-foreground">{line.materialName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.onHandLegacyCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.expensedLegacyCost)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{formatCurrency(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">Journal to post</p>
              <p className="mt-1">
                Dr Raw Material Inventory {formatCurrency(reclassification.amount)} · Cr Processing Expense{' '}
                {formatCurrency(reclassification.amount)}.
              </p>
              <p className="mt-2">
                Only the share still in on-hand pcs is capitalised. Quantities already sold or consumed keep the
                expense they were charged in their own period, and later production lots will credit the same cost
                from Raw Material Inventory.
              </p>
            </div>
          </FormSection>
        </form>
      </FormModal>
    </>
  );
}
