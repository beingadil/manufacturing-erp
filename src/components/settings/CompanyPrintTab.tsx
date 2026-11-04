// src/components/settings/CompanyPrintTab.tsx
// Settings tab: company identity + document (PDF/print) layout settings.
//
// Writes straight into the stores — companySettings/documentSettings via
// useERPStore, logo/primaryColor via useSettingsStore — so the shared print
// engine (src/lib/print/printSettings.ts) picks them up on the next render.
//
// Store mapping:
//   updateCompanySettings({ name, address, phone, email, website, taxNumber })   -> PrintSettings.company
//   setBranding({ logo: dataUrl })                                              -> PrintSettings.branding.logoDataUrl
//   updateDocumentSettings({ defaultOrientation })                              -> PrintSettings.document.orientation
//   updateDocumentSettings({ footerText })                                      -> PrintSettings.document.footerText
//   updateDocumentSettings({ showSignatureDisclaimer })                         -> PrintSettings.document.showSignatureDisclaimer
//   setBranding({ primaryColor })                                               -> PrintSettings.document.accentColor
//
// No Save footer: changes persist immediately via the store setters.

import { FileText, Image as ImageIcon, Layout } from "lucide-react";
import React, { useRef } from "react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useERPStore } from "@/store/useERPStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { cn } from "@/lib/utils";
import { CompanySettings, DocumentSettings } from "@/types/erp";

type IdentityField = Extract<
  keyof CompanySettings,
  "name" | "address" | "phone" | "email" | "website" | "taxNumber"
>;

export function CompanyPrintTab() {
  const {
    companySettings,
    updateCompanySettings,
    documentSettings,
    updateDocumentSettings,
  } = useERPStore();
  const { logo, primaryColor, setBranding } = useSettingsStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const setIdentity = (field: IdentityField) => (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCompanySettings({ [field]: e.target.value });
  };

  const handleOrientation = (orientation: DocumentSettings["defaultOrientation"]) => () => {
    updateDocumentSettings({ defaultOrientation: orientation });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please upload a valid image file");
    if (file.size > 2 * 1024 * 1024) return toast.error("File size must be less than 2MB");
    const reader = new FileReader();
    reader.onloadend = () => setBranding({ logo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleFooter = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateDocumentSettings({ footerText: e.target.value });
  };

  const handleAccent = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBranding({ primaryColor: e.target.value });
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors";

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="p-6 border-b border-border/50 bg-muted/40 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-foreground leading-tight">Print &amp; PDF Settings</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Company identity, document layout, and branding embedded in printed documents (invoices, vouchers, reports).
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* ── Company identity ── */}
        <div className="space-y-6 pt-2 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Company Identity
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { id: "name", label: "Company Name", type: "text", placeholder: "W-RAW ERP" },
              { id: "address", label: "Address", type: "text", placeholder: "123 Industrial Area" },
              { id: "phone", label: "Phone", type: "tel", placeholder: "+1 234 567 8900" },
              { id: "email", label: "Email", type: "email", placeholder: "info@example.com" },
              { id: "website", label: "Website", type: "url", placeholder: "www.example.com" },
              { id: "taxNumber", label: "Tax Number", type: "text", placeholder: "TAX-000000" },
            ].map((field) => (
              <div key={field.id} className="space-y-2">
                <label htmlFor={`print-${field.id}`} className="text-sm font-semibold text-foreground">
                  {field.label}
                </label>
                <input
                  id={`print-${field.id}`}
                  type={field.type}
                  value={companySettings[field.id as IdentityField]}
                  onChange={setIdentity(field.id as IdentityField)}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Logo ── */}
        <div className="space-y-6 pt-2 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Document Logo
          </h4>
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className={cn(
              "h-32 w-80 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden relative",
            )}>
              {logo ? (
                <img src={logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center w-full text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                  <span className="text-xs font-medium">No Logo Uploaded</span>
                </div>
              )}
            </div>

            <div className="space-y-4 flex-1">
              <div className="flex flex-wrap gap-3">
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleLogoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Upload Logo
                </button>
                {logo && (
                  <button
                    onClick={() => setBranding({ logo: null })}
                    className="px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  >
                    Remove Logo
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                PNG or JPEG, max 2MB. Stored as a base64 data URL and embedded in every PDF.
              </p>
            </div>
          </div>
        </div>

        {/* ── Document layout ── */}
        <div className="space-y-6 pt-2 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Document Layout
          </h4>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Default Orientation</label>
            <div className="flex gap-1 bg-border/50 rounded-xl p-0.5">
              {(["Portrait", "Landscape"] as const).map((orientation) => (
                <button
                  key={orientation}
                  type="button"
                  role="radio"
                  aria-pressed={documentSettings.defaultOrientation === orientation}
                  onClick={handleOrientation(orientation)}
                  className={cn(
                    "flex-1 py-2.5 text-xs font-medium rounded-lg transition-colors capitalize",
                    documentSettings.defaultOrientation === orientation
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {orientation}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="print-footer-text" className="text-sm font-semibold text-foreground">
              Footer Text
            </label>
            <textarea
              id="print-footer-text"
              rows={3}
              value={documentSettings.footerText}
              onChange={handleFooter}
              className={inputClass.replace("py-3", "py-2.5")}
              placeholder="e.g. This document is computer generated and does not require a signature."
            />
            <p className="text-xs text-muted-foreground">
              Printed at the bottom of every document page.
            </p>
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20">
            <div>
              <p className="font-semibold text-sm text-foreground">Signature Disclaimer</p>
              <p className="text-xs text-muted-foreground mt-1">
                Append "This document does not require a signature." to the document footer.
              </p>
            </div>
            <ToggleSwitch
              checked={documentSettings.showSignatureDisclaimer}
              onChange={(checked) =>
                updateDocumentSettings({ showSignatureDisclaimer: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Accent Color</label>
            <div className="flex gap-3 items-center">
              <input
                type="color"
                value={primaryColor}
                onChange={handleAccent}
                className="h-10 w-20 rounded cursor-pointer border-0 p-0"
              />
              <code className="text-xs bg-muted px-2 py-1 rounded">{primaryColor}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              PDF highlight color (shared with the dashboard brand primary color).
            </p>
          </div>
        </div>

        {/* ── Live preview line ── */}
        <div className="p-4 rounded-lg border border-border/50 bg-muted/10">
          <p className="text-sm text-foreground flex items-center gap-2">
            <Layout className="h-4 w-4 text-muted-foreground shrink-0" />
            Printed documents will use:{" "}
            <span className="font-semibold">{companySettings.name}</span>{" "}
            ·{" "}
            <span className="font-semibold">{documentSettings.defaultOrientation}</span>{" "}
            · Logo:{ " "}
            <span
              className={cn("font-semibold", logo ? "text-primary" : "text-muted-foreground")}
            >
              {logo ? "shown" : "hidden"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
