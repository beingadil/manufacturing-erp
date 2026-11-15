// src/components/settings/CompanyPrintTab.tsx
// Settings tab: company identity + document (PDF/print) layout settings.
//
// This page is the SINGLE SOURCE for what lands on paper. Everything the
// shared print engine (src/lib/print/printSettings.ts) reads comes from here:
//
//   updateCompanySettings({ name, address, phone, email, website, taxNumber })  -> company identity
//   setBranding({ logo: dataUrl })                                             -> document logo
//   updateDocumentSettings({ defaultOrientation })                             -> page orientation
//   updateDocumentSettings({ footerText })                                     -> footer note
//   updateDocumentSettings({ showSignatureDisclaimer })                        -> disclaimer
//   updateDocumentSettings({ currency, currencyFractionDigits, numberLocale, dateFormat })
//                                                                              -> how money and dates are printed
//   setBranding({ primaryColor })                                              -> accent colour
//
// No Save footer: changes persist immediately via the store setters.
//
// The "What will be printed" panel at the bottom reads the SAME settings
// object the engine reads — so what the user sees there is what comes out.

import { FileText, Image as ImageIcon, Layout, Printer } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { generateEnterpriseDocument } from "@/lib/pdfEngine";
import { getPrintSettings } from "@/lib/print/printSettings";
import { cn } from "@/lib/utils";
import { useERPStore } from "@/store/useERPStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { CompanySettings, DocumentSettings } from "@/types/erp";
import { useShallow } from 'zustand/react/shallow';

type IdentityField = Extract<
  keyof CompanySettings,
  "name" | "address" | "phone" | "email" | "website" | "taxNumber"
>;

