"use client";

import { Button } from "@/components/ui/button";

export default function DisconnectGoogleButton() {
  async function handleDisconnect() {
    const r = await fetch("/api/google/disconnect", { method: "POST" });
    if (r.ok) window.location.reload();
    else alert("We couldn't disconnect Google. Try again in a moment.");
  }

  return (
    <Button type="button" onClick={handleDisconnect}>
      Disconnect
    </Button>
  );
}

