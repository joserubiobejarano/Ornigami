"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const sendError = "We couldn't send that just now. Check your connection and try again, or email us at support@ornigami.com.";

export function ContactForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("General");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: `From: ${name}\nEmail: ${email}\n\n${message}`, category, url: window.location.href, browser: navigator.userAgent }) });
      if (!response.ok) throw new Error(sendError);
      setSent(true); setMessage("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : sendError); } finally { setLoading(false); }
  }

  return <Card className="border-[1.5px] border-border shadow-ink-sm"><CardHeader><CardTitle>{sent ? "Thanks — we've got your message and will reply by email soon." : "Send a message"}</CardTitle></CardHeader><CardContent>{sent ? <Button variant="secondary" onClick={() => setSent(false)}>Send another</Button> : <form onSubmit={submit} className="space-y-5"><div className="flex gap-2 rounded-xl border-[1.5px] border-border bg-surface p-1" role="tablist" aria-label="Contact topic">{(["General", "Feedback"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={category === tab} onClick={() => setCategory(tab)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${category === tab ? "bg-card text-primary shadow-ink-sm" : "text-muted-foreground hover:text-primary"}`}>{tab}</button>)}</div><div className="space-y-2"><Label htmlFor="contact-name">Your name</Label><Input id="contact-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="contact-email">Email</Label><Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="contact-message">How can we help?</Label><Textarea id="contact-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={6} required /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" disabled={loading}>{loading ? "Sending…" : "Send message"}</Button></form>}</CardContent></Card>;
}
