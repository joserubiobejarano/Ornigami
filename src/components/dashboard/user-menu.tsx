"use client";

import Link from "next/link";
import { LogOut, Settings, CreditCard, UserRound, Moon } from "lucide-react";
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

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    await signOut({ callbackUrl: "/login" });
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
        <DropdownMenuItem onSelect={() => document.documentElement.classList.toggle("dark")} className="cursor-pointer rounded-md px-2.5 py-2">
          <Moon className="size-4" />
          Toggle dark mode
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
