import type { ExpenseExtraction, WhatsappUser } from "../types.ts";
import { CATEGORIAS, STATUS_ENUM } from "../schemas.ts";
import { getMediaBase64 } from "../evolution.ts";
import { interpretImage } from "../gemini.ts";
import { registerExpense } from "./expense.ts";
import { msgImageDownloadError, msgImageUnsupported, msgSystemError } from "../messages.ts";
import { log } from "../utils.ts";

export interface ImageHandlerResult {
  message: string;
  action:
    | "image_expense_inserted"
    | "image_unsupported"
    | "image_invalid_payload"
    | "image_download_failed"
    | "image_gemini_failed"
    | "image_insert_failed";
  success: boolean;
  errorCode?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_CATEGORIAS = new Set<string>(CATEGORIAS);
const VALID_STATUS = new Set<string>(STATUS_ENUM);

function isValidPayload(p: unknown): p is ExpenseExtraction {
  if (!p || typeof p !== "object") return false;
  const e = p as Partial<ExpenseExtraction>;
  return (
    typeof e.descricao === "string" && e.descricao.length > 0 &&
    typeof e.valor === "number" && Number.isFinite(e.valor) && e.valor > 0 &&
    typeof e.categoria === "string" && VALID_CATEGORIAS.has(e.categoria) &&
    typeof e.data === "string" && ISO_DATE.test(e.data) && !Number.isNaN(Date.parse(e.data)) &&
    typeof e.status === "string" && VALID_STATUS.has(e.status)
  );
}

export async function handleImage(
  user: WhatsappUser,
  messageId: string,
  caption: string,
  todayISO: string,
): Promise<ImageHandlerResult> {
  log("image_received", {
    phone: user.phone_number,
    message_id: messageId,
    has_caption: caption.length > 0,
    caption_length: caption.length,
  });

  let media;
  try {
    media = await getMediaBase64(messageId);
  } catch (err) {
    return {
      message: msgImageDownloadError(),
      action: "image_download_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  let result;
  try {
    result = await interpretImage(media.base64, media.mimetype, caption, todayISO);
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "image_gemini_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }

  if (result.intent === "unsupported") {
    return {
      message: msgImageUnsupported(result.motivo),
      action: "image_unsupported",
      success: true,
    };
  }

  if (!isValidPayload(result.payload)) {
    log("image_invalid_payload", { phone: user.phone_number, payload: result.payload });
    return {
      message: msgImageUnsupported("não consegui ler valor/data"),
      action: "image_invalid_payload",
      success: true,
    };
  }

  try {
    const message = await registerExpense(user, result.payload);
    return { message, action: "image_expense_inserted", success: true };
  } catch (err) {
    return {
      message: msgSystemError(),
      action: "image_insert_failed",
      success: false,
      errorCode: (err as Error).message.slice(0, 100),
    };
  }
}
