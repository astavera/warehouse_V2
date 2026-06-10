import { Link } from 'react-router-dom';
import { AlertTriangle, FileSpreadsheet, ReceiptText, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAccountingDashboard } from '@/hooks/useAccountingData';
import { formatAccountingMoney, invoiceFinalAmount, type AccountingInvoice } from '@/lib/accounting';
import {
  AccountingPageHeader,
  EmptyState,
  InvoiceStatusBadges,
  LoadingState,
  MoneyText,
  SummaryCard,
} from './AccountingComponents';

function invoiceChartRows(invoices: AccountingInvoice[] = []) {
  return invoices.map(invoice => {
    const vendor = invoice.accounting_vendors?.name || 'No vendor';
    const invoiceNumber = invoice.invoice_number || 'No invoice';
    return {
      amount: Number(invoiceFinalAmount(invoice)),
      label: `${vendor} - ${invoiceNumber}`.slice(0, 42),
    };
  });
}

function TopInvoiceChartCard({
  fill,
  invoices,
  title,
}: {
  fill: string;
  invoices: AccountingInvoice[] | undefined;
  title: string;
}) {
  const rows = invoiceChartRows(invoices || []);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px]">
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 42, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={value => `$${Number(value) / 1000}k`} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [formatAccountingMoney(value), 'Final amount']} />
              <Bar dataKey="amount" fill={fill} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState label="No invoices in this due window." />
        )}
      </CardContent>
    </Card>
  );
}

export default function AccountingDashboardPage() {
  const { data, isLoading, refetch, isFetching } = useAccountingDashboard();

  if (isLoading) return <LoadingState />;

  const summary = data?.summary;
  const statusChart = [
    { status: 'Pending', count: summary?.pendingCount || 0 },
    { status: 'Paid', count: summary?.paidCount || 0 },
    { status: 'Overdue', count: summary?.overdueCount || 0 },
    { status: 'Credit', count: summary?.creditAppliedCount || 0 },
    { status: 'High', count: summary?.highAmountCount || 0 },
  ];

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Accounting"
        description="Accounts Payable workspace for Modern State invoices, payments, cards, personal bills, truck violations, import history, and AP catalogs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5">
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </Button>
            <Button asChild className="gap-1.5">
              <Link to="/accounting/imports">
                <FileSpreadsheet className="h-4 w-4" />
                Imports
              </Link>
            </Button>
          </div>
        }
      />

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="pending amount" value={<MoneyText value={summary.pendingAmount} />} tone="warning" />
          <SummaryCard label="overdue amount" value={<MoneyText value={summary.overdueAmount} />} tone="danger" />
          <SummaryCard label="due next 7 days" value={<MoneyText value={summary.dueNext7Amount} />} />
          <SummaryCard label="paid this month" value={<MoneyText value={summary.paidThisMonth} />} tone="success" />
          <SummaryCard label="due next 15 days" value={<MoneyText value={summary.dueNext15Amount} />} />
          <SummaryCard label="due next 30 days" value={<MoneyText value={summary.dueNext30Amount} />} />
          <SummaryCard label="total credit applied" value={<MoneyText value={summary.totalCreditApplied} />} />
          <SummaryCard label="high amount invoices" value={summary.highAmountCount} tone="danger" />
        </div>
      ) : (
        <EmptyState label="No accounting summary is available yet." />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="h-4 w-4 text-primary" />
              Invoice status
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value: number) => [value, 'Invoices']} />
                <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Latest import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data?.latestImport ? (
              <>
                <div>
                  <div className="font-medium">{data.latestImport.source_file_name}</div>
                  <div className="text-muted-foreground">
                    {new Date(data.latestImport.imported_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border bg-muted/20 p-2">
                    <div className="font-semibold">{data.latestImport.rows_processed}</div>
                    <div className="text-xs text-muted-foreground">processed</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2">
                    <div className="font-semibold">{data.latestImport.rows_inserted}</div>
                    <div className="text-xs text-muted-foreground">inserted</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2">
                    <div className="font-semibold">{data.latestImport.warnings_count}</div>
                    <div className="text-xs text-muted-foreground">warnings</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-muted-foreground">No import has been recorded yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TopInvoiceChartCard
          fill="#ef4444"
          invoices={data?.highAmountDue30Invoices}
          title="Highest invoices due next 30 days"
        />
        <TopInvoiceChartCard
          fill="#2563eb"
          invoices={data?.highAmountDue90Invoices}
          title="Highest invoices due next 3 months"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open AP by vendor</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.vendorBalances?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Total owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.vendorBalances.map(row => (
                    <TableRow key={row.vendorId || row.vendorName}>
                      <TableCell className="font-medium">{row.vendorName}</TableCell>
                      <TableCell className="text-right">{row.invoiceCount}</TableCell>
                      <TableCell className="text-right font-semibold"><MoneyText value={row.totalAmount} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label="No open vendor balances found." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              High amount invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.highAmountInvoices?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.highAmountInvoices.map(invoice => (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.accounting_vendors?.name || '-'}</TableCell>
                      <TableCell>{invoice.invoice_number || '-'}</TableCell>
                      <TableCell><InvoiceStatusBadges invoice={invoice} /></TableCell>
                      <TableCell className="text-right font-medium">{formatAccountingMoney(invoiceFinalAmount(invoice))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label="No high amount invoices found." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent payments</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentPayments?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentPayments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.accounting_vendors?.name || '-'}</TableCell>
                      <TableCell>{payment.payment_date || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{payment.accounting_payment_methods?.name || payment.status || 'Payment'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium"><MoneyText value={payment.amount_paid} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState label="No recent payments found." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
