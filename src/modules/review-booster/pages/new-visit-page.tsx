"use client";

import { FormEvent, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NewVisitPayload = {
  customer_name: string;
  customer_email: string;
  visited_at: string;
  permission_source: string;
  permission_at: string;
  permission_notice_version: string;
};

const today = new Date().toISOString().slice(0, 10);
const initialState: NewVisitPayload = {
  customer_name: "",
  customer_email: "",
  visited_at: today,
  permission_source: "",
  permission_at: "",
  permission_notice_version: "",
};

export default function ReviewBoosterNewVisitPage() {
  const [form, setForm] = useState<NewVisitPayload>(initialState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!permissionConfirmed) {
      setMessage("Confirm the customer's permission to receive a review request.");
      return;
    }
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/review-booster/visits", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...form,
          visited_at: form.visited_at,
          permission_at: new Date(form.permission_at).toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "We couldn't save that visit. Try again in a moment.");
      } else {
        setMessage("Visit saved.");
        setForm(initialState);
        setPermissionConfirmed(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't save that visit. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Add a visit" description="Record a completed visit and the customer's permission to receive a review request by email." backToOverview />
      <form
        onSubmit={onSubmit}
        className="w-full space-y-5 rounded-2xl border-[1.5px] border-border bg-card p-6 text-sm text-muted-foreground shadow-ink-sm"
      >
        <label className="block space-y-1">
          <span className="font-medium text-primary">First name (optional)</span>
          <Input
            value={form.customer_name}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
            placeholder="Jane"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Email</span>
          <Input
            type="email"
            required
            value={form.customer_email}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_email: e.target.value }))}
            placeholder="jane@example.com"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Visit date</span>
          <Input
            type="date"
            required
            value={form.visited_at}
            onChange={(e) => setForm((prev) => ({ ...prev, visited_at: e.target.value }))}
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Permission source</span>
          <Input
            required
            maxLength={120}
            value={form.permission_source}
            onChange={(e) => setForm((prev) => ({ ...prev, permission_source: e.target.value }))}
            placeholder="Booking form review-request opt-in"
          />
          <span className="block text-xs">Where the customer agreed to receive review requests by email. Keep the original evidence in your records.</span>
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Permission given at</span>
          <Input type="datetime-local" required value={form.permission_at}
            onChange={(e) => setForm((prev) => ({ ...prev, permission_at: e.target.value }))} />
          <span className="block text-xs">Enter the actual time in your local timezone.</span>
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Permission notice version</span>
          <Input required maxLength={80} value={form.permission_notice_version}
            onChange={(e) => setForm((prev) => ({ ...prev, permission_notice_version: e.target.value }))}
            placeholder="review-request-v1" />
          <span className="block text-xs">Identify the notice the customer saw when giving permission.</span>
        </label>

        <label className="flex items-start gap-3 text-foreground">
          <input type="checkbox" required checked={permissionConfirmed}
            onChange={(e) => setPermissionConfirmed(e.target.checked)} className="mt-1" />
          <span>I have evidence that this customer agreed to receive a review request by email at this address. This permission has not been withdrawn.</span>
        </label>

        <Button
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save visit"}
        </Button>
        <p className="text-xs">Visit dates use UTC. Do not add phone numbers, health information or treatment notes. Saving a visit does not send email immediately. Scheduled runs may send eligible visits when permission, timing, settings, and allowance permit.</p>
        {message ? <p className="text-foreground">{message}</p> : null}
      </form>
    </div>
  );
}
