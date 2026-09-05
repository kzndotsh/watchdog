import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";

import { Providers } from "@/shared/layout/providers";
import { Button } from "@/shared/ui/shadcn/button";
import { Toaster } from "@/shared/ui/shadcn/sonner";
import { TooltipProvider } from "@/shared/ui/shadcn/tooltip";

import appCss from "../styles.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export interface RouterContext {
  queryClient: QueryClient;
  allowSignup?: boolean;
}

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-4 py-12">
      <div className="bg-card text-card-foreground flex flex-col gap-4 rounded-lg border p-6 shadow-sm sm:p-8">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
          404
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Page not found
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          That URL is not part of Watchdog. Check the path, or head back to the
          dashboard.
        </p>
        <Button nativeButton={false} render={<Link to="/" />}>
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* XSS-safe static theme bootstrap — no user input */}
        <script suppressHydrationWarning>{THEME_INIT_SCRIPT}</script>
        <HeadContent />
      </head>
      <body className="selection:bg-primary/20 font-sans [overflow-wrap:anywhere] antialiased">
        <Providers>
          <TooltipProvider delay={500}>{children}</TooltipProvider>
        </Providers>
        <Toaster richColors closeButton />
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Watchdog",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});
