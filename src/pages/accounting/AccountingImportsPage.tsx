import { useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, FileSpreadsheet, ListChecks, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAccountingImportMutations, useAccountingImports } from '@/hooks/useAccountingData';
import {
  accountingTemplateRowCounts,
  downloadAccountingImportTemplate,
  parseAccountingTemplateFile,
  type AccountingTemplateImport,
} from '@/lib/accountingExcel';
import { AccountingPageHeader, EmptyState, LoadingState } from './AccountingComponents';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const IMPORT_FLOW_STEPS = [
  {
    title: 'Download template',
    detail: 'Creates the current .xlsx with the sheets and example rows the importer expects.',
  },
  {
    title: 'Fill the sheets',
    detail: 'Catalog tabs can be filled first, then invoices, payments, personal bills, and truck rows.',
  },
  {
    title: 'Upload Excel',
    detail: 'The importer reads each non-empty row, normalizes dates and money, then reports warnings by sheet and row.',
  },
  {
    title: 'Refresh Accounting',
    detail: 'Rows are saved with source metadata so repeat imports update the same source row instead of duplicating it.',
  },
] as const;

const IMPORT_SHEET_MAP = [
  {
    sheet: 'Vendors',
    fills: 'Vendor catalog',
    fields: 'Vendor Name, address, contact, account #, default payment method, terms days',
    note: 'Matched by vendor name and reused by invoice and payment rows.',
  },
  {
    sheet: 'Credit Cards',
    fills: 'Cards/accounts catalog',
    fields: 'Card Name, Store, Brand / Bank, Last 4, Active',
    note: 'Creates selectable cards/accounts for paid invoices and card payments.',
  },
  {
    sheet: 'Pending Invoices',
    fills: 'Invoices',
    fields: 'Vendor, Store, Invoice #, Due Date, Issue Date, Amount, Credit, Category, Status',
    note: 'Credit Amount reduces the final amount to pay.',
  },
  {
    sheet: 'Paid Invoices',
    fills: 'Paid invoice rows',
    fields: 'Vendor, Invoice Number(s), Payment Date, Amount Paid, Method, Account, Check/Reference',
    note: 'One payment row can include multiple invoice numbers separated by new lines.',
  },
  {
    sheet: 'Credit Card Payments',
    fills: 'Card payment ledger',
    fields: 'Credit Card, Payment Date, Amount, Confirmation, Status, Notes',
    note: 'Tracks statement/card payments separately from vendor invoice payments.',
  },
  {
    sheet: 'Personal Bills',
    fills: 'Personal bills',
    fields: 'Concept, Payment Method, Payment Date, Amount, Status, Notes',
    note: 'Uses Concept as the bill name. Older Bill Name files still import.',
  },
  {
    sheet: 'Truck',
    fills: 'Truck ledger',
    fields: 'Violation #, Violation Date, Description, Amount, Receipt, Method, Paid Amount',
    note: 'Repeated violation numbers are flagged as possible duplicates.',
  },
] as const;

const IMPORT_RULES = [
  'Dates should use YYYY-MM-DD.',
  'Money should be plain numbers, like 1250.50.',
  'Rows match by file hash, sheet, and row number.',
  'Every imported row keeps source file, row hash, import batch, and raw payload.',
] as const;

