"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import Link from "next/link";

import { Button, buttonStyles } from "@/components/followups/button";
import { FollowupsNav } from "@/components/followups/followups-nav";
import { PageHeader } from "@/components/followups/page-header";
import { RunFollowupsButton } from "@/components/followups/run-followups-button";
import { SummaryCard } from "@/components/followups/summary-card";

type UploadResult = {
  rows_processed: number;
  visits_inserted: number;
  rows_skipped: number;
  duplicates_skipped: number;
  errors: Array<{ row: number; reason?: string; message?: string }>;
};

export default function UploadVisitsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setResult(null);

    if (!file) {
      setMessage("Choose a CSV file to continue.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const res = await fetch("/api/followups/upload", { method: "POST", body: formData });
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : null;
      if (!res.ok) {
        setMessage(data?.error || "We couldn't import those visits. Try again in a moment.");
        return;
      }
      setResult(data as UploadResult);
      setMessage(`${data.visits_inserted ?? 0} visits ready. Nothing sends until you confirm.`);
    } catch {
      setMessage("We couldn't import those visits. Try again in a moment.");
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] || null;
    if (droppedFile) {
      setFile(droppedFile);
      setMessage("");
      setResult(null);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <FollowupsNav />
      <PageHeader title="Upload visits" description="Add a CSV with names and contact details. We'll show you a preview before anything sends." backToOverview>
        <a className={buttonStyles("outline")} href="/visits-example.csv" download>Download template</a>
      </PageHeader>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm sm:p-8">
        <h2 className="text-xl font-semibold text-primary">Upload visits</h2>
        <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>Download the template.</li>
          <li>Add names and contact details.</li>
          <li>Choose your CSV file.</li>
          <li>Review the visits before anything sends.</li>
        </ol>
        <p className="mt-4 text-sm text-primary">Nothing sends until you confirm.</p>
      </section>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm sm:p-8">
        <p className="text-sm font-semibold text-primary">Expected CSV columns</p>
        <p className="mt-3 rounded-xl border-[1.5px] border-border bg-surface px-3 py-2 font-mono text-xs text-foreground sm:text-sm">customer_name, customer_email, customer_phone, service_name, visited_at</p>
        <p className="mt-3 rounded-xl border-[1.5px] border-accent-marigold/35 bg-tint-butter px-3 py-2 text-sm text-primary">Example row: Jane Doe, jane@example.com, 555 0100, Teeth cleaning, 2026-05-25</p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm sm:p-8">
        <label
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-6 py-10 text-center transition ${isDragging ? "border-primary bg-surface" : "border-border bg-surface hover:border-primary"}`}
        >
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] || null); setMessage(""); setResult(null); }} />
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">↑</div>
          <p className="text-sm font-semibold text-primary">Choose file</p>
          <p className="mt-1 text-xs text-muted-foreground">CSV files only</p>
          {file ? <p className="mt-4 rounded-xl border-[1.5px] border-accent-green/35 bg-tint-mint px-3 py-1.5 text-xs font-semibold text-primary">Selected file: {file.name}</p> : null}
        </label>

        <Button type="submit" disabled={isUploading}>{isUploading ? "Checking..." : "Import visits"}</Button>
        {message ? <div className={`rounded-xl border-[1.5px] px-4 py-3 text-sm ${result ? "border-accent-green/35 bg-tint-mint text-primary" : "border-border bg-surface text-primary"}`}>{message}</div> : null}
      </form>

      {result ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-primary">{result.visits_inserted} visits ready</h2>
          <p className="text-sm text-muted-foreground">Nothing sends until you confirm.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Rows checked" value={result.rows_processed} />
            <SummaryCard label="Visits ready" value={result.visits_inserted} />
            <SummaryCard label="Skipped" value={result.rows_skipped} />
            <SummaryCard label="Duplicates" value={result.duplicates_skipped} />
            <SummaryCard label="Errors" value={result.errors?.length || 0} />
          </div>
          {result.errors?.length ? <div className="rounded-2xl border-[1.5px] border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive"><p className="mb-3 font-semibold">Some rows need attention</p><ul className="space-y-2">{result.errors.map((error, index) => <li key={`${error.row}-${index}`}>Row {error.row}: {error.reason || error.message}</li>)}</ul></div> : null}
          <div className="rounded-2xl border-[1.5px] border-border bg-card p-5 shadow-ink-sm"><RunFollowupsButton /></div>
          <Link href="/dashboard/followups" className={buttonStyles("outline")}>Back to overview</Link>
        </section>
      ) : null}
    </div>
  );
}
