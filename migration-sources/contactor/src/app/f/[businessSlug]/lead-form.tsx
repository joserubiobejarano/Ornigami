"use client";

import { useState } from "react";

type LeadFormProps = {
  businessSlug: string;
  preferredChannel: "sms" | "whatsapp";
};

type SubmissionStatus = "idle" | "loading" | "success" | "error";

type SubmitFormApiResponse = {
  ok: boolean;
  error?: string;
  data?: {
    accepted?: boolean;
    blockedReason?: "honeypot" | "rate_limited";
  };
};

export function LeadForm({
  businessSlug,
  preferredChannel,
}: LeadFormProps) {
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    setStatus("loading");
    setError("");

    const payload = {
      businessSlug,
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      message: String(formData.get("message") ?? ""),
      honeypot: String(formData.get("honeypot") ?? ""),
      source: "hosted_form",
    };

    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as SubmitFormApiResponse | null;

      if (!response.ok) {
        setStatus("error");
        setError(body?.error ?? "Unable to submit inquiry.");
        return;
      }

      if (!body?.data?.accepted) {
        setStatus("error");
        setError(
          body?.data?.blockedReason === "rate_limited"
            ? "Too many attempts. Please wait a moment and try again."
            : "Unable to submit inquiry.",
        );
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setError("Unexpected error while submitting inquiry.");
    }
  }

  if (status === "success") {
    const successMessage =
      preferredChannel === "whatsapp"
        ? "Thanks - your request has been received. We've sent you a WhatsApp message to continue the conversation."
        : preferredChannel === "sms"
          ? "Thanks - your request has been received. We've sent you a text message to continue the conversation."
          : "Thanks - your request has been received. We've sent you a message to continue the conversation.";

    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-lg font-semibold">Thanks for reaching out</h2>
        <p className="mt-2 text-sm">{successMessage}</p>
      </section>
    );
  }

  return (
    <form action={onSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Full name</span>
        <input
          name="fullName"
          required
          autoComplete="name"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>
      <label className="grid gap-1 text-sm md:col-span-1">
        <span className="font-medium text-slate-700">Phone number</span>
        <input
          name="phone"
          required
          autoComplete="tel"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Email (optional)</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">How can we help?</span>
        <textarea
          name="message"
          required
          rows={4}
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
        />
      </label>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="honeypot">Leave this field empty</label>
        <input
          id="honeypot"
          name="honeypot"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 sm:w-fit"
      >
        {status === "loading" ? "Submitting..." : "Submit Inquiry"}
      </button>

      {status === "error" ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
