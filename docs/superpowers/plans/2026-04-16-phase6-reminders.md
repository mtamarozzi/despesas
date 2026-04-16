# Phase 6 — Lembretes Automáticos (Outbound)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot envia lembrete via WhatsApp quando despesa pendente tem vencimento em 3 dias ou 1 dia, sem duplicar envios.

**Architecture:** Nova Edge Function `whatsapp-reminders` disparada por `pg_cron` diariamente às 9h BRT. Função consulta `expenses` filtrando por `status='pendente'` e `due_date` nas janelas T-3/T-1 em BRT, agrupa por household, envia mensagem template (sem Gemini), atualiza `last_reminded_at`.

**Tech Stack:** Deno Edge Function, Postgres (pg_cron + pg_net), Evolution API, template pt-BR nativo.

**Decisões:**
- **D1 (template fixo em vez de Gemini):** cada lembrete é mesmo shape; template elimina 1-2s de latência, custo $0 e ponto de falha extra (503 Gemini).
- **D2 (`last_reminded_at` + 2 janelas):** lembra em T-3 e T-1. Coluna `last_reminded_at::date < hoje_brt` previne duplo envio no mesmo dia.
- **D3 (uma mensagem por número ativo do household):** cada pessoa recebe as despesas do household, não só as suas.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/YYYYMMDDHHMMSS_expenses_last_reminded_at.sql` | DDL nova coluna + index |
| Create | `supabase/functions/whatsapp-reminders/index.ts` | HTTP handler com bearer auth + orquestração |
| Create | `supabase/functions/whatsapp-reminders/evolution.ts` | Cliente Evolution (copy do webhook) |
| Create | `supabase/functions/whatsapp-reminders/supabase-client.ts` | Factory service_role (copy) |
| Create | `supabase/functions/whatsapp-reminders/utils.ts` | `log`, `formatBRL`, `todayISOBrt` |
| Create | `supabase/functions/whatsapp-reminders/reminder-logic.ts` | Query + agrupamento + envio + mark |
| Create | `supabase/functions/whatsapp-reminders/messages.ts` | Template pt-BR do lembrete |
| Create | `supabase/functions/whatsapp-reminders/deno.json` | Deno config |

---

## Task 1: Migration `last_reminded_at`

**Files:**
- Create: `supabase/migrations/<timestamp>_expenses_last_reminded_at.sql`

- [ ] **Step 1: Apply migration via MCP `apply_migration`**

SQL:

```sql
ALTER TABLE public.expenses
  ADD COLUMN last_reminded_at timestamptz;

CREATE INDEX idx_expenses_reminder_window
  ON public.expenses (due_date, status)
  WHERE status = 'pendente';
```

Name: `expenses_last_reminded_at`

- [ ] **Step 2: Verify with `execute_sql`**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='expenses' AND column_name='last_reminded_at';
```

Expected: 1 row.

---

## Task 2: Scaffold Files

**Files:**
- Create: `supabase/functions/whatsapp-reminders/deno.json`
- Create: `supabase/functions/whatsapp-reminders/utils.ts`
- Create: `supabase/functions/whatsapp-reminders/evolution.ts`
- Create: `supabase/functions/whatsapp-reminders/supabase-client.ts`

- [ ] **Step 1: Create `deno.json`** (identical to webhook)

```json
{
  "imports": {
    "std/": "https://deno.land/std@0.224.0/"
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.window", "dom"]
  }
}
```

- [ ] **Step 2: Create `utils.ts`**

```typescript
export function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function todayISOBrt(): string {
  const now = new Date();
  const brtMs = now.getTime() - 3 * 60 * 60 * 1000;
  return new Date(brtMs).toISOString().slice(0, 10);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDueDatePtBr(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}
```

- [ ] **Step 3: Create `evolution.ts`** (copy do webhook)

```typescript
import { log } from "./utils.ts";

const BASE_URL = "https://evolution-evolution-api.u9givm.easypanel.host";
const INSTANCE = "casaflow";

function getApiKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key) throw new Error("EVOLUTION_API_KEY secret missing");
  return key;
}

export async function sendText(phoneNumber: string, text: string): Promise<void> {
  const url = `${BASE_URL}/message/sendText/${INSTANCE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: getApiKey(),
    },
    body: JSON.stringify({ number: phoneNumber, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    log("evolution_send_failed", { status: res.status, body, phone: phoneNumber });
    throw new Error(`Evolution sendText failed: ${res.status}`);
  }
  log("evolution_sent", { phone: phoneNumber, chars: text.length });
}
```

- [ ] **Step 4: Create `supabase-client.ts`** (copy do webhook)

```typescript
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
```

---

## Task 3: Reminder Message Template

**Files:**
- Create: `supabase/functions/whatsapp-reminders/messages.ts`

- [ ] **Step 1: Create `messages.ts`**

```typescript
import { formatBRL, formatDueDatePtBr } from "./utils.ts";

export interface ReminderExpense {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  category: string;
  window: "T-3" | "T-1";
}

