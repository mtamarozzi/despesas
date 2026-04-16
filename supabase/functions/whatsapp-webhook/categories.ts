// Fetch dinâmico das categorias ativas de um household.
// Usado para injetar a lista no prompt do Gemini (sem enum fixo)
// e para resolver category_id na hora de inserir em expenses/incomes.

import { getServiceClient } from "./supabase-client.ts";
import type { HouseholdCategories } from "./types.ts";
import { log } from "./utils.ts";

interface CategoryRow {
  id: string;
  name: string;
  type: "expense" | "income" | "both";
}

let cache: {
  householdId: string;
  fetchedAt: number;
  rows: CategoryRow[];
} | null = null;

const TTL_MS = 60_000;

async function fetchRows(householdId: string): Promise<CategoryRow[]> {
  if (
    cache && cache.householdId === householdId &&
    Date.now() - cache.fetchedAt < TTL_MS
  ) {
    return cache.rows;
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type")
    .eq("household_id", householdId)
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (error) {
    log("categories_fetch_failed", { error: error.message, householdId });
    throw error;
  }

  const rows = (data ?? []) as CategoryRow[];
  cache = { householdId, fetchedAt: Date.now(), rows };
  return rows;
}

export async function fetchHouseholdCategories(
  householdId: string,
): Promise<HouseholdCategories> {
  const rows = await fetchRows(householdId);
  return {
    expense: rows
      .filter((r) => r.type === "expense" || r.type === "both")
      .map((r) => r.name),
    income: rows
      .filter((r) => r.type === "income" || r.type === "both")
      .map((r) => r.name),
    both: rows.filter((r) => r.type === "both").map((r) => r.name),
  };
}

export async function resolveCategoryId(
  householdId: string,
  name: string,
  kind: "expense" | "income",
): Promise<string | null> {
  const rows = await fetchRows(householdId);
  const normalized = name.trim().toLowerCase();
  const match = rows.find((r) => {
    if (r.name.toLowerCase() !== normalized) return false;
    if (r.type === "both") return true;
    return r.type === kind;
  });
  return match?.id ?? null;
}
