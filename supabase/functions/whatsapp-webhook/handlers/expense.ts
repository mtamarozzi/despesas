import type { ExpenseExtraction, WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { formatBRL, log } from "../utils.ts";
import { msgConfirmExpense } from "../messages.ts";

export async function registerExpense(
  user: WhatsappUser,
  payload: ExpenseExtraction,
): Promise<string> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("expenses").insert({
    user_id: user.user_id,
    household_id: user.household_id,
    name: payload.descricao,
    amount: payload.valor,
    category: payload.categoria,
    due_date: payload.data,
    status: payload.status,
    added_by_name: `${user.display_name} (WhatsApp)`,
  });
  if (error) {
    log("expense_insert_failed", { error: error.message, phone: user.phone_number });
    throw error;
  }
  log("expense_inserted", { phone: user.phone_number, amount: payload.valor });
  return msgConfirmExpense(formatBRL(payload.valor), payload.categoria, payload.descricao);
}