export function formatReminderMessage(expenses: ReminderExpense[]): string {
  const count = expenses.length;
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  let msg = `⏰ Lembrete CasaFlow\n\n`;
  msg += count === 1
    ? `Você tem 1 conta pra pagar:\n\n`
    : `Você tem ${count} contas pra pagar (total ${formatBRL(total)}):\n\n`;

  const sorted = [...expenses].sort((a, b) => a.due_date.localeCompare(b.due_date));

  for (const e of sorted) {
    const when = e.window === "T-1" ? "amanhã" : formatDueDatePtBr(e.due_date);
    const flag = e.window === "T-1" ? " 🔴" : "";
    msg += `• ${formatBRL(Number(e.amount))} — ${e.name} (${e.category}) — ${when}${flag}\n`;
  }

  msg += `\nResponda "paguei [descrição]" quando quitar.`;
  return msg;
}
```

---

## Task 4: Reminder Logic

**Files:**
- Create: `supabase/functions/whatsapp-reminders/reminder-logic.ts`

- [ ] **Step 1: Create `reminder-logic.ts`**

```typescript
import { getServiceClient } from "./supabase-client.ts";
import { sendText } from "./evolution.ts";
import { addDaysISO, log, todayISOBrt } from "./utils.ts";
import { formatReminderMessage, type ReminderExpense } from "./messages.ts";

interface ExpenseRow {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  category: string;
  due_date: string;
  last_reminded_at: string | null;
}

interface WhatsappUserRow {
  phone_number: string;
  household_id: string;
  display_name: string;
}

export interface ReminderRunResult {
  today: string;
  windows: { t_minus_3: string; t_minus_1: string };
  expenses_matched: number;
  households_notified: number;
  messages_sent: number;
  errors: number;
}

export async function runReminders(): Promise<ReminderRunResult> {
  const supabase = getServiceClient();
  const today = todayISOBrt();
  const tMinus3 = addDaysISO(today, 3);
  const tMinus1 = addDaysISO(today, 1);

  log("reminder_run_start", { today, t_minus_3: tMinus3, t_minus_1: tMinus1 });

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, household_id, name, amount, category, due_date, last_reminded_at")
    .eq("status", "pendente")
    .in("due_date", [tMinus3, tMinus1]);

  if (error) {
    log("reminder_query_failed", { error: error.message });
    throw error;
  }

  const toRemind = (expenses ?? []).filter((e: ExpenseRow) => {
    if (!e.last_reminded_at) return true;
    return e.last_reminded_at.slice(0, 10) < today;
  }) as ExpenseRow[];

  if (toRemind.length === 0) {
    log("reminder_nothing_due", { today });
    return {
      today,
      windows: { t_minus_3: tMinus3, t_minus_1: tMinus1 },
      expenses_matched: 0,
      households_notified: 0,
      messages_sent: 0,
      errors: 0,
    };
  }

  const byHousehold = new Map<string, ReminderExpense[]>();
  for (const e of toRemind) {
    const window: "T-3" | "T-1" = e.due_date === tMinus1 ? "T-1" : "T-3";
    const item: ReminderExpense = {
      id: e.id,
      name: e.name,
      amount: Number(e.amount),
      due_date: e.due_date,
      category: e.category,
      window,
    };
    const list = byHousehold.get(e.household_id) ?? [];
    list.push(item);
    byHousehold.set(e.household_id, list);
  }

  const householdIds = [...byHousehold.keys()];
  const { data: users } = await supabase
    .from("whatsapp_users")
    .select("phone_number, household_id, display_name")
    .eq("active", true)
    .in("household_id", householdIds);

  const usersByHousehold = new Map<string, WhatsappUserRow[]>();
  for (const u of (users ?? []) as WhatsappUserRow[]) {
    const list = usersByHousehold.get(u.household_id) ?? [];
    list.push(u);
    usersByHousehold.set(u.household_id, list);
  }

  let messagesSent = 0;
  let errors = 0;
  const remindedIds: string[] = [];

  for (const [householdId, items] of byHousehold.entries()) {
    const recipients = usersByHousehold.get(householdId) ?? [];
    if (recipients.length === 0) {
      log("reminder_no_recipients", { household_id: householdId });
      continue;
    }
    const body = formatReminderMessage(items);

    for (const recipient of recipients) {
      try {
        await sendText(recipient.phone_number, body);
        messagesSent++;
      } catch (err) {
        errors++;
        log("reminder_send_failed", {
          phone: recipient.phone_number,
          error: (err as Error).message,
        });
      }
    }

    if (messagesSent > 0) {
      for (const item of items) remindedIds.push(item.id);
    }
  }

  if (remindedIds.length > 0) {
    const { error: updateError } = await supabase
      .from("expenses")
      .update({ last_reminded_at: new Date().toISOString() })
      .in("id", remindedIds);

    if (updateError) {
      log("reminder_mark_failed", { error: updateError.message, ids: remindedIds });
    }
  }

  const result: ReminderRunResult = {
    today,
    windows: { t_minus_3: tMinus3, t_minus_1: tMinus1 },
    expenses_matched: toRemind.length,
    households_notified: byHousehold.size,
    messages_sent: messagesSent,
    errors,
  };
  log("reminder_run_done", result as unknown as Record<string, unknown>);
  return result;
}
```

---

## Task 5: HTTP Handler

**Files:**
- Create: `supabase/functions/whatsapp-reminders/index.ts`

- [ ] **Step 1: Create `index.ts`**

```typescript
import { log } from "./utils.ts";
import { runReminders } from "./reminder-logic.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const expectedToken = Deno.env.get("REMINDERS_CRON_TOKEN");
  const authHeader = req.headers.get("authorization") ?? "";
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    log("reminder_auth_rejected");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runReminders();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMsg = (err as Error).message;
    log("reminder_run_failed", { error: errorMsg });
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

