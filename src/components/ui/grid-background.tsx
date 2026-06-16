import { cn } from '@/lib/utils';

export function GridBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('absolute inset-0 z-0 bg-white', className)}
      style={{
        background: 'white',
        backgroundImage: `
          linear-gradient(to right, rgba(71,85,105,0.15) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(71,85,105,0.15) 1px, transparent 1px),
          radial-gradient(circle at 50% 60%, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.05) 40%, transparent 70%)
        `,
        backgroundSize: '40px 40px, 40px 40px, 100% 100%',
      }}
    />
  );
}

export const Component = () => {
  return (
    <div className="relative min-h-screen w-full bg-white">
      <GridBackground />
    </div>
  );
};
