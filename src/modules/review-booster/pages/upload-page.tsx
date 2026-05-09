"use client";

import { FormEvent, useRef, useState } from "react";

import { FollowupsNav } from "@/modules/review-booster/components/followups-nav";
import { PageHeader } from "@/modules/review-booster/components/page-header";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function onDownloadTemplate() {
    const content = "customer_name,customer_email,customer_phone,service_name,visited_at\n";
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

    if (!file) {
      setMessage("Please choose a CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await fetch("/api/review-booster/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || "Upload failed.");
      } else {
        setResult(data);
        setMessage("Upload complete.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <FollowupsNav />
      <PageHeader
        title="Upload Completed Visits"
        description="Import completed visits from CSV so follow-ups can be created automatically with the same validation and dedupe safeguards."
        backToOverview
      >
        <button
          type="button"
          onClick={onDownloadTemplate}
          className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Download template
        </button>
      </PageHeader>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-3 font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 space-y-2 text-slate-800">
          <li>1. Step 1: Download the template</li>
          <li>2. Step 2: Fill in completed visits</li>
          <li>3. Step 3: Upload the CSV</li>
          <li>4. Step 4: Follow-ups send automatically</li>
        </ol>
        <p className="mt-4 text-slate-600">
          Manual/CSV visits can trigger follow-ups if the visit happened between 23 hours and 7 days ago.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Expected CSV columns</h2>
        <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 font-mono text-sm text-slate-800">
          customer_name, customer_email, customer_phone, service_name, visited_at
        </p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
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
            "flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition",
            dragActive ? "border-slate-500 bg-slate-100" : "border-slate-300 bg-slate-50"
          ].join(" ")}
        >
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0f172b] text-lg text-white">
            ↑
          </div>
          <p className="text-base font-medium text-slate-900">
            Drag and drop your CSV file here, or click to browse
          </p>
          <p className="mt-1 text-sm text-slate-500">CSV files only</p>
          {file ? <p className="mt-2 text-sm font-medium text-slate-700">Selected: {file.name}</p> : null}
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="inline-flex rounded-lg bg-[#0f172b] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-70"
        >
          {uploading ? "Uploading..." : "Upload CSV"}
        </button>
        {message ? <p className="text-slate-700">{message}</p> : null}
        {result ? (
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p>rows_processed: {result.rows_processed}</p>
            <p>visits_inserted: {result.visits_inserted}</p>
            <p>rows_skipped: {result.rows_skipped}</p>
            <p>duplicates_skipped: {result.duplicates_skipped}</p>
            {result.errors.length > 0 ? (
              <ul className="list-disc pl-5">
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
