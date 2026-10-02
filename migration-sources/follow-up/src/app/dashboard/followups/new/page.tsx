"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Button, buttonStyles } from "@/components/followups/button";
import { Input } from "@/components/followups/input";
import { FollowupsNav } from "@/components/followups/followups-nav";
import { PageHeader } from "@/components/followups/page-header";

const EMPTY_FORM = {
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  service_name: "",
  visited_at: "",
};

export default function NewVisitPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSaved(false);
    setSaving(true);

    try {
      const res = await fetch("/api/followups/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "We couldn't save that visit. Try again in a moment.");
        return;
      }

      setForm(EMPTY_FORM);
      setMessage("Visit saved.");
      setSaved(true);
    } catch {
      setMessage("We couldn't save that visit. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Add a visit" description="Add a recent customer visit so the follow-up workflow can begin." backToOverview />
      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border-[1.5px] border-border bg-card p-6 text-sm text-muted-foreground shadow-ink-sm">
        <label className="block space-y-1.5">
          <span className="font-medium text-primary">Customer name</span>
          <Input placeholder="Jane Smith" value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="font-medium text-primary">Email or phone</span>
          <Input placeholder="jane@example.com" value={form.customer_email} onChange={(event) => setForm({ ...form, customer_email: event.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="font-medium text-primary">Phone (optional)</span>
          <Input placeholder="555 0100" value={form.customer_phone} onChange={(event) => setForm({ ...form, customer_phone: event.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="font-medium text-primary">Service name (optional)</span>
          <Input placeholder="Haircut" value={form.service_name} onChange={(event) => setForm({ ...form, service_name: event.target.value })} />
        </label>
        <label className="block space-y-1.5">
          <span className="font-medium text-primary">Visit date</span>
          <Input type="datetime-local" value={form.visited_at} onChange={(event) => setForm({ ...form, visited_at: event.target.value })} required />
          <span className="block text-xs text-muted-foreground">Choose a visit time more than 23 hours ago so it can be scheduled.</span>
        </label>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save visit"}</Button>
        {message ? <p className="rounded-xl border-[1.5px] border-border bg-surface px-3 py-2 text-sm text-foreground">{message}</p> : null}
        {saved ? (
          <div className="flex flex-wrap gap-3 text-sm">
            <Button type="button" variant="outline" onClick={() => { setMessage(""); setSaved(false); }}>Add another visit</Button>
            <Link href="/dashboard/followups" className={buttonStyles("outline")}>Back to overview</Link>
          </div>
        ) : null}
      </form>
    </div>
  );
}
