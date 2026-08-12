"use client";

import { FormEvent, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NewVisitPayload = {
  customer_name: string;
  customer_email: string;
  service_name: string;
};

const initialState: NewVisitPayload = {
  customer_name: "",
  customer_email: "",
  service_name: ""
};

export default function ReviewBoosterNewVisitPage() {
  const [form, setForm] = useState<NewVisitPayload>(initialState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          customer_phone: "",
          visited_at: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Failed to create visit.");
      } else {
        setMessage("Visit created.");
        setForm(initialState);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create visit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader title="Add Completed Visit" backToOverview />
      <form
        onSubmit={onSubmit}
        className="w-full space-y-5 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm"
      >
        <label className="block space-y-1">
          <span className="font-medium text-primary">Customer name</span>
          <Input
            value={form.customer_name}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
            placeholder="Jane Smith"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Customer email</span>
          <Input
            type="email"
            required
            value={form.customer_email}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_email: e.target.value }))}
            placeholder="jane@example.com"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-medium text-primary">Service name (optional)</span>
          <Input
            value={form.service_name}
            onChange={(e) => setForm((prev) => ({ ...prev, service_name: e.target.value }))}
            placeholder="Haircut"
          />
        </label>

        <Button
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Visit"}
        </Button>
        {message ? <p className="text-foreground">{message}</p> : null}
      </form>
    </div>
  );
}
