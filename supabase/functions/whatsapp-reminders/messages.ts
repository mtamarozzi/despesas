import { formatBRL, formatDueDatePtBr } from "./utils.ts";

export interface ReminderExpense {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  category: string;
  window: "T-3" | "T-1";
}

export function formatReminderMessage(expenses: ReminderExpense[]): string {
  const count = expenses.length;
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  let msg = `⏰ Lembrete CasaFlow\n\n`;
  msg += count === 1
    ? `Você tem 1 conta pra pagar:\n\n`
    : `Você tem ${count} contas pra pagar (total ${formatBRL(total)}):\n\n`;

  const sorted = [...expenses].sort((a, b) => a.due_date.localeCompare(b.due_date));

  for (const e of sorted) {
    const when = e.window === "T-1" ? "amanhã" : formatDueDatePtBr(e.due_date);
    const flag = e.window === "T-1" ? " 🔴" : "";
    msg += `• ${formatBRL(Number(e.amount))} — ${e.name} (${e.category}) — ${when}${flag}\n`;
  }

  msg += `\nResponda "paguei [descrição]" quando quitar.`;
  return msg;
}
