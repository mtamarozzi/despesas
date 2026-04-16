// Domain types for the WhatsApp webhook — Evolution API payloads + internal shapes.

export interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: { mimetype?: string; caption?: string };
  audioMessage?: { mimetype?: string };
}

export interface EvolutionMessageData {
  key: EvolutionMessageKey;
  message?: EvolutionMessageContent;
  messageType?: string;
  messageTimestamp?: number;
  pushName?: string;
}

export interface EvolutionWebhookEvent {
  event: string;
  instance: string;
  data: EvolutionMessageData;
}

export interface WhatsappUser {
  phone_number: string;
  user_id: string;
  household_id: string;
  display_name: string;
  active: boolean;
}

export type Intent = "expense" | "query" | "unknown" | "undo";

export interface ExpenseExtraction {
  descricao: string;
  valor: number;
  categoria: "Habitação" | "Alimentação" | "Transporte" | "Lazer" | "Vestuário" | "Outros";
  data: string;
  status: "pago" | "pendente";
}

export type QueryPeriod = "today" | "week" | "month" | "custom";

export interface QueryExtraction {
  period: QueryPeriod;
  category?: string;
  user_name?: string;
  custom_start?: string;
  custom_end?: string;
}

export interface GeminiResult {
  intent: Intent;
  payload?: ExpenseExtraction;
  queryPayload?: QueryExtraction;
  erro?: string;
}
