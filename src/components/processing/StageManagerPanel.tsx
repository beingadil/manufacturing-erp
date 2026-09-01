import { Edit, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../DataTable';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { PageModal } from '../ui/PageModal';
import { ProcessingService } from '../../services/ProcessingService';
import { useERPStore } from '../../store/useERPStore';
import type { ProcessingStage } from '../../types/erp';

/**
 * Processing Stage Master — configure the manufacturing chain. The chain order
 * and nextStageId are derived from `sequence` (rewired on every change), and
 * only the final stage (★) produces saleable Finished Goods.
 */
export function StageManagerPanel() {
  const { processingStages } = useERPStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editStageId, setEditStageId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [rateMethod, setRateMethod] = useState<'per_piece' | 'per_kg'>('per_piece');
  const [billingUnit, setBillingUnit] = useState('Per PCS');
  const [isFinal, setIsFinal] = useState(false);
  const [billingEnabled, setBillingEnabled] = useState(true);
  const [description, setDescription] = useState('');
  const [stageToDelete, setStageToDelete] = useState<string | null>(null);

  const sorted = useMemo(() => [...(processingStages || [])].sort((a, b) => a.sequence - b.sequence), [processingStages]);

  const openAdd = () => {
    setEditStageId(undefined);
    setName('');
    setSequence(String((sorted.length || 0) + 1));
    setRateMethod('per_piece');
    setBillingUnit('Per PCS');
    setIsFinal(false);
    setBillingEnabled(true);
    setDescription('');
    setModalOpen(true);
  };

  const openEdit = (s: ProcessingStage) => {
    setEditStageId(s.id);
    setName(s.name);
    setSequence(String(s.sequence));
    setRateMethod(s.rateMethod || 'per_piece');
    setBillingUnit(s.billingUnit || 'Per PCS');
    setIsFinal(!!s.isFinalStage);
    setBillingEnabled(s.billingEnabled !== false);
    setDescription(s.description || '');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !sequence) return;
    const payload = {
      name,
      sequence: parseInt(sequence, 10),
      description: description || undefined,
      active: true,
      inputUnit: 'PCS',
      billingUnit,
      billingEnabled,
      rateMethod,
      isFinalStage: isFinal,
    };
    if (editStageId) {
      ProcessingService.updateStage(editStageId, payload);
      if (isFinal) {
        sorted.filter(s => s.id !== editStageId && s.isFinalStage).forEach(s => ProcessingService.updateStage(s.id, { isFinalStage: false }));
      }
    } else {
      ProcessingService.addStage(payload);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">Processing Stage Master</h3>
          <p className="text-xs text-muted-foreground">
            Configure the manufacturing chain. Chain order is derived from Sequence — reordering rewires the chain automatically. The final stage (★) produces saleable Finished Goods.
          </p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Stage
        </button>
      </div>

      <DataTable
        data={sorted.map(s => ({ ...s, isFinal: s.isFinalStage ? 'Yes' : 'No', rate: s.rateMethod === 'per_kg' ? 'Per KG' : 'Per PCS', activeLabel: s.active ? 'Active' : 'Inactive' }))}
        columns={[
          { key: 'actions', label: 'Actions', align: 'right', render: (item) => (
            <div className="flex justify-end gap-2">
              <button onClick={() => openEdit(item)} aria-label="Edit stage" className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"><Edit className="h-4 w-4" /></button>
              <button onClick={() => setStageToDelete(item.id)} aria-label="Delete stage" className="p-1.5 hover:bg-destructive/10 text-destructive rounded-md transition-colors" title="Only unused stages can be deleted"><Trash2 className="h-4 w-4" /></button>
            </div>
          )},
          { key: 'sequence', label: '#', sortable: true },
          { key: 'name', label: 'Stage', sortable: true, render: (item) => <span className="font-medium">{item.isFinal === 'Yes' ? '★ ' : ''}{item.name}</span> },
          { key: 'rate', label: 'Billing', sortable: true },
          { key: 'billingUnit', label: 'Billing Unit' },
          { key: 'isFinal', label: 'Final Stage', render: (item) => item.isFinal === 'Yes' ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-muted-foreground">No</span> },
          { key: 'activeLabel', label: 'Status' },
        ]}
        searchKeys={['name']}
        searchPlaceholder="Search stages..."
        persistKey="jobwork-stages-table"
      />

      <PageModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editStageId ? 'Edit Processing Stage' : 'Add Processing Stage'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Stage Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Machine, Acid, Polish" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Sequence</label>
              <input required type="number" min="1" value={sequence} onChange={e => setSequence(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Rate Method</label>
              <select value={rateMethod} onChange={e => setRateMethod(e.target.value as any)} className="w-full rounded-xl border border-border bg-background p-3 text-sm">
                <option value="per_piece">Per Piece</option>
                <option value="per_kg">Per KG</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Billing Unit</label>
            <input value={billingUnit} onChange={e => setBillingUnit(e.target.value)} placeholder="e.g. Per KG" className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-xl border border-border bg-background p-3 text-sm" />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input type="checkbox" checked={billingEnabled} onChange={e => setBillingEnabled(e.target.checked)} className="h-4 w-4" />
              Billing enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} className="h-4 w-4" />
              Final stage (produces Finished Goods)
            </label>
          </div>
          <button type="submit" className="w-full rounded-xl bg-primary p-3 text-primary-foreground font-semibold">
            {editStageId ? 'Save Changes' : 'Add Stage'}
          </button>
        </form>
      </PageModal>

      <AlertDialog open={stageToDelete !== null} onOpenChange={(open) => { if (!open) setStageToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stage?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete this processing stage? Existing batch references will keep their stage name. Only unused stages can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (stageToDelete) { ProcessingService.deleteStage(stageToDelete); setStageToDelete(null); } }}
            >
              Delete Stage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
