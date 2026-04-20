import { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import InlineAddSupplier from './InlineAddSupplier';
import type { Tables } from '@/integrations/supabase/types';

type Supplier = Tables<'suppliers'>;

interface Props {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string) => void;
  onSupplierAdded: (s: Supplier) => void;
}

export default function SupplierCombobox({ suppliers, value, onChange, onSupplierAdded }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Search supplier..."
        value={open ? query : (selected?.name || query)}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="touch-target"
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              No suppliers found
              <InlineAddSupplier defaultName={query} onAdded={(s) => { onSupplierAdded(s); onChange(s.id); setOpen(false); setQuery(''); }} />
            </div>
          ) : (
            <>
              {filtered.map(s => (
                <button
                  key={s.id}
                  className={cn(
                    'w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors touch-target flex justify-between items-center',
                    value === s.id && 'bg-primary/10 text-primary font-medium'
                  )}
                  onClick={() => { onChange(s.id); setQuery(''); setOpen(false); }}
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.code}</span>
                </button>
              ))}
              <div className="border-t p-1">
                <InlineAddSupplier defaultName={query} onAdded={(s) => { onSupplierAdded(s); onChange(s.id); setOpen(false); setQuery(''); }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
