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

export function todayISOBrt(): string {
  const now = new Date();
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  return new Date(brtMs).toISOString().slice(0, 10);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDueDatePtBr(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}
