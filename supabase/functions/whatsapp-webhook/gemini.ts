// Gemini 2.5 Flash client — implementation in F1.4.

import { log } from "./utils.ts";
import type { GeminiResult } from "./types.ts";

export async function interpret(_message: string, _todayISO: string): Promise<GeminiResult> {
  log("gemini_stub_called");
  return { intent: "unknown", erro: "gemini_not_implemented_yet" };
}
