"use client";

import { FormEvent, useRef, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";
import { Button } from "@/components/ui/button";

type UploadResult = {
  rows_processed: number;
  visits_inserted: number;
  rows_skipped: number;
  duplicates_skipped: number;
  errors: Array<{ row: number; message: string }>;
};

export default function ReviewBoosterUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [statusKind, setStatusKind] = useState<"idle" | "success" | "error" | "uploading">("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onDownloadTemplate() {
    const content = [
      "customer_name,customer_email,service_received,visited_at",
      "Jane Doe,jane@example.com,Teeth cleaning,2026-05-25"
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "review-booster-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setResult(null);
    setStatusKind("idle");

    if (!file) {
      setMessage("Choose a CSV file to continue.");
      setStatusKind("error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setStatusKind("uploading");
    setMessage("Checking your visits…");

    try {
      const res = await fetch("/api/review-booster/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "We couldn't import those visits. Try again in a moment.");
        setStatusKind("error");
      } else {
        setResult(data);
        setMessage(`${data.visits_inserted ?? 0} visits ready. Nothing sends until you confirm.`);
        setStatusKind("success");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't import those visits. Try again in a moment.");
      setStatusKind("error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader
        title="Upload visits"
        description="Add a CSV with names and contact details. We’ll show you a preview before anything sends."
        backToOverview
      >
        <Button
          type="button"
          onClick={onDownloadTemplate}
          size="sm"
        >
          Download template
        </Button>
      </PageHeader>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm">
        <h2 className="text-3xl font-semibold text-primary">Upload visits</h2>
        <ol className="mt-4 space-y-2 text-foreground">
          <li>1. Download the template.</li>
          <li>2. Add names and contact details.</li>
          <li>3. Choose your CSV file.</li>
          <li>4. Review the visits before anything sends.</li>
        </ol>
        <p className="mt-4 text-muted-foreground">
          Nothing sends until you confirm.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          For better review conversion, make sure Settings uses the direct Google Maps &quot;Write a review&quot; link.
        </p>
      </section>

      <section className="rounded-2xl border-[1.5px] border-border bg-card p-6 shadow-ink-sm">
        <h2 className="text-sm font-semibold text-primary">Expected CSV columns</h2>
        <p className="mt-3 rounded-xl border-[1.5px] border-border bg-surface px-3 py-2 font-mono text-sm text-foreground">
          customer_name, customer_email, service_received, visited_at
        </p>
        <p className="mt-3 rounded-xl border-[1.5px] border-accent-marigold/35 bg-accent-marigold/10 px-3 py-2 text-sm text-primary">
          Example row: Jane Doe, jane@example.com, Teeth cleaning, 2026-05-25
          <span className="ml-1 text-muted-foreground">(Use date format: YYYY-MM-DD)</span>
        </p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border-[1.5px] border-border bg-card p-6 text-sm text-muted-foreground shadow-ink-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={openFilePicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openFilePicker();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const droppedFile = event.dataTransfer.files?.[0];
            if (droppedFile) {
              setFile(droppedFile);
            }
          }}
          className={[
            "flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed px-6 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            dragActive ? "border-primary bg-surface" : "border-border bg-surface"
          ].join(" ")}
        >
          <div
            className={[
              "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-lg text-primary-foreground",
              uploading ? "animate-pulse bg-accent-marigold" : file ? "bg-accent-green" : "bg-primary"
            ].join(" ")}
          >
            {uploading ? "..." : file ? "OK" : "UP"}
          </div>
          <p className="text-base font-medium text-primary">
            Choose file
          </p>
          <p className="mt-1 text-sm text-muted-foreground">CSV files only</p>
          {file ? (
            <p className="mt-2 rounded-xl border-[1.5px] border-accent-green/35 bg-accent-green/10 px-3 py-1 text-sm font-semibold text-primary">
              File selected: {file.name}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          disabled={uploading}
        >
          {uploading ? "Checking…" : "Import visits"}
        </Button>
        {message ? (
          <div
            className={[
              "flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-sm font-medium",
              statusKind === "success"
                ? "border-accent-green/35 bg-accent-green/10 text-primary"
                : statusKind === "error"
                  ? "border-destructive/35 bg-destructive/10 text-destructive"
                  : statusKind === "uploading"
                    ? "border-accent-marigold/35 bg-accent-marigold/10 text-primary"
                    : "border-border bg-surface text-primary"
            ].join(" ")}
          >
            <span className={statusKind === "uploading" ? "inline-block h-2 w-2 animate-ping rounded-full bg-accent-marigold" : ""} />
            <span>{message}</span>
          </div>
        ) : null}
        {result ? (
          <div className="space-y-2 rounded-xl border-[1.5px] border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-primary">
              <span className="inline-flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-accent-green text-[10px] font-bold text-primary-foreground">
                OK
              </span>
              <p className="text-sm font-semibold">{result.visits_inserted} visits ready</p>
            </div>
            <p>Nothing sends until you confirm.</p>
            <p>Rows checked: {result.rows_processed}</p>
            <p>Skipped: {result.rows_skipped + result.duplicates_skipped}</p>
            {result.errors.length > 0 ? (
              <ul className="list-disc rounded-xl border-[1.5px] border-accent-marigold/35 bg-accent-marigold/10 p-3 pl-8 text-primary">
                {result.errors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
