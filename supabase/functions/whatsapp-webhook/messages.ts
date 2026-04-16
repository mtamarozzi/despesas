// Catálogo de respostas do bot em pt-BR — variações sorteadas para soar menos robótico.
// Regra: toda string enviada ao WhatsApp passa por uma função daqui.

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

export function msgConfirmExpense(amountBRL: string, category: string, description: string): string {
  return pick([
    `✅ ${amountBRL} em ${category} registrado (${description})`,
    `Pronto! ${amountBRL} de ${description} lançado em ${category} 👍`,
    `Anotei: ${amountBRL} — ${description} (${category}) ✓`,
  ]);
}

export function msgUnauthorized(): string {
  return pick([
    "Oi! Esse número ainda não está autorizado no CasaFlow.",
    "Hmm, não reconheço esse número por aqui. Fala com o Marcelo pra liberar.",
  ]);
}

export function msgNonText(): string {
  return pick([
    "Só consigo entender texto por enquanto. Áudio e foto chegam em breve!",
    "Por ora só mensagens escritas. Em breve rolará áudio 🎤 e foto 📷",
  ]);
}

export function msgUnknown(): string {
  return pick([
    'Não peguei bem — pode tentar algo tipo "paguei 120 de luz hoje"?',
    'Não entendi. Exemplo que funciona: "gastei 55 no mercado".',
    'Hum, não captei. Tenta "vence dia 10 a fatura de 340" ou similar.',
  ]);
}

export function msgSystemError(): string {
  return pick([
    "⚠️ Travei aqui do meu lado. Pode tentar de novo em 30 segundos?",
    "⚠️ Deu problema agora. Reenvia daqui a pouco?",
    "⚠️ Algo falhou — me dá uns segundos e tenta de novo.",
  ]);
}

export function msgRateLimited(): string {
  return pick([
    "Calma, estamos indo rápido demais 😅 Espera um pouquinho e manda de novo.",
    "Limite de mensagens por hora atingido. Em breve libera!",
  ]);
}

export function msgUndoSuccess(amountBRL: string, category: string, description: string): string {
  return pick([
    `↩️ Removi: ${amountBRL} ${description} (${category})`,
    `Pronto, apaguei a última: ${amountBRL} de ${description} em ${category} 🗑️`,
    `Desfeito! ${amountBRL} — ${description} (${category}) removido ✓`,
  ]);
}

export function msgUndoNothing(): string {
  return pick([
    "Nada pra desfazer nos últimos 10 minutos 🤷",
    "Não achei nenhuma despesa recente pra apagar (só os últimos 10min contam).",
    "Sem nada novo pra remover — /desfazer só vale nos 10min após registrar.",
  ]);
}

export interface QueryResultData {
  total: string;
  count: number;
  period: { start: string; end: string };
  top3Items: Array<{ name: string; amount: string }>;
  topCategories: Array<{ category: string; amount: string }>;
  userName: string | null;
  categoryFilter: string | null;
}

function formatPeriod(start: string, end: string): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} a ${fmt(end)}`;
}

export function msgQueryResult(data: QueryResultData): string {
  const who = data.userName ? ` (${data.userName})` : "";
  const cat = data.categoryFilter ? ` em ${data.categoryFilter}` : "";
  const period = formatPeriod(data.period.start, data.period.end);

  let msg = `📊 ${data.total}${cat}${who} — ${period}\n`;
  msg += `${data.count} despesa${data.count > 1 ? "s" : ""}\n\n`;

  if (!data.categoryFilter && data.topCategories.length > 0) {
    msg += "Por categoria:\n";
    for (const c of data.topCategories) {
      msg += `• ${c.category}: ${c.amount}\n`;
    }
    msg += "\n";
  }

  msg += "Maiores:\n";
  for (const item of data.top3Items) {
    msg += `• ${item.name}: ${item.amount}\n`;
  }

  return msg.trim();
}

export function msgQueryEmpty(
  userName: string | null,
  start: string,
  end: string,
): string {
  const who = userName ? ` de ${userName}` : "";
  const period = formatPeriod(start, end);
  return pick([
    `Nenhuma despesa${who} encontrada em ${period} 🤷`,
    `Não achei nada${who} nesse período (${period}).`,
  ]);
}

export function msgImageUnsupported(motivo?: string): string {
  const base = pick([
    "Essa imagem não parece cupom fiscal nem comprovante de Pix.",
    "Não consegui ler isso como cupom ou Pix.",
    "Hmm, essa foto não bateu com cupom nem comprovante de transferência.",
  ]);
  const tail = motivo ? ` (${motivo}).` : ".";
  return `${base}${tail} Manda outra ou descreve por texto.`;
}

export function msgImageDownloadError(): string {
  return pick([
    "⚠️ Não consegui baixar a imagem aqui. Tenta enviar de novo?",
    "⚠️ A foto não chegou inteira. Reenvia, por favor.",
  ]);
}
