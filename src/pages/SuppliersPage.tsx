import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Plus, Upload, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useSuppliers } from '@/hooks/useSupabaseData';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getSupplierCode(name: string, code: string | null) {
  if (code?.trim()) return code.trim();
  return (
    name
      .split(/\s+/)
      .map(part => part[0] || '')
      .join('')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4) || 'N/A'
  );
}

export default function SuppliersPage() {
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvDuplicates, setCsvDuplicates] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const q = search.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q));
  }, [suppliers, search]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await addSupplier({
        name: name.trim(),
        code: code.trim() || name.trim().substring(0, 4).toUpperCase(),
        contact_name: contact || null,
        phone: phone || null,
        email: email || null,
      });
      setName(''); setCode(''); setContact(''); setPhone(''); setEmail('');
      setAddOpen(false);
      toast.success('Supplier added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add supplier'));
    }
  };

  const toggleActive = async (s: typeof suppliers[0]) => {
    try {
      await updateSupplier(s.id, { active: !s.active });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update supplier'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSupplier(id);
      toast.success('Supplier deleted');
    } catch (err) {
      const errorMessage = getErrorMessage(err, 'Failed to delete supplier');
      const message = errorMessage.toLowerCase().includes('foreign key')
        ? 'Supplier cannot be deleted because it is already used in received items.'
        : errorMessage;
      toast.error(message);
    }
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split('\n').map(r => r.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
      // Check duplicates
      const headers = rows[0]?.map(h => h.toLowerCase()) || [];
      const nameIdx = headers.findIndex(h => h.includes('name'));
      const dupes = new Set<number>();
      if (nameIdx >= 0) {
        const existingNames = new Set(suppliers.map(s => s.name.toLowerCase()));
        for (let i = 1; i < rows.length; i++) {
          const n = rows[i]?.[nameIdx]?.trim().toLowerCase();
          if (n && existingNames.has(n)) dupes.add(i);
        }
      }
      setCsvDuplicates(dupes);
      setCsvPreview(rows);
      setCsvOpen(true);
    };
    reader.readAsText(file);
  };

  const importCsv = async (skipDuplicates: boolean) => {
    if (csvPreview.length < 2) return;
    const headers = csvPreview[0].map(h => h.toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const codeIdx = headers.findIndex(h => h.includes('code'));
    const contactIdx = headers.findIndex(h => h.includes('contact'));
    const phoneIdx = headers.findIndex(h => h.includes('phone'));
    const emailIdx = headers.findIndex(h => h.includes('email'));

    if (nameIdx === -1) { toast.error('CSV must have a "name" column'); return; }

    setImporting(true);
    let count = 0;
    for (let i = 1; i < csvPreview.length; i++) {
      if (skipDuplicates && csvDuplicates.has(i)) continue;
      const row = csvPreview[i];
      const n = row[nameIdx]?.trim();
      if (!n) continue;
      try {
        await addSupplier({
          name: n,
          code: (codeIdx >= 0 ? row[codeIdx]?.trim() : '') || n.substring(0, 4).toUpperCase(),
          contact_name: contactIdx >= 0 ? row[contactIdx]?.trim() || null : null,
          phone: phoneIdx >= 0 ? row[phoneIdx]?.trim() || null : null,
          email: emailIdx >= 0 ? row[emailIdx]?.trim() || null : null,
        });
        count++;
      } catch { /* skip errors */ }
    }
    setCsvOpen(false);
    setCsvPreview([]);
    setImporting(false);
    toast.success(`Imported ${count} supplier(s)`);
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <div className="flex gap-2">
          <label>
            <Button variant="outline" className="gap-1.5 touch-target" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleCsvFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 touch-target"><Plus className="w-4 h-4" /> Add Supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
              <div className="flex flex-col gap-3 pt-2">
                <div><Label>Name *</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
                <div><Label>Code</Label><Input className="mt-1" value={code} onChange={e => setCode(e.target.value)} placeholder="Auto-generated if empty" /></div>
                <div><Label>Contact</Label><Input className="mt-1" value={contact} onChange={e => setContact(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Phone</Label><Input className="mt-1" value={phone} onChange={e => setPhone(e.target.value)} /></div>
                  <div><Label>Email</Label><Input className="mt-1" value={email} onChange={e => setEmail(e.target.value)} /></div>
                </div>
                <Button onClick={handleAdd} disabled={!name.trim()} className="touch-target">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* CSV preview dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>CSV Preview</DialogTitle></DialogHeader>
          {csvPreview.length > 0 && (
            <div className="max-h-64 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>{csvPreview[0].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {csvPreview.slice(1, 11).map((row, i) => (
                    <TableRow key={i} className={csvDuplicates.has(i + 1) ? 'bg-warning/10' : ''}>
                      {row.map((c, j) => <TableCell key={j}>{c}</TableCell>)}
                      {csvDuplicates.has(i + 1) && <TableCell className="text-warning text-xs">Duplicate</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {csvPreview.length - 1} rows found (showing first 10)
            {csvDuplicates.size > 0 && <span className="text-warning ml-1">• {csvDuplicates.size} duplicates detected</span>}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => importCsv(true)} className="touch-target flex-1" disabled={importing}>
              {importing ? 'Importing...' : `Import (skip ${csvDuplicates.size} duplicates)`}
            </Button>
            {csvDuplicates.size > 0 && (
              <Button variant="outline" onClick={() => importCsv(false)} className="touch-target" disabled={importing}>
                Import All
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 touch-target" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[96px] text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{getSupplierCode(s.name, s.code)}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.contact_name || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{s.phone || '—'}</TableCell>
                  <TableCell><Switch checked={s.active} onCheckedChange={() => toggleActive(s)} /></TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${s.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove <strong>{s.name}</strong> if it is not already referenced by received items.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(s.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No suppliers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
