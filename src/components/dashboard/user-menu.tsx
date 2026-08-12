"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { LogOut, Settings, CreditCard, UserRound, Moon, Sun } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_STORAGE_KEY = "ornigami-theme";

function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("ornigami-theme-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("ornigami-theme-change", onChange);
  };
}

function getThemeSnapshot(): boolean {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
}

function getServerThemeSnapshot(): boolean {
  return false;
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.trim() || "U").replace(/\s+/g, " ");
  const parts = source.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function DashboardUserMenu() {
  const { data } = useSession();
  const userName = data?.user?.name ?? "Account";
  const userEmail = data?.user?.email ?? "";
  const darkMode = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    await signOut({ callbackUrl: "/login" });
  }

  function toggleDarkMode() {
    const nextValue = !darkMode;
    document.documentElement.classList.toggle("dark", nextValue);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextValue ? "dark" : "light");
    window.dispatchEvent(new Event("ornigami-theme-change"));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild id="dashboard-user-menu-trigger">
        <Button
          variant="outline"
          className="h-10 rounded-lg border-border bg-background/90 px-2"
          aria-label="Open user menu"
        >
          <Avatar className="size-7">
            <AvatarImage src={data?.user?.image ?? undefined} alt={userName} />
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(userName, userEmail)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent id="dashboard-user-menu-content" align="end" className="w-56 rounded-lg p-1.5">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="truncate text-sm font-semibold">{userName}</div>
          {userEmail ? <div className="truncate text-xs text-muted-foreground">{userEmail}</div> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2.5 py-2">
          <Link href="/settings">
            <Settings className="size-4" />
            User settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleDarkMode} className="cursor-pointer rounded-md px-2.5 py-2">
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {darkMode ? "Use light mode" : "Use dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2.5 py-2">
          <Link href="/dashboard/billing">
            <CreditCard className="size-4" />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer rounded-md px-2.5 py-2">
          <Link href="/dashboard">
            <UserRound className="size-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void handleSignOut()}
          className="cursor-pointer rounded-md px-2.5 py-2"
          variant="destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
