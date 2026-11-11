/**
 * The raw-material form — the exact same fields the Raw Materials module
 * renders. Used inside the module's modal and, inline, on the purchase entry
 * page so a buyer can create a material without losing the document.
 */
import { Boxes, FileText, Layers, Package, PackageSearch } from 'lucide-react';
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
import { formHintClass, formInputClass } from '../form/formStyles';
import { Dropdown } from '../Dropdown';
import { SearchableSelect } from '../SearchableSelect';

export interface MaterialFormProps {
  /** Edit mode when a material is supplied; add mode otherwise. */
  material?: RawMaterial | null;
  /** Called with the saved material id so the caller can select it. */
  onSaved: (id: string) => void;
  onCancel: () => void;
  /** Id of the <form>. Pass it when the save button lives OUTSIDE the form —
   *  e.g. in a modal's footer slot, which is a sibling of the scroll area.
   *  The `form` attribute re-associates the button with the form. */
  formId?: string;
  /** Set false when the caller supplies its own footer (modal footer slot). */
  showFooter?: boolean;
}

/** The two ways a material can be used — each with the consequence spelled out. */
const USAGE_OPTIONS = [
  {
    v: 'sellable' as const,
    t: 'A product on its own',
    d: 'Bought, processed and sold as finished goods.',
    icon: <Package size={18} aria-hidden="true" />,
  },
  {
    v: 'component' as const,
    t: 'A part of another product',
    d: 'Used inside another material — never sold on its own.',
    icon: <Boxes size={18} aria-hidden="true" />,
  },
];

export function MaterialForm({ material, onSaved, onCancel, formId, showFooter = true }: MaterialFormProps) {
  const { materials, categories, processingStages } = useERPStore();

  const [name, setName] = useState(material?.name ?? '');
  // The "No." a person reads out with the name — "Circle 12½ Inch, No. 4 No".
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

  // A category with a defaultProcessingPath seeds the selector — but never for a
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
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="e.g. Circle 12½ Inch"
                />
              </FormField>
              <FormField id="material-code" label="No." hint="Shown next to the name" className="sm:col-span-1">
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
              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-foreground">This material is used as…</legend>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Material usage">
                  {USAGE_OPTIONS.map(o => {
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
                          'group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200',
                          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10',
                          selected
                            ? 'border-primary bg-primary/[0.05] shadow-sm'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                            selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {o.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-sm font-semibold leading-tight',
                              selected ? 'text-primary' : 'text-foreground'
                            )}
                          >
                            {o.t}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground">{o.d}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            selected ? 'border-primary' : 'border-border group-hover:border-primary/50'
                          )}
                        >
                          {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </FormGrid>
          </FormSection>
          <FormSection icon={<FileText />} eyebrow="Details">
            <FormGrid cols={1}>
              <FormField id="material-description" label="Description">
                <textarea
                  id="material-description"
                  name="material-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={formInputClass}
                  placeholder="Optional notes"
                  rows={3}
                />
              </FormField>
              <FormField id="material-status" label="Status">
                <SearchableSelect
                  options={[
                    { id: 'Active', label: 'Active' },
                    { id: 'Inactive', label: 'Inactive' },
                  ]}
                  value={status}
                  onChange={v => setStatus(v as 'Active' | 'Inactive')}
                  placeholder="Select status..."
                />
              </FormField>
            </FormGrid>
          </FormSection>
        </div>
        <FormSection icon={<Layers />} eyebrow="Classification" first>
          <FormGrid cols={1}>
            <FormField id="material-category" label="Category" required>
              <SearchableSelect
                options={categories.map(c => ({ id: c.id, label: c.name }))}
                value={categoryId}
                onChange={handleCategoryChange}
                placeholder="Select Category..."
                required
              />
            </FormField>
            {usageType !== 'component' && (
              <FormField id="material-path" label="Processing Path" required>
                <SearchableSelect
                  options={[
                    { id: 'full_chain', label: `Through all processors (${sortedStagesForForm.length || 5} stages)` },
                    { id: 'single_stage', label: 'One processor only - becomes final product' },
                    { id: 'custom_stages', label: 'Selected processors only - pick stages below' },
                    { id: 'ready_made', label: 'Ready-made - no processing, straight to stock' },
                  ]}
                  value={processingPath}
                  onChange={v => setProcessingPath(v as ProcessingPath)}
                  placeholder="Select processing path..."
                  required
                />
                <p className={formHintClass}>
                  {processingPath === 'full_chain' && 'Through every processor, in order.'}
                  {processingPath === 'single_stage' && 'One processor only.'}
                  {processingPath === 'custom_stages' && 'The processors you tick below.'}
                  {processingPath === 'ready_made' && 'No processing. Straight into stock.'}
                </p>
              </FormField>
            )}
            {usageType !== 'component' && processingPath === 'custom_stages' && (
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Selected Processors *</label>
                <div className="space-y-1 rounded-xl border border-border bg-card p-2">
                  {sortedStagesForForm.map(s => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={allowedStageIds.includes(s.id)}
                        onChange={e =>
                          setAllowedStageIds(prev => (e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)))
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-foreground">
                        {s.sequence}. {s.name}
                        {s.isFinalStage ? ' (Final)' : ''}
                      </span>
                    </label>
                  ))}
                  {sortedStagesForForm.length === 0 && (
                    <p className={formHintClass}>No processor stages configured yet.</p>
                  )}
                </div>
                <p className={formHintClass}>
                  Sends always follow the chain order among the selected processors; the last selected one produces the
                  final product.
                </p>
              </div>
            )}
            {usageType !== 'component' && processingPath === 'single_stage' && (
              <FormField id="material-fixed-stage" label="The One Processor" required>
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
              </FormField>
            )}
          </FormGrid>
        </FormSection>
      </FormColumns>
      {showFooter && (
        <FormFooter
          className="sticky bottom-0 -mb-5"
          onCancel={onCancel}
          submitLabel={material ? 'Save Changes' : 'Save Material'}
        />
      )}
    </form>
  );
}
