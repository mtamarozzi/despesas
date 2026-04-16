import { getServiceClient } from "./supabase-client.ts";
import { sendText } from "./evolution.ts";
import { addDaysISO, log, todayISOBrt } from "./utils.ts";
import { formatReminderMessage, type ReminderExpense } from "./messages.ts";

interface ExpenseRow {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  category: string;
  due_date: string;
  last_reminded_at: string | null;
}

interface WhatsappUserRow {
  phone_number: string;
  household_id: string;
  display_name: string;
}

export interface ReminderRunResult {
  today: string;
  windows: { t_minus_3: string; t_minus_1: string };
  expenses_matched: number;
  households_notified: number;
  messages_sent: number;
  errors: number;
}

export async function runReminders(): Promise<ReminderRunResult> {
  const supabase = getServiceClient();
  const today = todayISOBrt();
  const tMinus3 = addDaysISO(today, 3);
  const tMinus1 = addDaysISO(today, 1);

  log("reminder_run_start", { today, t_minus_3: tMinus3, t_minus_1: tMinus1 });

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, household_id, name, amount, category, due_date, last_reminded_at")
    .eq("status", "pendente")
    .in("due_date", [tMinus3, tMinus1]);

  if (error) {
    log("reminder_query_failed", { error: error.message });
    throw error;
  }

  const toRemind = (expenses ?? []).filter((e: ExpenseRow) => {
    if (!e.last_reminded_at) return true;
    return e.last_reminded_at.slice(0, 10) < today;
  }) as ExpenseRow[];

  if (toRemind.length === 0) {
    log("reminder_nothing_due", { today });
    return {
      today,
      windows: { t_minus_3: tMinus3, t_minus_1: tMinus1 },
      expenses_matched: 0,
      households_notified: 0,
      messages_sent: 0,
      errors: 0,
    };
  }

  const byHousehold = new Map<string, ReminderExpense[]>();
  for (const e of toRemind) {
    const window: "T-3" | "T-1" = e.due_date === tMinus1 ? "T-1" : "T-3";
    const item: ReminderExpense = {
      id: e.id,
      name: e.name,
      amount: Number(e.amount),
      due_date: e.due_date,
      category: e.category,
      window,
    };
    const list = byHousehold.get(e.household_id) ?? [];
    list.push(item);
    byHousehold.set(e.household_id, list);
  }

  const householdIds = [...byHousehold.keys()];
  const { data: users } = await supabase
    .from("whatsapp_users")
    .select("phone_number, household_id, display_name")
    .eq("active", true)
    .in("household_id", householdIds);

  const usersByHousehold = new Map<string, WhatsappUserRow[]>();
  for (const u of (users ?? []) as WhatsappUserRow[]) {
    const list = usersByHousehold.get(u.household_id) ?? [];
    list.push(u);
    usersByHousehold.set(u.household_id, list);
  }

  let messagesSent = 0;
  let errors = 0;
  const remindedIds: string[] = [];

  for (const [householdId, items] of byHousehold.entries()) {
    const recipients = usersByHousehold.get(householdId) ?? [];
    if (recipients.length === 0) {
      log("reminder_no_recipients", { household_id: householdId });
      continue;
    }
    const body = formatReminderMessage(items);
    let householdSent = 0;

    for (const recipient of recipients) {
      try {
        await sendText(recipient.phone_number, body);
        messagesSent++;
        householdSent++;
      } catch (err) {
        errors++;
        log("reminder_send_failed", {
          phone: recipient.phone_number,
          error: (err as Error).message,
        });
      }
    }

    if (householdSent > 0) {
      for (const item of items) remindedIds.push(item.id);
    }
  }

  if (remindedIds.length > 0) {
    const { error: updateError } = await supabase
      .from("expenses")
      .update({ last_reminded_at: new Date().toISOString() })
      .in("id", remindedIds);

    if (updateError) {
      log("reminder_mark_failed", { error: updateError.message, ids: remindedIds });
    }
  }

  const result: ReminderRunResult = {
    today,
    windows: { t_minus_3: tMinus3, t_minus_1: tMinus1 },
    expenses_matched: toRemind.length,
    households_notified: byHousehold.size,
    messages_sent: messagesSent,
    errors,
  };
  log("reminder_run_done", result as unknown as Record<string, unknown>);
  return result;
}
