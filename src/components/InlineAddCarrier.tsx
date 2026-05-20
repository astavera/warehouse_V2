import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type Carrier = Tables<'carriers'>;

interface Props {
  onAdded: (c: Carrier) => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function InlineAddCarrier({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('custom');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('carriers').insert({
        name: name.trim(),
        carrier_type: type,
      }).select().single();
      if (error) throw error;
      onAdded(data!);
      setName('');
      setOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add carrier'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          <Plus className="w-4 h-4" /> Add Carrier
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add Carrier</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Input placeholder="Carrier name *" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="parcel">Parcel</SelectItem>
              <SelectItem value="freight">Freight</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="touch-target">
            {saving ? 'Saving...' : 'Save Carrier'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
