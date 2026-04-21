import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
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
import { useCarriers } from '@/hooks/useSupabaseData';
import CarrierBadge from '@/components/CarrierBadge';

export default function CarriersPage() {
  const { carriers, loading, addCarrier, updateCarrier, deleteCarrier } = useCarriers();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('parcel');

  const handleAdd = async () => {
    if (!name.trim()) return;
    try {
      await addCarrier({ name: name.trim(), carrier_type: type });
      setName('');
      setAddOpen(false);
      toast.success('Carrier added');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleActive = async (c: typeof carriers[0]) => {
    try {
      await updateCarrier(c.id, { active: !c.active });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update carrier');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCarrier(id);
      toast.success('Carrier deleted');
    } catch (err: any) {
      const message = err.message?.toLowerCase().includes('foreign key')
        ? 'Carrier cannot be deleted because it is already used in received batches.'
        : err.message || 'Failed to delete carrier';
      toast.error(message);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Carriers</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 touch-target"><Plus className="w-4 h-4" /> Add Carrier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Carrier</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <div><Label>Name *</Label><Input className="mt-1" value={name} onChange={e => setName(e.target.value)} /></div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parcel">Parcel</SelectItem>
                    <SelectItem value="freight">Freight</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={!name.trim()} className="touch-target">Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[96px] text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carriers.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <CarrierBadge name={c.name} size="sm" />
                      <span>{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{c.carrier_type}</TableCell>
                  <TableCell><Switch checked={c.active} onCheckedChange={() => toggleActive(c)} /></TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete carrier?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove <strong>{c.name}</strong> if it is not already referenced by received batches.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(c.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {carriers.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No carriers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
