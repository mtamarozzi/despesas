import type { WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { formatBRL, log } from "../utils.ts";
import { msgUndoNothing, msgUndoSuccess } from "../messages.ts";

export interface UndoResult {
  message: string;
  action: "expense_undone" | "undo_nothing";
}

const UNDO_WINDOW_MS = 10 * 60 * 1000;

export async function undoLastExpense(user: WhatsappUser): Promise<UndoResult> {
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();

  const { data: target, error: selectError } = await supabase
    .from("expenses")
    .select("id, name, amount, category, created_at")
    .eq("user_id", user.user_id)
    .like("added_by_name", "% (WhatsApp)")
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    log("undo_select_failed", { error: selectError.message, phone: user.phone_number });
    throw selectError;
  }

  if (!target) {
    log("undo_nothing_found", { phone: user.phone_number, cutoff });
    return { message: msgUndoNothing(), action: "undo_nothing" };
  }

  const { error: deleteError } = await supabase
    .from("expenses")
    .delete()
    .eq("id", target.id);

  if (deleteError) {
    log("undo_delete_failed", { error: deleteError.message, id: target.id });
    throw deleteError;
  }

  log("expense_undone", { phone: user.phone_number, id: target.id, amount: target.amount });
  return {
    message: msgUndoSuccess(formatBRL(Number(target.amount)), target.category, target.name),
    action: "expense_undone",
  };
}
