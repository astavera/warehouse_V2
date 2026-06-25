import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:w-[var(--width)] group-[.toaster]:rounded-lg group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-background group-[.toaster]:p-3.5 group-[.toaster]:text-foreground group-[.toaster]:shadow-[0_18px_45px_rgba(15,23,42,0.14)]",
          title: "group-[.toast]:font-semibold group-[.toast]:tracking-tight",
          description: "group-[.toast]:text-sm group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-emerald-200 group-[.toaster]:bg-emerald-50 group-[.toaster]:text-foreground",
          error: "group-[.toaster]:border-destructive/20 group-[.toaster]:bg-destructive/10 group-[.toaster]:text-foreground",
          warning: "group-[.toaster]:border-amber-200 group-[.toaster]:bg-amber-50 group-[.toaster]:text-foreground",
          info: "group-[.toaster]:border-sky-200 group-[.toaster]:bg-sky-50 group-[.toaster]:text-foreground",
          closeButton:
            "group-[.toaster]:border-border group-[.toaster]:bg-white group-[.toaster]:text-muted-foreground group-[.toaster]:shadow-sm",
          actionButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-primary group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-md group-[.toast]:bg-muted group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