const CURRENCIES = [
  { code: "PKR", label: "PKR — Pakistani Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
];

const LOCALES = [
  { code: "en-PK", label: "en-PK — Pakistan (1,23,456)" },
  { code: "en-US", label: "en-US — United States (1,234,456)" },
  { code: "en-GB", label: "en-GB — United Kingdom (1,234,456)" },
  { code: "de-DE", label: "de-DE — Germany (1.234.456)" },
  { code: "ar-AE", label: "ar-AE — UAE (1,234,456)" },
];

const DATE_FORMATS = [
  { code: "dd-MMM-yyyy", label: "12-Nov-2026" },
  { code: "yyyy-MM-dd", label: "2026-11-12" },
  { code: "dd/MM/yyyy", label: "12/11/2026" },
  { code: "MM/dd/yyyy", label: "11/12/2026" },
  { code: "dd MMMM yyyy", label: "12 November 2026" },
];

export function CompanyPrintTab() {
  const { companySettings, updateCompanySettings, documentSettings, updateDocumentSettings } = useERPStore(useShallow(s => ({ companySettings: s.companySettings, updateCompanySettings: s.updateCompanySettings, documentSettings: s.documentSettings, updateDocumentSettings: s.updateDocumentSettings })));
  const { logo, primaryColor, setBranding } = useSettingsStore(useShallow(s => ({ logo: s.logo, primaryColor: s.primaryColor, setBranding: s.setBranding })));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [printingSample, setPrintingSample] = useState(false);

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
    if (file.size > 2 * 1024 * 1024) return toast.error("Please upload a valid image file (max 2MB)");
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

  /** Prints a one-page sample so the user can see the result before real use. */
  const printSample = async () => {
    setPrintingSample(true);
    try {
      await generateEnterpriseDocument({
        title: "Sample Statement",
        subtitle: "This is how your printed documents will look",
        filters: [
          { label: "Account", value: "1001 — Cash in Hand" },
          { label: "Period", value: "All Time" },
        ],
        tables: [
          {
            columns: [
              { header: "Date", dataKey: "date", format: "date" },
              { header: "Reference", dataKey: "reference" },
              { header: "Description", dataKey: "description" },
              { header: "Debit", dataKey: "debit", align: "right", format: "currency" },
              { header: "Credit", dataKey: "credit", align: "right", format: "currency" },
              { header: "Balance", dataKey: "balance", align: "right", format: "currency" },
            ],
            rows: [
              { date: "2026-11-12", reference: "JV-0128", description: "Opening entry", debit: 120000, credit: 0, balance: 120000 },
              { date: "2026-11-13", reference: "JV-0129", description: "Sales receipt", debit: 0, credit: 45000, balance: 75000 },
            ],
            summaryRows: [
              { description: "TOTAL PERIOD ACTIVITY", debit: 120000, credit: 45000 },
              { description: "CLOSING BALANCE", balance: 75000 },
            ],
          },
        ],
        action: 'print',
      });
    } catch {
      toast.error("Sample failed", { description: "Could not generate the sample document." });
    } finally {
      setPrintingSample(false);
    }
  };

  // The SAME settings object the print engine reads — so this panel is a
  // truthful preview, not a second source of truth.
  const effective = useMemo(() => {
    try {
      return getPrintSettings();
    } catch {
      return null;
    }
  }, [companySettings, documentSettings, logo, primaryColor]);

  const inputClass =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors";

  const selectClass =
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
              { id: "name", label: "Company Name", type: "text", placeholder: "Your company name" },
              { id: "address", label: "Address", type: "text", placeholder: "123 Industrial Area" },
              { id: "phone", label: "Phone", type: "tel", placeholder: "+92 300 1234567" },
              { id: "email", label: "Email", type: "email", placeholder: "info@example.com" },
              { id: "website", label: "Website", type: "url", placeholder: "www.example.com" },
              { id: "taxNumber", label: "Tax Number", type: "text", placeholder: "NTN-0000000" },
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

        {/* ── Number & date formatting ── */}
        <div className="space-y-6 pt-2 border-t border-border/50">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Numbers &amp; Dates
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="print-currency" className="text-sm font-semibold text-foreground">
                Currency
              </label>
              <select
                id="print-currency"
                value={documentSettings.currency ?? 'PKR'}
                onChange={(e) => updateDocumentSettings({ currency: e.target.value })}
                className={selectClass}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="print-decimals" className="text-sm font-semibold text-foreground">
                Decimal Places
              </label>
              <select
                id="print-decimals"
                value={String(documentSettings.currencyFractionDigits ?? 2)}
                onChange={(e) => updateDocumentSettings({ currencyFractionDigits: Number(e.target.value) })}
                className={selectClass}
              >
                <option value="0">0 — whole amounts (Rs 1,235)</option>
                <option value="2">2 — with paisa (Rs 1,234.56)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="print-locale" className="text-sm font-semibold text-foreground">
                Number Format
              </label>
              <select
                id="print-locale"
                value={documentSettings.numberLocale ?? 'en-PK'}
                onChange={(e) => updateDocumentSettings({ numberLocale: e.target.value })}
                className={selectClass}
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="print-date-format" className="text-sm font-semibold text-foreground">
                Date Format
              </label>
              <select
                id="print-date-format"
                value={documentSettings.dateFormat ?? 'dd-MMM-yyyy'}
                onChange={(e) => updateDocumentSettings({ dateFormat: e.target.value })}
                className={selectClass}
              >
                {DATE_FORMATS.map((d) => (
                  <option key={d.code} value={d.code}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Applied to every printed document — invoices, vouchers, statements and reports.
          </p>
        </div>

        {/* ── Live preview line ── */}
        <div className="p-4 rounded-lg border border-border/50 bg-muted/10">
          <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">
            <Layout className="h-4 w-4 text-muted-foreground shrink-0" />
            Printed documents will use:{" "}
            <span className="font-semibold">{effective?.company.name}</span>{" "}
            ·{" "}
            <span className="font-semibold">{effective?.document.orientation}</span>{" "}
            · Logo:{ " "}
            <span
              className={cn("font-semibold", logo ? "text-primary" : "text-muted-foreground")}
            >
              {logo ? "shown" : "hidden"}
            </span>
            {" · "}
            <span className="font-semibold">
              {effective?.output.currency} · {effective?.output.dateFormat}
            </span>
          </p>
        </div>

        {/* ── Print a sample ── */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
          <button
            onClick={printSample}
            disabled={printingSample}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {printingSample ? "Preparing…" : "Print a sample statement"}
          </button>
          <p className="text-xs text-muted-foreground">
            Opens a one-page sample with your company identity, logo, colours and number format — check it before printing for real.
          </p>
        </div>
      </div>
    </div>
  );
}
