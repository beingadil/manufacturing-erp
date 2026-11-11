/**
 * The raw-material form â€” the exact same fields the Raw Materials module
 * renders. Used inside the module's modal and, inline, on the purchase entry
 * page so a buyer can create a material without losing the document.
 */
import { FileText, Layers, PackageSearch } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { findMaterialCodeConflict } from '../../lib/business/ProductAssemblyService';
import { cn } from '../../lib/utils';
import { MaterialService } from '../../services/MaterialService';
import { useERPStore } from '../../store/useERPStore';
import type { MaterialUsageType, ProcessingPath, RawMaterial } from '../../types/erp';
import { FormColumns } from '../form/FormColumns';
import { FormField } from '../form/FormField';
import { FormFooter } from '../form/FormFooter';
import { FormGrid } from '../form/FormGrid';
import { FormSection } from '../form/FormSection';
import { formInputClass } from '../form/formStyles';
import { Dropdown } from '../Dropdown';
import { SearchableSelect } from '../SearchableSelect';

export interface MaterialFormProps {
  /** Edit mode when a material is supplied; add mode otherwise. */
  material?: RawMaterial | null;
  /** Called with the saved material id so the caller can select it. */
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function MaterialForm({ material, onSaved, onCancel }: MaterialFormProps) {
  const { materials, categories, processingStages } = useERPStore();

  const [name, setName] = useState(material?.name ?? '');
  // The "No." a person reads out with the name â€” "Circle 12Â½ Inch, No. 4 No".
  const [code, setCode] = useState(material?.code ?? '');
  const [usageType, setUsageType] = useState<MaterialUsageType>(material?.usageType === 'component' ? 'component' : 'sellable');
  const [categoryId, setCategoryId] = useState(material?.categoryId ?? '');
  const [description, setDescription] = useState(material?.description ?? '');
  const [status, setStatus] = useState<'Active' | 'Inactive'>(material?.status === 'Inactive' ? 'Inactive' : 'Active');
  const [processingPath, setProcessingPath] = useState<ProcessingPath>(material?.processingPath ?? 'full_chain');
  const [fixedStageId, setFixedStageId] = useState(material?.fixedStageId ?? '');
  const [allowedStageIds, setAllowedStageIds] = useState<string[]>(material?.allowedStageIds ?? []);

  const sortedStagesForForm = useMemo(
    () => [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence),
    [processingStages]
  );

  // A category with a defaultProcessingPath seeds the selector â€” but never for a
  // part. Parts are bought ready-made, and the path selector is hidden for them,
  // so a category default arriving after the usage choice would silently save
  // the part on a processor chain the user can neither see nor change.
  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    if (usageType === 'component') return;
    const catDefault = categories.find(c => c.id === id)?.defaultProcessingPath;
    if (catDefault) setProcessingPath(catDefault);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId) return;
    if (processingPath === 'single_stage' && !fixedStageId) return;
    if (processingPath === 'custom_stages' && allowedStageIds.length === 0) return;

    const clash = findMaterialCodeConflict(materials, code, material?.id);
    if (clash) {
      toast.error(`No. "${code.trim()}" is already used by "${clash}". Pick a different one.`);
      return;
    }

    // A part is always ready-made. Enforced at save as well as in the toggle so
    // a category default, an edit, or stale form state can never persist a part
    // that the dispatch screens would then try to push down the chain.
    const effectivePath: ProcessingPath = usageType === 'component' ? 'ready_made' : processingPath;

    const data = {
      name,
      code: code.trim() || undefined,
      usageType,
      categoryId,
      description,
      status,
      processingPath: effectivePath,
      fixedStageId: effectivePath === 'single_stage' ? fixedStageId : undefined,
      allowedStageIds: effectivePath === 'custom_stages' ? allowedStageIds : undefined,
    };

