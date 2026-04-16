import type { IncomeExtraction, WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { resolveCategoryId } from "../categories.ts";
import { formatBRL, log } from "../utils.ts";
import { msgConfirmIncome } from "../messages.ts";

export async function registerIncome(
  user: WhatsappUser,
  payload: IncomeExtraction,
): Promise<string> {
  const supabase = getServiceClient();

  const categoryId = await resolveCategoryId(
    user.household_id,
    payload.categoria,
    "income",
  );

  const { error } = await supabase.from("incomes").insert({
    user_id: user.user_id,
    household_id: user.household_id,
    name: payload.descricao,
    amount: payload.valor,
    category_id: categoryId,
    received_date: payload.data,
    status: payload.status,
    added_by_name: `${user.display_name} (WhatsApp)`,
  });

  if (error) {
    log("income_insert_failed", {
      error: error.message,
      phone: user.phone_number,
    });
    throw error;
  }

  log("income_inserted", {
    phone: user.phone_number,
    amount: payload.valor,
    category_resolved: !!categoryId,
  });

  return msgConfirmIncome(
    formatBRL(payload.valor),
    payload.categoria,
    payload.descricao,
  );
}
