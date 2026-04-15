// Gemini 2.5 Flash — responseSchema unificado.
// Decisão D1 do PLANO_CONTINUIDADE: uma única chamada faz classificação de intent + extração.
// O modelo sempre retorna este envelope. Campos ausentes viram null.

export const CATEGORIAS = [
  "Habitação",
  "Alimentação",
  "Transporte",
  "Lazer",
  "Vestuário",
  "Outros",
] as const;

export const INTENT_ENUM = ["expense", "unknown"] as const;
export const STATUS_ENUM = ["pago", "pendente"] as const;

export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [...INTENT_ENUM],
      description: "Tipo de mensagem. 'expense' quando o usuário relatou uma despesa; 'unknown' caso contrário.",
    },
    expense: {
      type: "object",
      nullable: true,
      description: "Preenchido APENAS quando intent='expense' e há informação suficiente.",
      properties: {
        descricao: { type: "string", description: "Descrição curta (ex: 'conta de luz', 'mercado')." },
        valor: { type: "number", description: "Valor em reais. Ex: 120.5" },
        categoria: { type: "string", enum: [...CATEGORIAS] },
        data: { type: "string", description: "Data da despesa em ISO (YYYY-MM-DD). Use a data fornecida como 'hoje' pra resolver 'ontem', 'anteontem', 'dia 5', etc." },
        status: { type: "string", enum: [...STATUS_ENUM] },
      },
      required: ["descricao", "valor", "categoria", "data", "status"],
    },
    erro: {
      type: "string",
      nullable: true,
      description: "Preenchido quando intent='expense' mas falta informação (ex: valor ausente) OU quando a mensagem não pôde ser interpretada.",
    },
  },
  required: ["intent"],
} as const;
