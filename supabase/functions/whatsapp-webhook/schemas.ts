export const CATEGORIAS = ["Habitação", "Alimentação", "Transporte", "Lazer", "Vestuário", "Outros"] as const;
export const INTENT_ENUM = ["expense", "query", "unknown", "undo"] as const;
export const QUERY_PERIOD_ENUM = ["today", "week", "month", "custom"] as const;
export const STATUS_ENUM = ["pago", "pendente"] as const;

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
        categoria: { type: "string", enum: [...CATEGORIAS] },
        data: { type: "string" },
        status: { type: "string", enum: [...STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    query: {
      type: "object",
      nullable: true,
      properties: {
        period: { type: "string", enum: [...QUERY_PERIOD_ENUM] },
        category: { type: "string", nullable: true },
        user_name: { type: "string", nullable: true },
        custom_start: { type: "string", nullable: true },
        custom_end: { type: "string", nullable: true },
      },
      required: ["period"],
    },
    erro: { type: "string", nullable: true },
  },
  required: ["intent"],
} as const;