---

## Task 6: Deploy Function

- [ ] **Step 1: Deploy**

```bash
cd C:\Users\User\Documents\Despesas\ethereal-ledger
npx supabase functions deploy whatsapp-reminders --no-verify-jwt
```

Expected: `Deployed Functions on project jeyllykzwtixfzeybkkl: whatsapp-reminders`

- [ ] **Step 2: Set secret `REMINDERS_CRON_TOKEN`**

Generate random token in PowerShell:

```powershell
-join ((1..40) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 126) })
```

Then store in Supabase secrets via dashboard or CLI:

```bash
npx supabase secrets set REMINDERS_CRON_TOKEN="<generated-token>"
```

Save the token somewhere safe — needed for pg_cron setup.

---

## Task 7: Manual Validation

- [ ] **Step 1: Insert a test pending expense due tomorrow**

```sql
INSERT INTO expenses (user_id, household_id, name, amount, category, due_date, status, added_by_name)
SELECT user_id, household_id, 'Teste lembrete', 99.90, 'Habitação',
       (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date + 1, 'pendente',
       display_name || ' (Teste)'
FROM whatsapp_users
WHERE display_name = 'Marcelo'
LIMIT 1;
```

- [ ] **Step 2: Invoke function manually via curl**

```bash
curl -X POST "https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-reminders" \
  -H "Authorization: Bearer <REMINDERS_CRON_TOKEN>"
```

Expected JSON like:
```json
{
  "today": "2026-04-16",
  "windows": {"t_minus_3": "2026-04-19", "t_minus_1": "2026-04-17"},
  "expenses_matched": 1,
  "households_notified": 1,
  "messages_sent": 2,
  "errors": 0
}
```

And Marcelo + Rossana recebem WhatsApp "⏰ Lembrete CasaFlow...".

- [ ] **Step 3: Re-invoke imediatamente**

Expected: `expenses_matched: 0` (já foi marcado como `last_reminded_at = hoje`).

- [ ] **Step 4: Cleanup test expense**

```sql
DELETE FROM expenses WHERE name = 'Teste lembrete' AND added_by_name LIKE '% (Teste)';
```

---

## Task 8: pg_cron Setup

- [ ] **Step 1: Verify extensions**

```sql
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
```

Expected: 2 rows. If missing, enable via Supabase dashboard → Database → Extensions.

- [ ] **Step 2: Create cron job**

Run via `execute_sql` (NOT a committed migration — contém o token):

```sql
SELECT cron.schedule(
  'whatsapp-reminders-daily-9am-brt',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jeyllykzwtixfzeybkkl.supabase.co/functions/v1/whatsapp-reminders',
    headers := '{"Authorization":"Bearer <REMINDERS_CRON_TOKEN>","Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

Note: `0 12 * * *` UTC = 09:00 America/Sao_Paulo (BRT UTC-3).

- [ ] **Step 3: Verify cron job exists**

```sql
SELECT jobid, schedule, jobname, active FROM cron.job
WHERE jobname = 'whatsapp-reminders-daily-9am-brt';
```

Expected: 1 row, active=true.

---

## Task 9: Commit + Push

- [ ] **Step 1: Commit function + migration + plan**

```bash
cd C:\Users\User\Documents\Despesas\ethereal-ledger
git add supabase/functions/whatsapp-reminders/ supabase/migrations/*last_reminded_at* docs/superpowers/plans/2026-04-16-phase6-reminders.md
git commit -m "feat(whatsapp): Fase 6 — lembretes automáticos T-3/T-1"
git push
```

---

## Spec Coverage Check

| Plan Item | Task |
|-----------|------|
| 6.1 — pg_cron 9h BRT chamando whatsapp-reminders | Task 8 |
| 6.2 — SELECT pending + due_date window | Task 4 (reminder-logic) |
| 6.3 — Agrupar por household, enviar pra cada ativo | Task 4 |
| 6.4 — Template fixo (decisão D1 override) | Task 3 (messages) |
| 6.5 — `last_reminded_at` + janelas T-3 e T-1 (D2 override) | Task 1 (migration) + Task 4 (logic) |
