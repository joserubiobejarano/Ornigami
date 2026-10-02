export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("whatsapp:")) {
    const phone = normalizePhone(trimmed.slice("whatsapp:".length));
    return phone ? `whatsapp:${phone}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;

  return `+${digits}`;
}

export function withWhatsappPrefix(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}
