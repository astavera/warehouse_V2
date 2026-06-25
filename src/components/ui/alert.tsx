import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex w-full items-stretch gap-2 rounded-lg', {
  variants: {
    variant: {
      default: '',
      secondary: '',
      primary: '',
      destructive: '',
      success: '',
      info: '',
      mono: '',
      warning: '',
    },
    icon: {
      primary: '',
      destructive: '',
      success: '',
      info: '',
      warning: '',
    },
    appearance: {
      solid: '',
      outline: '',
      light: '',
      stroke: 'text-foreground',
    },
    size: {
      lg: 'p-4 gap-3 text-base [&_[data-slot=alert-icon]>svg]:h-6 [&_[data-slot=alert-icon]>svg]:w-6 [&_[data-slot=alert-icon]]:mt-0.5 [&_[data-slot=alert-close]]:mt-1',
      md: 'p-3.5 gap-2.5 text-sm [&_[data-slot=alert-icon]>svg]:h-5 [&_[data-slot=alert-icon]>svg]:w-5 [&_[data-slot=alert-icon]]:mt-0 [&_[data-slot=alert-close]]:mt-0.5',
      sm: 'px-3 py-2.5 gap-2 text-xs [&_[data-slot=alert-icon]>svg]:h-4 [&_[data-slot=alert-icon]>svg]:w-4 [&_[data-slot=alert-icon]]:mt-0.5',
    },
  },
  compoundVariants: [
    {
      variant: 'default',
      appearance: 'solid',
      className: 'border border-border bg-background text-foreground shadow-sm',
    },
    {
      variant: 'secondary',
      appearance: 'solid',
      className: 'bg-muted text-foreground shadow-sm',
    },
    {
      variant: 'primary',
      appearance: 'solid',
      className: 'bg-primary text-primary-foreground shadow-sm',
    },
    {
      variant: 'destructive',
      appearance: 'solid',
      className: 'bg-destructive text-destructive-foreground shadow-sm',
    },
    {
      variant: 'success',
      appearance: 'solid',
      className: 'bg-emerald-500 text-white shadow-sm',
    },
    {
      variant: 'info',
      appearance: 'solid',
      className: 'bg-sky-600 text-white shadow-sm',
    },
    {
      variant: 'warning',
      appearance: 'solid',
      className: 'bg-amber-500 text-white shadow-sm',
    },
    {
      variant: 'mono',
      appearance: 'solid',
      className: 'bg-zinc-950 text-white shadow-sm',
    },
    {
      variant: 'default',
      appearance: 'outline',
      className: 'border border-border bg-background text-foreground shadow-sm',
    },
    {
      variant: 'secondary',
      appearance: 'outline',
      className: 'border border-border bg-background text-foreground shadow-sm',
    },
    {
      variant: 'primary',
      appearance: 'outline',
      className: 'border border-border bg-background text-primary shadow-sm',
    },
    {
      variant: 'destructive',
      appearance: 'outline',
      className: 'border border-border bg-background text-destructive shadow-sm',
    },
    {
      variant: 'success',
      appearance: 'outline',
      className: 'border border-border bg-background text-emerald-600 shadow-sm',
    },
    {
      variant: 'info',
      appearance: 'outline',
      className: 'border border-border bg-background text-sky-600 shadow-sm',
    },
    {
      variant: 'warning',
      appearance: 'outline',
      className: 'border border-border bg-background text-amber-600 shadow-sm',
    },
    {
      variant: 'mono',
      appearance: 'outline',
      className: 'border border-border bg-background text-foreground shadow-sm',
    },
    {
      variant: 'default',
      appearance: 'light',
      className: 'border border-border bg-muted/45 text-foreground shadow-sm',
    },
    {
      variant: 'secondary',
      appearance: 'light',
      className: 'border border-border bg-muted/60 text-foreground shadow-sm',
    },
    {
      variant: 'primary',
      appearance: 'light',
      className: 'border border-primary/15 bg-primary/10 text-foreground shadow-sm [&_[data-slot=alert-icon]]:text-primary',
    },
    {
      variant: 'destructive',
      appearance: 'light',
      className:
        'border border-destructive/20 bg-destructive/10 text-foreground shadow-sm [&_[data-slot=alert-icon]]:text-destructive',
    },
    {
      variant: 'success',
      appearance: 'light',
      className: 'border border-emerald-200 bg-emerald-50 text-foreground shadow-sm [&_[data-slot=alert-icon]]:text-emerald-600',
    },
    {
      variant: 'info',
      appearance: 'light',
      className: 'border border-sky-200 bg-sky-50 text-foreground shadow-sm [&_[data-slot=alert-icon]]:text-sky-600',
    },
    {
      variant: 'warning',
      appearance: 'light',
      className: 'border border-amber-200 bg-amber-50 text-foreground shadow-sm [&_[data-slot=alert-icon]]:text-amber-600',
    },
    {
      variant: 'mono',
      icon: 'primary',
      className: '[&_[data-slot=alert-icon]]:text-primary',
    },
    {
      variant: 'mono',
      icon: 'warning',
      className: '[&_[data-slot=alert-icon]]:text-amber-500',
    },
    {
      variant: 'mono',
      icon: 'success',
      className: '[&_[data-slot=alert-icon]]:text-emerald-500',
    },
    {
      variant: 'mono',
      icon: 'destructive',
      className: '[&_[data-slot=alert-icon]]:text-destructive',
    },
    {
      variant: 'mono',
      icon: 'info',
      className: '[&_[data-slot=alert-icon]]:text-sky-500',
    },
  ],
  defaultVariants: {
    variant: 'default',
    appearance: 'light',
    size: 'md',
  },
});

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  close?: boolean;
  onClose?: () => void;
}

type AlertIconProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, size, icon, appearance, close = false, onClose, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant, size, icon, appearance }), className)}
      {...props}
    >
      {children}
      {close && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label="Dismiss"
          data-slot="alert-close"
          className="h-5 w-5 shrink-0 rounded-md p-0 text-current opacity-60 hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} data-slot="alert-title" className={cn('font-semibold tracking-tight', className)} {...props} />
  )
);
AlertTitle.displayName = 'AlertTitle';

const AlertIcon = React.forwardRef<HTMLDivElement, AlertIconProps>(({ children, className, ...props }, ref) => (
  <div ref={ref} data-slot="alert-icon" className={cn('shrink-0', className)} {...props}>
    {children}
  </div>
));
AlertIcon.displayName = 'AlertIcon';

const AlertToolbar = React.forwardRef<HTMLDivElement, AlertIconProps>(({ children, className, ...props }, ref) => (
  <div ref={ref} data-slot="alert-toolbar" className={cn('shrink-0', className)} {...props}>
    {children}
  </div>
));
AlertToolbar.displayName = 'AlertToolbar';

const AlertDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-description"
      className={cn('text-sm text-muted-foreground [&_p]:mb-2 [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

const AlertContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="alert-content"
      className={cn('grow space-y-1.5 [&_[data-slot=alert-title]]:font-semibold', className)}
      {...props}
    />
  )
);
AlertContent.displayName = 'AlertContent';

export { Alert, AlertContent, AlertDescription, AlertIcon, AlertTitle, AlertToolbar };
