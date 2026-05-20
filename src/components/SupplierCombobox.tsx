import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Supplier = Tables<'suppliers'>;

interface Props {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string) => void;
  onSupplierAdded: (s: Supplier) => void;
  invalid?: boolean;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SupplierCombobox({ suppliers, value, onChange, onSupplierAdded, invalid = false }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = suppliers.find(s => s.id === value);

  const filtered = useMemo(() => {
    if (!query) return suppliers.filter(s => s.active).slice(0, 8);
    const q = query.toLowerCase();
    return suppliers.filter(s => s.active && (s.name.toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q)));
  }, [query, suppliers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCreateSupplier = (name = '') => {
    setNewName(name.trim());
    setNewCode('');
    setOpen(false);
    setAddOpen(true);
  };

  const handleCreateSupplier = async () => {
    const normalizedName = newName.trim();
    if (!normalizedName) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          name: normalizedName,
          code: newCode.trim() || normalizedName.substring(0, 4).toUpperCase(),
          active: true,
        })
        .select()
        .single();

      if (error) throw error;
      onSupplierAdded(data!);
      onChange(data!.id);
      setQuery('');
      setNewName('');
      setNewCode('');
      setAddOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add supplier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative w-full">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <Input
          placeholder="Search supplier..."
          value={open ? query : (selected?.name || query)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className={cn('h-10 rounded-lg bg-white touch-target', invalid && 'border-destructive/40 focus-visible:ring-destructive/40')}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 gap-1 rounded-lg border border-border bg-white px-3 text-primary shadow-sm hover:bg-muted"
          onClick={() => openCreateSupplier(query || selected?.name || '')}
        >
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>
      {open && (
        <div className="absolute left-0 top-full z-[80] mt-1 max-h-72 min-w-full w-[min(440px,calc(100vw-2rem))] overflow-auto rounded-lg border bg-popover shadow-xl">
          {filtered.length === 0 ? (
            <div className="space-y-2 p-3 text-sm text-muted-foreground">
              <p>No suppliers found</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center rounded-lg border border-primary/20 bg-primary/8 text-primary hover:bg-primary/12"
                onClick={() => openCreateSupplier(query)}
              >
                <Plus className="mr-1 h-4 w-4" />
                {query ? `Create "${query}"` : 'Create supplier'}
              </Button>
            </div>
          ) : (
            <>
              {query.trim() && (
                <div className="border-b p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center rounded-md bg-primary/8 text-primary hover:bg-primary/12"
                    onClick={() => openCreateSupplier(query)}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Create "{query}"
                  </Button>
                </div>
              )}
              {filtered.map(s => (
                <button
                  key={s.id}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors touch-target hover:bg-muted',
                    value === s.id && 'bg-primary/10 text-primary font-medium'
                  )}
                  onClick={() => { onChange(s.id); setQuery(''); setOpen(false); }}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.code}</span>
                </button>
              ))}
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-primary"
                  onClick={() => openCreateSupplier(query)}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add new supplier
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="space-y-1.5">
              <Label>Supplier name *</Label>
              <Input placeholder="Supplier name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input placeholder="Optional" value={newCode} onChange={e => setNewCode(e.target.value)} />
            </div>
            <Button onClick={handleCreateSupplier} disabled={!newName.trim() || saving} className="touch-target">
              {saving ? 'Saving...' : 'Save and select supplier'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