    try {
      if (material) {
        MaterialService.update(material.id, data);
        toast.success('Material updated successfully');
        onSaved(material.id);
      } else {
        const id = MaterialService.create(data);
        toast.success('Material created successfully');
        onSaved(id);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save material');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormColumns>
        <div>
      <FormSection icon={<PackageSearch />} eyebrow="Identity & usage" first>
        <FormGrid cols={2}>
          <FormField id="material-name" label="Material Name" required className="sm:col-span-1">
            <input
              id="material-name"
              name="material-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="off"
              className={formInputClass}
              placeholder="e.g. Circle 12Â½ Inch"
            />
          </FormField>
          <FormField id="material-code" label="No." hint="Shown next to the name everywhere, and searchable." className="sm:col-span-1">
            <input
              id="material-code"
              name="material-code"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="off"
              className={formInputClass}
              placeholder="e.g. 4 No"
            />
          </FormField>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-semibold text-foreground">This material is used asâ€¦</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Material usage">
              {(
                [
                  { v: 'sellable', t: 'A product on its own', d: 'Processing makes it saleable; the Products form links it directly.' },
                  { v: 'component', t: 'A part of another product', d: 'A steel dhakkan on a steel jug, a handle. Never sold on its own.' },
                ] as const
              ).map(o => {
                const selected = usageType === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setUsageType(o.v);
                      if (o.v === 'component') setProcessingPath('ready_made');
                      else setProcessingPath('full_chain');
                      setFixedStageId('');
                      setAllowedStageIds([]);
                    }}
                    className={cn(
                      'group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                      selected
                        ? 'border-primary bg-primary/[0.04] shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        selected ? 'border-primary' : 'border-border group-hover:border-primary/50'
                      )}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}>
                        {o.t}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{o.d}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Only materials marked as a part can be picked in the Products form.</p>
          </fieldset>
        </FormGrid>
      </FormSection>
          <FormSection icon={<FileText />} eyebrow="Details">
        <FormGrid cols={2}>
          <FormField id="material-description" label="Description" className="sm:col-span-2">
            <textarea
              id="material-description"
              name="material-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={formInputClass}
              placeholder="Optional notes"
              rows={2}
            />
          </FormField>
          <FormField id="material-status" label="Status" className="sm:col-span-1">
            <SearchableSelect
              options={[
                { id: 'Active', label: 'Active' },
                { id: 'Inactive', label: 'Inactive' },
              ]}
              value={status}
              onChange={(v) => setStatus(v as 'Active' | 'Inactive')}
              placeholder="Select status..."
            />
          </FormField>
        </FormGrid>
          </FormSection>
        </div>
        <FormSection icon={<Layers />} eyebrow="Classification" first>
        <FormGrid cols={2}>
          <FormField id="material-category" label="Category" required className="sm:col-span-1">
            <SearchableSelect
              options={categories.map(c => ({ id: c.id, label: c.name }))}
              value={categoryId}
              onChange={handleCategoryChange}
              placeholder="Select Category..."
              required
            />
          </FormField>
{usageType !== 'component' && (
          <FormField id="material-path" label="Processing Path" required className="sm:col-span-1">
            <SearchableSelect
              options={[
                { id: 'full_chain', label: `Through all processors (${sortedStagesForForm.length || 5} stages)` },
                { id: 'single_stage', label: 'One processor only - becomes final product' },
                { id: 'custom_stages', label: 'Selected processors only - pick stages below' },
                { id: 'ready_made', label: 'Ready-made - no processing, straight to stock' },
              ]}
              value={processingPath}
              onChange={(v) => setProcessingPath(v as ProcessingPath)}
              placeholder="Select processing path..."
              required
            />
            <p className="text-xs text-muted-foreground">
              {processingPath === 'full_chain' && 'Material goes through every processor in sequence before becoming a final product.'}
              {processingPath === 'single_stage' && 'Material is sent to exactly one processor below; what comes back is the final product.'}
              {processingPath === 'custom_stages' && 'Tick the processors this material passes through (in chain order). What comes back from the LAST ticked processor is the final product.'}
              {processingPath === 'ready_made' && 'Purchased already finished (e.g. lids, handles) - enters sellable stock directly, never dispatched.'}
            </p>
          </FormField>
          )}
          {usageType !== 'component' && processingPath === 'custom_stages' && (
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-foreground">Selected Processors *</label>
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                {sortedStagesForForm.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedStageIds.includes(s.id)}
                      onChange={e =>
                        setAllowedStageIds(prev => (e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)))
                      }
                      className="accent-primary"
                    />
                    <span className="text-foreground">
                      {s.sequence}. {s.name}
                      {s.isFinalStage ? ' (Final)' : ''}
                    </span>
                  </label>
                ))}
                {sortedStagesForForm.length === 0 && <p className="text-xs text-muted-foreground">No processor stages configured yet.</p>}
              </div>
              <p className="text-xs text-muted-foreground">
                Sends always follow the chain order among the selected processors; the last selected one produces the final product.
              </p>
            </div>
          )}
          {usageType !== 'component' && processingPath === 'single_stage' && (
            <div className="space-y-2 sm:col-span-1">
              <label htmlFor="material-fixed-stage" className="text-sm font-semibold text-foreground">
                The One Processor *
              </label>
              <Dropdown
                id="material-fixed-stage"
                ariaLabel="The One Processor"
                placeholder="Select the processor stage..."
                value={fixedStageId}
                onChange={setFixedStageId}
                options={[
                  { value: '', label: 'Select the processor stage...' },
                  ...sortedStagesForForm.map(s => ({
                    value: s.id,
                    label: s.isFinalStage ? `${s.name} (Final)` : s.name,
                  })),
                ]}
              />
            </div>
          )}

        </FormGrid>
        </FormSection>
      </FormColumns>
      <FormFooter
        className="sticky bottom-0 -mb-5"
        onCancel={onCancel}
        submitLabel={material ? 'Save Changes' : 'Save Material'}
      />
    </form>
  );
}
