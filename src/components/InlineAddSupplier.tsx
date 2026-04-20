import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Supplier = Tables<'suppliers'>;

interface Props {
  onAdded: (s: Supplier) => void;
  defaultName?: string;
}

export default function InlineAddSupplier({ onAdded, defaultName = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('suppliers').insert({
        name: name.trim(),
        code: code.trim() || name.trim().substring(0, 4).toUpperCase(),
      }).select().single();
      if (error) throw error;
      onAdded(data!);
      setName('');
      setCode('');
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && defaultName) setName(defaultName); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          <Plus className="w-4 h-4" /> Add Supplier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add Supplier</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Input placeholder="Supplier name *" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <Input placeholder="Code (optional)" value={code} onChange={e => setCode(e.target.value)} />
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="touch-target">
            {saving ? 'Saving...' : 'Save Supplier'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
