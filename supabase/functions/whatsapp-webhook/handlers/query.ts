import type { QueryExtraction, WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { formatBRL, log } from "../utils.ts";
import {
  msgBalance,
  msgFullReport,
  msgGoalCheck,
  msgGoalCheckEmpty,
  msgQueryEmpty,
  msgQueryResult,
} from "../messages.ts";

function firstDayOfMonth(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-01`;
}

function resolveDateRange(
  q: QueryExtraction,
  todayISO: string,
): { start: string; end: string } {
  const period = q.period ?? "month";
  const today = new Date(todayISO + "T00:00:00Z");

  switch (period) {
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

interface MonthlySummaryRow {
  household_id: string;
  month_year: string;
  received_income: number;
  projected_income: number;
  total_income: number;
  paid_expenses: number;
  pending_expenses: number;
  total_expenses: number;
  real_balance: number;
  projected_balance: number;
}

interface GoalProgressRow {
  goal_id: string;
  household_id: string;
  category_id: string;
  category_name: string;
  category_icon: string | null;
  month_year: string;
  limit_amount: number;
  spent_amount: number;
  remaining_amount: number;
  percent_used: number;
}

async function handleCategoryReport(
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

async function fetchMonthlySummary(
  householdId: string,
  monthFirstDay: string,
): Promise<MonthlySummaryRow | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("monthly_summary")
    .select("*")
    .eq("household_id", householdId)
    .eq("month_year", monthFirstDay)
    .maybeSingle();

  if (error) {
    log("monthly_summary_failed", { error: error.message });
    throw error;
  }
  return (data as MonthlySummaryRow) ?? null;
}

async function handleBalance(
  user: WhatsappUser,
  _query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  const monthKey = firstDayOfMonth(todayISO);
  const row = await fetchMonthlySummary(user.household_id, monthKey);

  if (!row) {
    return msgBalance({
      monthISO: monthKey,
      received: formatBRL(0),
      paidExpenses: formatBRL(0),
      pendingExpenses: formatBRL(0),
      realBalance: formatBRL(0),
      projectedBalance: formatBRL(0),
      empty: true,
    });
  }

  return msgBalance({
    monthISO: monthKey,
    received: formatBRL(Number(row.received_income)),
    paidExpenses: formatBRL(Number(row.paid_expenses)),
    pendingExpenses: formatBRL(Number(row.pending_expenses)),
    realBalance: formatBRL(Number(row.real_balance)),
    projectedBalance: formatBRL(Number(row.projected_balance)),
    empty: false,
  });
}

async function handleGoalCheck(
  user: WhatsappUser,
  query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  const supabase = getServiceClient();
  const monthKey = firstDayOfMonth(todayISO);

  let builder = supabase
    .from("goal_progress")
    .select("*")
    .eq("household_id", user.household_id)
    .eq("month_year", monthKey);

  if (query.category) {
    builder = builder.eq("category_name", query.category);
  }

  const { data, error } = await builder.order("percent_used", {
    ascending: false,
  });

  if (error) {
    log("goal_progress_failed", { error: error.message });
    throw error;
  }

  const rows = (data ?? []) as GoalProgressRow[];
  if (rows.length === 0) {
    return msgGoalCheckEmpty(query.category ?? null);
  }

  return msgGoalCheck({
    goals: rows.map((r) => ({
      category: r.category_name,
      limit: formatBRL(Number(r.limit_amount)),
      spent: formatBRL(Number(r.spent_amount)),
      remaining: formatBRL(Number(r.remaining_amount)),
      percentUsed: Number(r.percent_used),
    })),
    categoryFilter: query.category ?? null,
    monthISO: monthKey,
  });
}

async function handleFullReport(
  user: WhatsappUser,
  _query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  const supabase = getServiceClient();
  const monthKey = firstDayOfMonth(todayISO);

  const [summary, { data: goalRows, error: goalErr }] = await Promise.all([
    fetchMonthlySummary(user.household_id, monthKey),
    supabase
      .from("goal_progress")
      .select("*")
      .eq("household_id", user.household_id)
      .eq("month_year", monthKey)
      .order("percent_used", { ascending: false })
      .limit(3),
  ]);

  if (goalErr) {
    log("goal_progress_failed", { error: goalErr.message });
    throw goalErr;
  }

  return msgFullReport({
    monthISO: monthKey,
    received: formatBRL(Number(summary?.received_income ?? 0)),
    paidExpenses: formatBRL(Number(summary?.paid_expenses ?? 0)),
    pendingExpenses: formatBRL(Number(summary?.pending_expenses ?? 0)),
    realBalance: formatBRL(Number(summary?.real_balance ?? 0)),
    projectedBalance: formatBRL(Number(summary?.projected_balance ?? 0)),
    topGoals: ((goalRows ?? []) as GoalProgressRow[]).map((r) => ({
      category: r.category_name,
      percentUsed: Number(r.percent_used),
      remaining: formatBRL(Number(r.remaining_amount)),
    })),
  });
}

export async function handleQuery(
  user: WhatsappUser,
  query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  switch (query.tipo) {
    case "balance":
      return handleBalance(user, query, todayISO);
    case "goal_check":
      return handleGoalCheck(user, query, todayISO);
    case "full_report":
      return handleFullReport(user, query, todayISO);
    case "category_report":
    default:
      return handleCategoryReport(user, query, todayISO);
  }
}
