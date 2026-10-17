"use client";

import { useAuth, useSignOut } from "@better-auth-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@watchdog/ui/components/spinner";

export interface SignOutProps {
  className?: string;
}

/**
 * Signs the current user out on mount and renders a centered spinner while the operation completes.
 *
 * @param className - Optional additional class names appended to the root element
 * @returns The spinner shown during sign-out
 */
export function SignOut({ className }: SignOutProps) {
  const { authClient, basePaths, navigate, viewPaths } = useAuth();
  const queryClient = useQueryClient();

  // Sign-out navigates in place, so the router keeps its QueryClient: drop every cached
  // answer, or the next account to sign in on this tab is first shown this one's data.
  const leave = () => {
    queryClient.clear();
    navigate({
      to: `${basePaths.auth}/${viewPaths.auth.signIn}`,
      replace: true,
    });
  };
  const { mutate: signOut } = useSignOut(authClient, {
    onError: leave,
    onSuccess: leave,
  });

  const hasSignedOut = useRef(false);

  useEffect(() => {
    if (hasSignedOut.current) return;
    hasSignedOut.current = true;

    signOut();
  }, [signOut]);

  return <Spinner className={cn("mx-auto my-auto", className)} />;
}
