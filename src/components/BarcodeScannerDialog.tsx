import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BarcodeScannerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (barcode: string) => void;
  labels: {
    title: string;
    hint: string;
    close: string;
    permissionError: string;
    notFoundError: string;
    startError: string;
  };
};

function scannerErrorMessage(error: unknown, labels: BarcodeScannerDialogProps['labels']) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return labels.permissionError;
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return labels.notFoundError;
  }
  return labels.startError;
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onDetected,
  labels,
}: BarcodeScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      handledRef.current = false;
      setStarting(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const startScanner = async () => {
      const video = videoRef.current;
      if (!video) return;

      setStarting(true);
      setError(null);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          video,
          result => {
            const text = result?.getText().trim();
            if (!text || handledRef.current) return;
            handledRef.current = true;
            controlsRef.current?.stop();
            onDetected(text);
            onOpenChange(false);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) setError(scannerErrorMessage(err, labels));
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [labels, onDetected, onOpenChange, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {labels.title}
          </DialogTitle>
          <DialogDescription>{labels.hint}</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg border bg-black">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
          />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.85)]" />
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {labels.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
