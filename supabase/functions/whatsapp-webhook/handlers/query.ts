import type { QueryExtraction, WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { formatBRL, log } from "../utils.ts";
import { msgQueryEmpty, msgQueryResult } from "../messages.ts";

function resolveDateRange(
  q: QueryExtraction,
  todayISO: string,
): { start: string; end: string } {
  const today = new Date(todayISO + "T00:00:00Z");

  switch (q.period) {
    case "today":
      return { start: todayISO, end: todayISO };

    case "week": {
      const day = today.getUTCDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMon);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
      };
    }

    case "month": {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      const first = new Date(Date.UTC(y, m, 1));
      const last = new Date(Date.UTC(y, m + 1, 0));
      return {
        start: first.toISOString().slice(0, 10),
        end: last.toISOString().slice(0, 10),
      };
    }

    case "custom":
      return {
        start: q.custom_start ?? todayISO,
        end: q.custom_end ?? todayISO,
      };
  }
}

async function resolveUserId(
  householdId: string,
  userName: string,
): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("whatsapp_users")
    .select("user_id, display_name")
    .eq("household_id", householdId)
    .eq("active", true);

  if (!data) return null;
  const normalized = userName.toLowerCase();
  const match = data.find(
    (u: { display_name: string }) =>
      u.display_name.toLowerCase().includes(normalized),
  );
  return match?.user_id ?? null;
}

interface ExpenseRow {
  name: string;
  amount: number;
  category: string;
}

export async function handleQuery(
  user: WhatsappUser,
  query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  const supabase = getServiceClient();
  const { start, end } = resolveDateRange(query, todayISO);

  let builder = supabase
    .from("expenses")
    .select("name, amount, category")
    .eq("household_id", user.household_id)
    .gte("due_date", start)
    .lte("due_date", end);

  if (query.category) {
    builder = builder.eq("category", query.category);
  }

  if (query.user_name) {
    const targetUserId = await resolveUserId(
      user.household_id,
      query.user_name,
    );
    if (targetUserId) {
      builder = builder.eq("user_id", targetUserId);
    } else {
      return msgQueryEmpty(query.user_name, start, end);
    }
  }

  const { data: rows, error } = await builder.order("amount", {
    ascending: false,
  });

  if (error) {
    log("query_select_failed", { error: error.message });
    throw error;
  }

  const expenses = (rows ?? []) as ExpenseRow[];

  if (expenses.length === 0) {
    return msgQueryEmpty(query.user_name ?? null, start, end);
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const top3 = expenses.slice(0, 3);

  const categoryTotals = new Map<string, number>();
  for (const e of expenses) {
    categoryTotals.set(
      e.category,
      (categoryTotals.get(e.category) ?? 0) + Number(e.amount),
    );
  }
  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return msgQueryResult({
    total: formatBRL(total),
    count: expenses.length,
    period: { start, end },
    top3Items: top3.map((e) => ({
      name: e.name,
      amount: formatBRL(Number(e.amount)),
    })),
    topCategories: topCategories.map(([cat, amt]) => ({
      category: cat,
      amount: formatBRL(amt),
    })),
    userName: query.user_name ?? null,
    categoryFilter: query.category ?? null,
  });
}
