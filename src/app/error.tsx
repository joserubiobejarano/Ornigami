"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="flex min-h-[70vh] items-center justify-center px-6 py-20"><div className="max-w-md text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-tint-peach text-3xl" aria-hidden="true">◇</div><h1 className="mt-6 text-3xl font-extrabold text-primary">Something folded the wrong way.</h1><p className="mt-3 text-muted-foreground">An error on our end — we&apos;ve been notified. Try again in a moment.</p><div className="mt-7 flex justify-center gap-3"><Button type="button" variant="accent" onClick={reset}>Try again</Button><Button variant="secondary" asChild><Link href="/">Go home</Link></Button></div></div></main>; }
