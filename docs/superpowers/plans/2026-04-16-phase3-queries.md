# Phase 3 — Consultas WhatsApp (Intent `query`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users ask spending questions via WhatsApp ("quanto gastei esse mês?") and get formatted pt-BR summaries.

**Architecture:** Extend the single Gemini call to classify `query` intent and extract `{period, category?, user?}`. A new `handlers/query.ts` builds a Supabase SELECT with resolved date filters, formats the result as a short WhatsApp message with total + top 3 items.

**Tech Stack:** Deno Edge Function, Gemini 2.5 Flash (structured JSON), Supabase PostgREST.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `types.ts` | Add `QueryExtraction`, update `GeminiResult` |
| Modify | `schemas.ts` | Add `GEMINI_QUERY_SCHEMA` fields to response schema |
| Modify | `prompts.ts` | Extend system prompt with query intent + examples |
| Modify | `gemini.ts` | Update `GeminiEnvelope` to include `query` payload |
| Create | `handlers/query.ts` | Build SELECT, format response |
| Modify | `messages.ts` | Add `msgQueryResult`, `msgQueryEmpty` |
| Modify | `index.ts` | Route `query` intent to handler |

---

## Task 1: Extend Types

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/types.ts`

- [ ] **Step 1: Add QueryExtraction type and update GeminiResult**

```typescript
// Add after ExpenseExtraction interface:

export type QueryPeriod = "today" | "week" | "month" | "custom";

export interface QueryExtraction {
  period: QueryPeriod;
  category?: string;
  user_name?: string;
  custom_start?: string;
  custom_end?: string;
}

