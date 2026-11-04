import { Plus, Package, FileText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormModal } from './FormModal';
import { FormFooter } from './FormFooter';
import { FormSection } from './FormSection';
import { FormGrid } from './FormGrid';
import { FormField } from './FormField';
import { formInputClass } from './formStyles';

/**
 * Tiny usage demo of the form-design primitives kit (not wired to any page).
 * Renders a widened master-data modal using FormModal + FormSection +
 * FormGrid + FormField + FormFooter. Behavior is demo-only (toast + close).
 */
export function FormDemo() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Open demo form
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast.success('Saved successfully');
          setIsOpen(false);
        }}
      >
        <FormModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Add Material"
          icon={<Package />}
          description="Create a new raw material record."
          size="lg"
          footer={<FormFooter onCancel={() => setIsOpen(false)} />}
        >
          <FormSection icon={<Package />} eyebrow="Identity" first description="Core identifying fields.">
            <FormGrid cols={2}>
              <FormField id="name" label="Name" required hint="e.g. Cold-rolled steel">
                <input id="name" className={formInputClass} defaultValue="" required />
              </FormField>
              <FormField id="category" label="Category" hint="Pre-selected on new materials in this category.">
                <select id="category" className={formInputClass} defaultValue="">
                  <option value="">None</option>
                  <option value="metals">Metals</option>
                  <option value="plastics">Plastics</option>
                  <option value="chemicals">Chemicals</option>
                </select>
              </FormField>
            </FormGrid>
          </FormSection>
          <FormSection icon={<FileText />} eyebrow="Details" description="Additional information.">
            <FormField id="description" label="Description" hint="Stored with the material record.">
              <textarea id="description" className={formInputClass} defaultValue="" rows={3} />
            </FormField>
          </FormSection>
        </FormModal>
      </form>
    </div>
  );
}
