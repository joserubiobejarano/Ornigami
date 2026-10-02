"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/followups/button";
import { Input, Select } from "@/components/followups/input";
import { FollowupsNav } from "@/components/followups/followups-nav";
import { PageHeader } from "@/components/followups/page-header";

type Business = {
  name: string;
  business_type?: string;
  city?: string;
  google_review_url: string;
  rebooking_url?: string;
  tone?: string;
  language?: string;
  email_from_name?: string;
};

const EMPTY_BUSINESS: Business = {
  name: "",
  business_type: "",
  city: "",
  google_review_url: "",
  rebooking_url: "",
  tone: "warm and friendly",
  language: "en",
  email_from_name: "",
};

export default function FollowupSettingsPage() {
  const [form, setForm] = useState<Business>(EMPTY_BUSINESS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/followups/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.business) setForm({ ...EMPTY_BUSINESS, ...data.business });
      } catch {
        setMessage("We couldn't load your settings. Try again in a moment.");
        setMessageType("error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setMessageType(null);
    setSaving(true);

    try {
      const res = await fetch("/api/followups/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage("Settings saved.");
      setMessageType("success");
    } catch {
      setMessage("We couldn't save your changes. Try again in a moment.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto w-full max-w-4xl space-y-6 p-6"><FollowupsNav /><div className="rounded-2xl border-[1.5px] border-border bg-card p-6 text-sm text-muted-foreground shadow-ink-sm">Loading...</div></div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Settings" description="Set the business details and review link used by your follow-up messages." backToOverview />
      {!form.google_review_url ? (
        <section className="rounded-2xl border-[1.5px] border-accent-marigold/35 bg-tint-butter p-4 text-sm text-primary shadow-ink-sm">
          Add your Google review URL before sending follow-ups.
        </section>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm">
        <section className="space-y-4">
          <div><h2 className="text-xl font-semibold text-primary">Business details</h2><p className="mt-1 text-sm text-muted-foreground">This context helps each follow-up feel like it came from your business.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5"><span className="font-medium text-primary">Business name</span><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label className="block space-y-1.5"><span className="font-medium text-primary">Business type</span><Input value={form.business_type || ""} onChange={(event) => setForm({ ...form, business_type: event.target.value })} placeholder="Salon, clinic, gym..." /></label>
            <label className="block space-y-1.5 sm:col-span-2"><span className="font-medium text-primary">City</span><Input value={form.city || ""} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Madrid" /></label>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <div><h2 className="text-xl font-semibold text-primary">Review link</h2><p className="mt-1 text-sm text-muted-foreground">Use the direct Google Maps link that opens the review form.</p></div>
          <label className="block space-y-1.5"><span className="font-medium text-primary">Google review URL</span><Input type="url" value={form.google_review_url} onChange={(event) => setForm({ ...form, google_review_url: event.target.value })} required placeholder="https://g.page/..." /></label>
          <label className="block space-y-1.5"><span className="font-medium text-primary">Rebooking URL (optional)</span><Input type="url" value={form.rebooking_url || ""} onChange={(event) => setForm({ ...form, rebooking_url: event.target.value })} placeholder="https://..." /></label>
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <div><h2 className="text-xl font-semibold text-primary">Reply tone</h2><p className="mt-1 text-sm text-muted-foreground">Choose the tone and language for your follow-up messages.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5"><span className="font-medium text-primary">Tone</span><Select value={form.tone || "warm and friendly"} onChange={(event) => setForm({ ...form, tone: event.target.value })}><option value="warm and friendly">Warm and friendly</option><option value="professional">Professional</option><option value="casual">Casual</option><option value="elegant">Elegant</option><option value="short and direct">Short and direct</option></Select></label>
            <label className="block space-y-1.5"><span className="font-medium text-primary">Language</span><Select value={form.language || "en"} onChange={(event) => setForm({ ...form, language: event.target.value })}><option value="en">English</option><option value="es">Spanish</option></Select></label>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <div><h2 className="text-xl font-semibold text-primary">Notifications</h2><p className="mt-1 text-sm text-muted-foreground">Choose where customer replies should be directed.</p></div>
          <label className="block space-y-1.5"><span className="font-medium text-primary">Reply-to email</span><Input type="email" value={form.email_from_name || ""} onChange={(event) => setForm({ ...form, email_from_name: event.target.value })} placeholder="you@example.com" /></label>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          {message ? <p className={`rounded-xl border-[1.5px] px-3 py-2 text-sm ${messageType === "success" ? "border-accent-green/35 bg-tint-mint text-primary" : "border-destructive/35 bg-destructive/10 text-destructive"}`}>{message}</p> : null}
        </div>
      </form>
    </div>
  );
}
