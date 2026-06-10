import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function AccountingImportsPage() {
  const { data, isLoading } = useAccountingImports();
  const { importTemplate } = useAccountingImportMutations();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lastParsed, setLastParsed] = useState<AccountingTemplateImport | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
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
                Upload accepts .xlsx files from this template. Rows are matched by file name, sheet, and row number.
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
