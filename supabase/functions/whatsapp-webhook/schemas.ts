// Response schemas enviados ao Gemini (generateContent).
// Categorias NÃO são enum fixo — o prompt injeta a lista do household em runtime.

export const INTENT_ENUM = ["expense", "income", "query", "unknown", "undo"] as const;
export const QUERY_PERIOD_ENUM = ["today", "week", "month", "custom"] as const;
export const QUERY_TYPE_ENUM = [
  "balance",
  "category_report",
  "full_report",
  "goal_check",
] as const;
export const EXPENSE_STATUS_ENUM = ["pago", "pendente"] as const;
export const INCOME_STATUS_ENUM = ["recebido", "previsto"] as const;

// Mantido pra compatibilidade retroativa (image.ts importa).
export const STATUS_ENUM = EXPENSE_STATUS_ENUM;

export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...INTENT_ENUM] },
    expense: {
      type: "object",
      nullable: true,
      properties: {
        descricao: { type: "string" },
        valor: { type: "number" },
        categoria: { type: "string" },
        data: { type: "string" },
        status: { type: "string", enum: [...EXPENSE_STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    income: {
      type: "object",
      nullable: true,
      properties: {
        descricao: { type: "string" },
        valor: { type: "number" },
        categoria: { type: "string" },
        data: { type: "string" },
        status: { type: "string", enum: [...INCOME_STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    query: {
      type: "object",
      nullable: true,
      properties: {
        tipo: { type: "string", enum: [...QUERY_TYPE_ENUM] },
        period: { type: "string", enum: [...QUERY_PERIOD_ENUM], nullable: true },
        category: { type: "string", nullable: true },
        user_name: { type: "string", nullable: true },
        custom_start: { type: "string", nullable: true },
        custom_end: { type: "string", nullable: true },
      },
      required: ["tipo"],
    },
    erro: { type: "string", nullable: true },
  },
  required: ["intent"],
} as const;

export const IMAGE_INTENT_ENUM = ["expense", "unsupported"] as const;

export const IMAGE_EXPENSE_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: [...IMAGE_INTENT_ENUM] },
    payload: {
      type: "object",
      nullable: true,
      properties: {
        descricao: { type: "string" },
        valor: { type: "number" },
        categoria: { type: "string" },
        data: { type: "string" },
        status: { type: "string", enum: [...EXPENSE_STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    motivo: { type: "string", nullable: true },
  },
  required: ["intent"],
} as const;
