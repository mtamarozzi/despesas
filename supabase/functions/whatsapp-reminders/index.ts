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