// Update GeminiResult — add queryPayload:
export interface GeminiResult {
  intent: Intent;
  payload?: ExpenseExtraction;
  queryPayload?: QueryExtraction;
  erro?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/types.ts
git commit -m "feat(phase3): add QueryExtraction type and extend GeminiResult"
```

---

## Task 2: Extend Schema for Gemini

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/schemas.ts`

- [ ] **Step 1: Add query to INTENT_ENUM and add query object to schema**

```typescript
export const INTENT_ENUM = ["expense", "query", "unknown", "undo"] as const;

// Add QUERY_PERIOD_ENUM:
export const QUERY_PERIOD_ENUM = ["today", "week", "month", "custom"] as const;

// Add query property inside GEMINI_RESPONSE_SCHEMA.properties (after "expense"):
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/schemas.ts
git commit -m "feat(phase3): add query schema to Gemini response"
```

---

## Task 3: Update System Prompt

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/prompts.ts`

- [ ] **Step 1: Add query intent section to EXPENSE_SYSTEM_PROMPT**

Add after the `undo` intent definition and before "Se intent=undo":

```
- query: usuário pergunta sobre gastos, totais, resumos. Ex: "quanto gastei esse mês?", "quanto foi gasto em alimentação na semana", "resume abril pra mim", "quanto a Rossana gastou hoje".
```

Add new section after "Se intent=unknown":

```
Se intent=query: preencha query com os filtros detectados. expense=null e erro=null.
  - period: "today" (hoje), "week" (esta semana, seg-dom), "month" (este mês), "custom" (datas específicas como "em abril", "semana passada").
  - category: nome EXATO da categoria se mencionada, senão omitir.
  - user_name: nome da pessoa se mencionada ("Rossana", "Marcelo"), senão omitir.
  - custom_start/custom_end: ISO YYYY-MM-DD, só quando period="custom". "abril" → custom_start="2026-04-01", custom_end="2026-04-30". "semana passada" → calcular seg-dom da semana anterior.
```

Update the `unknown` definition to exclude queries:
```
- unknown: outras coisas que NÃO são despesa nem consulta (saudação, conversa fiada). Ex: "oi", "obrigado".
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/prompts.ts
git commit -m "feat(phase3): extend system prompt with query intent"
```

---

## Task 4: Update Gemini Client

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/gemini.ts`

- [ ] **Step 1: Update GeminiEnvelope and return mapping**

Add to GeminiEnvelope interface:

```typescript
interface GeminiEnvelope {
  intent: "expense" | "query" | "unknown" | "undo";
  expense?: { ... } | null;  // existing
  query?: {
    period: "today" | "week" | "month" | "custom";
    category?: string;
    user_name?: string;
    custom_start?: string;
    custom_end?: string;
  } | null;
  erro?: string | null;
}
```

Update the return statement at the end of `interpret()`:

```typescript
  return {
    intent: envelope.intent,
    payload: envelope.expense ?? undefined,
    queryPayload: envelope.query ?? undefined,
    erro: envelope.erro ?? undefined,
  };
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/gemini.ts
git commit -m "feat(phase3): extend Gemini envelope with query payload"
```

---

## Task 5: Create Query Handler

**Files:**
- Create: `supabase/functions/whatsapp-webhook/handlers/query.ts`

- [ ] **Step 1: Create handlers/query.ts**

```typescript
import type { QueryExtraction, WhatsappUser } from "../types.ts";
import { getServiceClient } from "../supabase-client.ts";
import { formatBRL, log } from "../utils.ts";
import { msgQueryEmpty, msgQueryResult } from "../messages.ts";

function resolveDateRange(
  q: QueryExtraction,
  todayISO: string,
): { start: string; end: string } {
  const today = new Date(todayISO + "T00:00:00Z");

  switch (q.period) {
    case "today":
      return { start: todayISO, end: todayISO };

    case "week": {
      const day = today.getUTCDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMon);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10),
      };
    }

    case "month": {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth();
      const first = new Date(Date.UTC(y, m, 1));
      const last = new Date(Date.UTC(y, m + 1, 0));
      return {
        start: first.toISOString().slice(0, 10),
        end: last.toISOString().slice(0, 10),
      };
    }

    case "custom":
      return {
        start: q.custom_start ?? todayISO,
        end: q.custom_end ?? todayISO,
      };
  }
}

async function resolveUserId(
  householdId: string,
  userName: string,
): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("whatsapp_users")
    .select("user_id, display_name")
    .eq("household_id", householdId)
    .eq("active", true);

  if (!data) return null;
  const normalized = userName.toLowerCase();
  const match = data.find(
    (u: { display_name: string }) =>
      u.display_name.toLowerCase().includes(normalized),
  );
  return match?.user_id ?? null;
}

interface ExpenseRow {
  name: string;
  amount: number;
  category: string;
}

export async function handleQuery(
  user: WhatsappUser,
  query: QueryExtraction,
  todayISO: string,
): Promise<string> {
  const supabase = getServiceClient();
  const { start, end } = resolveDateRange(query, todayISO);

  let builder = supabase
    .from("expenses")
    .select("name, amount, category")
    .eq("household_id", user.household_id)
    .gte("due_date", start)
    .lte("due_date", end);

  if (query.category) {
    builder = builder.eq("category", query.category);
  }

  if (query.user_name) {
    const targetUserId = await resolveUserId(
      user.household_id,
      query.user_name,
    );
    if (targetUserId) {
      builder = builder.eq("user_id", targetUserId);
    } else {
      return msgQueryEmpty(query.user_name, start, end);
    }
  }

  const { data: rows, error } = await builder.order("amount", {
    ascending: false,
  });

  if (error) {
    log("query_select_failed", { error: error.message });
    throw error;
  }

  const expenses = (rows ?? []) as ExpenseRow[];

  if (expenses.length === 0) {
    return msgQueryEmpty(query.user_name ?? null, start, end);
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const top3 = expenses.slice(0, 3);

  const categoryTotals = new Map<string, number>();
  for (const e of expenses) {
    categoryTotals.set(
      e.category,
      (categoryTotals.get(e.category) ?? 0) + Number(e.amount),
    );
  }
  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return msgQueryResult({
    total: formatBRL(total),
    count: expenses.length,
    period: { start, end },
    top3Items: top3.map((e) => ({
      name: e.name,
      amount: formatBRL(Number(e.amount)),
    })),
    topCategories: topCategories.map(([cat, amt]) => ({
      category: cat,
      amount: formatBRL(amt),
    })),
    userName: query.user_name ?? null,
    categoryFilter: query.category ?? null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/handlers/query.ts
git commit -m "feat(phase3): create query handler with date resolution and formatting"
```

---

## Task 6: Add Query Messages

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/messages.ts`

- [ ] **Step 1: Add msgQueryResult and msgQueryEmpty**

```typescript
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
    const [y, m, day] = d.split("-");
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
```

Note: `formatPeriod` is a new helper defined inside `messages.ts`. The `pick` function already exists in the file.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/messages.ts
git commit -m "feat(phase3): add query result and empty messages"
```

---

## Task 7: Wire Query Intent into Router

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

- [ ] **Step 1: Add import for query handler**

```typescript
import { handleQuery } from "./handlers/query.ts";
```

- [ ] **Step 2: Add query routing block after the undo block in the try/catch**

Insert after the `if (result.intent === "undo") { ... }` block and before `if (result.intent === "expense" && result.payload)`:

```typescript
    if (result.intent === "query" && result.queryPayload) {
      const response = await handleQuery(user, result.queryPayload, todayISO());
      await clearPendingContext(phone);
      await sendText(phone, response);
      await logAudit({
        message_id: messageId,
        phone_number: phone,
        direction: "inbound",
        intent: "query",
        action: "query_answered",
        success: true,
        latency_ms: Date.now() - started,
        raw_text: rawText,
      });
      return new Response("ok", { status: 200 });
    }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(phase3): route query intent to handler"
```

---

## Task 8: Deploy and Test

- [ ] **Step 1: Deploy edge function**

```bash
cd ethereal-ledger
npx supabase functions deploy whatsapp-webhook --no-verify-jwt
```

- [ ] **Step 2: Send test messages via WhatsApp**

Test these messages (from Marcelo or Rossana):
1. `"quanto gastei hoje"` → should return today's expenses summary
2. `"quanto gastei esse mês"` → should return month summary with categories
3. `"quanto foi gasto em alimentação na semana"` → filtered by category
4. `"quanto a Rossana gastou hoje"` → filtered by user
5. `"resume abril pra mim"` → custom period (full month)
6. `"paguei 50 de almoço"` → should still work (expense, not query) — regression check

- [ ] **Step 3: Verify audit log has query entries**

```sql
SELECT ts, phone_number, intent, action, success, latency_ms, raw_text
FROM whatsapp_audit_log
WHERE intent = 'query'
ORDER BY ts DESC
LIMIT 10;
```

- [ ] **Step 4: Final commit + push**

```bash
git add -A
git commit -m "feat(phase3): complete query intent — consultas via WhatsApp"
git push
```

---

## Spec Coverage Check

| Plan Item | Task |
|-----------|------|
| 3.1 — Prompt + schema query | Task 2 (schema) + Task 3 (prompt) |
| 3.2 — Handler query.ts com SELECT | Task 5 |
| 3.3 — Formatação pt-BR (R$ + top 3) | Task 6 |
| 3.4 — Router detecta query vs expense | Task 4 (gemini) + Task 7 (index) |
| 3.5 — "quanto a Rossana gastou" via display_name | Task 5 (`resolveUserId`) |
