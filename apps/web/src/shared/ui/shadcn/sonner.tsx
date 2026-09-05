// @ts-nocheck — shadcn vendor; excluded from project checks
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function useDocumentTheme(): NonNullable<ToasterProps["theme"]> {
  const [theme, setTheme] =
    useState<NonNullable<ToasterProps["theme"]>>("system");

  useEffect(() => {
    const root = document.documentElement;

    const read = () => {
      if (root.classList.contains("dark")) {
        setTheme("dark");
        return;
      }
      if (root.classList.contains("light")) {
        setTheme("light");
        return;
      }
      setTheme("system");
    };

    read();

    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          /* richColors — match status badge tints, not Sonner’s neon defaults */
          "--success-bg": "var(--status-succeeded-bg)",
          "--success-border":
            "color-mix(in oklab, var(--status-succeeded) 35%, transparent)",
          "--success-text": "var(--status-succeeded-fg)",
          "--info-bg": "var(--status-running-bg)",
          "--info-border":
            "color-mix(in oklab, var(--status-running) 35%, transparent)",
          "--info-text": "var(--status-running-fg)",
          "--warning-bg": "var(--status-pending-bg)",
          "--warning-border":
            "color-mix(in oklab, var(--status-pending) 35%, transparent)",
          "--warning-text": "var(--status-pending-fg)",
          "--error-bg": "var(--status-failed-bg)",
          "--error-border":
            "color-mix(in oklab, var(--status-failed) 35%, transparent)",
          "--error-text": "var(--status-failed-fg)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
