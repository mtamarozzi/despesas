export function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function stripWhatsappJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net$/, "").replace(/@c\.us$/, "");
}

export function extractText(msg: { conversation?: string; extendedTextMessage?: { text: string } } | undefined): string {
  if (!msg) return "";
  return msg.conversation ?? msg.extendedTextMessage?.text ?? "";
}
