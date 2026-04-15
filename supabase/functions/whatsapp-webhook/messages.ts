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
