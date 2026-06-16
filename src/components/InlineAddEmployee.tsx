import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { createEmployeeAccess } from '@/hooks/useEmployeeAdmin';
import { defaultModulesForRole } from '@/lib/permissions';

type Employee = Tables<'employees'>;

interface Props {
  onAdded: (e: Employee) => void;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function InlineAddEmployee({ onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || passcode.length !== 4) return;
    setSaving(true);
    try {
      const result = await createEmployeeAccess({
        name: name.trim(),
        passcode,
        permissions: defaultModulesForRole('warehouse'),
        role: 'warehouse',
        storeNumber: null,
      });
      setName('');
      setPasscode('');
      setOpen(false);
      onAdded(result.employee);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add receiver'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          <Plus className="w-4 h-4" /> Add Receiver
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Receiver</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Input placeholder="Full name *" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4-digit passcode"
            value={passcode}
            onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <Button onClick={handleSave} disabled={!name.trim() || passcode.length !== 4 || saving} className="touch-target">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
