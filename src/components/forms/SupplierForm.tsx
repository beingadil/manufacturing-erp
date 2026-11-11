/**
 * The supplier form — the exact same fields the Suppliers module renders.
 * Used inside the module's modal and, inline, on the purchase entry page so a
 * buyer can add a vendor without leaving the document they are writing.
 */
import { MapPin, Truck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { useERPStore } from '../../store/useERPStore';
import type { Supplier } from '../../types/erp';
import { FormField } from '../form/FormField';
import { FormColumns } from '../form/FormColumns';
import { FormFooter } from '../form/FormFooter';
import { FormGrid } from '../form/FormGrid';
import { FormSection } from '../form/FormSection';
import { formInputClass } from '../form/formStyles';

export interface SupplierFormProps {
  /** Edit mode when a supplier is supplied; add mode otherwise. */
  supplier?: Supplier | null;
  /** Called with the saved supplier id so the caller can select it. */
  onSaved: (id: string) => void;
  onCancel: () => void;
  /** Id of the <form>. Pass it when the save button lives OUTSIDE the form —
   *  e.g. in a modal's footer slot, which is a sibling of the scroll area.
   *  The `form` attribute re-associates the button with the form. */
  formId?: string;
  /** Set false when the caller supplies its own footer (modal footer slot). */
  showFooter?: boolean;
}

export function SupplierForm({ supplier, onSaved, onCancel, formId, showFooter = true }: SupplierFormProps) {
  const { addSupplier, updateSupplier } = useERPStore();

  const [name, setName] = useState(supplier?.name ?? '');
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [ntn, setNtn] = useState(supplier?.ntn ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data = { name, contactPerson, phone, email, address, ntn, notes };

    try {
      if (supplier) {
        updateSupplier(supplier.id, data);
        toast.success('Supplier updated successfully');
        onSaved(supplier.id);
      } else {
        const id = addSupplier(data);
        toast.success('Supplier created successfully');
        onSaved(id);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save supplier');
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <FormColumns>
      <FormSection icon={<Truck className="h-5 w-5" />} eyebrow="Details" first>
        <FormGrid cols={2}>
          <FormField id="supplier-name" label="Supplier Name" required className="sm:col-span-2">
            <input
              id="supplier-name"
              name="supplier-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="off"
              className={formInputClass}
              placeholder="Al-Rehman Steel (Pvt) Ltd"
            />
          </FormField>
          <FormField id="supplier-contact" label="Contact Person">
            <input
              id="supplier-contact"
              name="supplier-contact"
              type="text"
              value={contactPerson}
              onChange={e => setContactPerson(e.target.value)}
              autoComplete="off"
              className={formInputClass}
            />
          </FormField>
          <FormField id="supplier-phone" label="Phone">
            <input
              id="supplier-phone"
              name="supplier-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={formInputClass}
            />
          </FormField>
          <FormField id="supplier-ntn" label="NTN Number">
            <input
              id="supplier-ntn"
              name="supplier-ntn"
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={ntn}
              onChange={e => setNtn(e.target.value)}
              className={formInputClass}
            />
          </FormField>
          <FormField id="supplier-email" label="Email">
            <input
              id="supplier-email"
              name="supplier-email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={formInputClass}
            />
          </FormField>
        </FormGrid>
      </FormSection>
      <FormSection icon={<MapPin className="h-5 w-5" />} eyebrow="Address & notes" first>
        <FormGrid cols={1}>
          <FormField id="supplier-address" label="Address">
            <textarea
              id="supplier-address"
              name="supplier-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              rows={3}
              autoComplete="off"
              className={formInputClass}
            />
          </FormField>
          <FormField id="supplier-notes" label="Notes">
            <textarea
              id="supplier-notes"
              name="supplier-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              autoComplete="off"
              className={formInputClass}
            />
          </FormField>
        </FormGrid>
      </FormSection>
      </FormColumns>
      {showFooter && (
        <FormFooter
          className="sticky bottom-0 -mb-5"
          onCancel={onCancel}
          submitLabel={supplier ? 'Save Changes' : 'Add Supplier'}
        />
      )}
    </form>
  );
}