export default function AccountingImportsPage() {
  const { data, isLoading } = useAccountingImports();
  const { importTemplate } = useAccountingImportMutations();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lastParsed, setLastParsed] = useState<AccountingTemplateImport | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);
  const batches = data?.batches || [];
  const warnings = data?.warnings || [];

  if (isLoading) return <LoadingState />;

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadAccountingImportTemplate();
      toast.success('Accounting import template downloaded');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not generate template'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const importFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Please upload an .xlsx file generated from the template.');
      return;
    }
    try {
      const parsed = await parseAccountingTemplateFile(file);
      setLastParsed(parsed);
      const counts = accountingTemplateRowCounts(parsed);
      await importTemplate.mutateAsync(parsed);
      toast.success(`Imported ${counts.invoices + counts.payments + counts.creditCardPayments + counts.personalBills + counts.truckViolations} accounting rows`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Excel import failed'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const lastCounts = lastParsed ? accountingTemplateRowCounts(lastParsed) : null;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Imports"
        description="Download the beta Excel template, fill it, and upload it here to refresh accounting data."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Beta Excel importer
            <Badge variant="secondary">Beta</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-sm text-muted-foreground">
                Use the generated template to keep vendor names, cards, invoices, payments, personal bills, and truck rows consistent.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload accepts .xlsx files from this template. Rows are matched by file hash, sheet, and row number.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloadingTemplate} className="gap-1.5">
                {downloadingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download template
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} disabled={importTemplate.isPending} className="gap-1.5">
                {importTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload Excel
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>
          </div>

          {lastCounts && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.vendors}</div><div className="text-xs text-muted-foreground">vendors</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.accounts}</div><div className="text-xs text-muted-foreground">cards/accounts</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.invoices}</div><div className="text-xs text-muted-foreground">invoices</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.payments}</div><div className="text-xs text-muted-foreground">paid rows</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.creditCardPayments}</div><div className="text-xs text-muted-foreground">card payments</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.truckViolations}</div><div className="text-xs text-muted-foreground">truck rows</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-lg font-semibold">{lastCounts.warnings}</div><div className="text-xs text-muted-foreground">warnings</div></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Collapsible open={showTemplateGuide} onOpenChange={setShowTemplateGuide}>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-primary" />
                What the template fills
              </CardTitle>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showTemplateGuide ? 'rotate-180' : ''}`} />
                  {showTemplateGuide ? 'Hide guide' : 'Open guide'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-5 pt-0">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {IMPORT_FLOW_STEPS.map((step, index) => (
                  <div key={step.title} className="border-l pl-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Step {index + 1}</div>
                    <div className="font-medium">{step.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{step.detail}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table className="min-w-[1040px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template sheet</TableHead>
                      <TableHead>Fills</TableHead>
                      <TableHead>Main columns</TableHead>
                      <TableHead>Import behavior</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {IMPORT_SHEET_MAP.map(row => (
                      <TableRow key={row.sheet}>
                        <TableCell className="font-medium">{row.sheet}</TableCell>
                        <TableCell>{row.fills}</TableCell>
                        <TableCell className="text-muted-foreground">{row.fields}</TableCell>
                        <TableCell className="text-muted-foreground">{row.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 2xl:grid-cols-4">
                {IMPORT_RULES.map(rule => (
                  <div key={rule} className="border-l border-primary/40 pl-3">{rule}</div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Import batches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Imported at</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Inserted</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Warnings</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map(batch => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div className="font-medium">{batch.source_file_name}</div>
                      <div className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">{batch.source_file_sha256}</div>
                    </TableCell>
                    <TableCell>{new Date(batch.imported_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                    <TableCell className="text-right">{batch.rows_processed}</TableCell>
                    <TableCell className="text-right">{batch.rows_inserted}</TableCell>
                    <TableCell className="text-right">{batch.rows_updated}</TableCell>
                    <TableCell className="text-right">{batch.rows_skipped}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={batch.warnings_count > 0 ? 'secondary' : 'outline'}>{batch.warnings_count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={batch.errors_count > 0 ? 'destructive' : 'outline'}>{batch.errors_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No import batches have been recorded yet." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Import warnings
            <Badge variant="secondary">{warnings.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {warnings.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Row</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warnings.slice(0, 200).map(warning => (
                  <TableRow key={warning.id}>
                    <TableCell>{warning.source_sheet || '-'}</TableCell>
                    <TableCell>{warning.source_row || '-'}</TableCell>
                    <TableCell><Badge variant="outline">{warning.code}</Badge></TableCell>
                    <TableCell>{warning.message}</TableCell>
                    <TableCell>{new Date(warning.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No import warnings found." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
