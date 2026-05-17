"use client";

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-controls";

const BUSINESS_TYPES = [
  "Restaurant",
  "Dental clinic",
  "Medical clinic",
  "Gym",
  "Salon",
  "Retail store",
  "Home services",
];

const TONES = ["warm and friendly", "professional", "casual", "grateful"] as const;

const CLIENT_LIMIT_KEY = "publicDemoReviewBoosterSends";
const CLIENT_LIMIT_MAX = 2;

type ApiSuccess = { ok: true; subject: string; body: string };

type ApiError = { error: string };

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getClientDailyCount() {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(CLIENT_LIMIT_KEY);
  if (!raw) return 0;

  try {
    const parsed = JSON.parse(raw) as { day: string; count: number };
    if (parsed.day !== getTodayKey()) return 0;
    return parsed.count;
  } catch {
    return 0;
  }
}

function incrementClientDailyCount() {
  if (typeof window === "undefined") return;
  const next = getClientDailyCount() + 1;
  localStorage.setItem(CLIENT_LIMIT_KEY, JSON.stringify({ day: getTodayKey(), count: next }));
}

export function PublicReviewBoosterDemoPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiSuccess | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [city, setCity] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("warm and friendly");

  const remaining = useMemo(() => Math.max(0, CLIENT_LIMIT_MAX - getClientDailyCount()), [result]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (getClientDailyCount() >= CLIENT_LIMIT_MAX) {
      setError("You have reached the demo send limit for today on this browser.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/public-demo/review-booster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          business_type: businessType || null,
          city: city || null,
          customer_name: customerName || null,
          recipient_email: recipientEmail,
          google_review_url: googleReviewUrl || null,
          tone,
        }),
      });

      const json = (await response.json()) as ApiSuccess | ApiError;
      if (!response.ok) {
        setError((json as ApiError).error || "Failed to send demo email.");
        return;
      }

      incrementClientDailyCount();
      setResult(json as ApiSuccess);
    } catch {
      setError("Failed to send demo email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Public Review Booster Demo</CardTitle>
          <CardDescription>
            Send yourself one sample post-visit follow-up email. This is a demo flow and does not create
            business records or automations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">Remaining sends today on this browser: {remaining}</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business_name">Business name</Label>
                <Input id="business_name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipient_email">Recipient email</Label>
                <Input id="recipient_email" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} required maxLength={254} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_type">Business type</Label>
                <select id="business_type" className={nativeSelectClassName} value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                  <option value="">Select (optional)</option>
                  {BUSINESS_TYPES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer name</Label>
                <Input id="customer_name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <select id="tone" className={nativeSelectClassName} value={tone} onChange={(e) => setTone(e.target.value as (typeof TONES)[number])}>
                  {TONES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="google_review_url">Google review URL</Label>
                <Input id="google_review_url" type="url" value={googleReviewUrl} onChange={(e) => setGoogleReviewUrl(e.target.value)} maxLength={500} />
              </div>
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send me a sample follow-up email"}
            </Button>
          </form>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          {result ? (
            <Card className="mt-6 border-emerald-300 bg-emerald-50/50">
              <CardHeader>
                <CardTitle className="text-base">Demo email sent</CardTitle>
                <CardDescription>
                  Preview shown below. This is a demo email.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs uppercase text-slate-500">Subject</p>
                  <p className="text-sm font-medium">{result.subject}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Body</p>
                  <pre className="whitespace-pre-wrap rounded border bg-white p-3 text-sm">{result.body}</pre>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
