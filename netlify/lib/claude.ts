import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();
export const MODEL = "claude-sonnet-5-5"; // chosen in CLAUDE.md

type ToolHandler = (input: any) => Promise<string>;

interface AgentOptions {
  system: string;
  prompt: string;
  tools: Anthropic.Beta.BetaToolUnion[];
  handlers: Record<string, ToolHandler>; // our own tools; server tools (web search/fetch) need none
  finishTool: string; // the agent is done when it calls this tool; its input is the result
  maxToolCalls: number; // cap on our own tool calls so a scan stays fast
  onBlock?: (block: Anthropic.Beta.BetaContentBlock) => void | Promise<void>; // see every block (logging, URL tracking)
  checkFinish?: (input: any) => string | null; // return a problem to send the answer back for another try
}

// The SDK already retries rate limits and server errors. We also saw a one-off empty 403
// on a cold start, so give any failed call one more try after a short pause.
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    console.warn("Claude call failed, retrying once:", (err as Error).message);
    await new Promise((r) => setTimeout(r, 1500));
    return call();
  }
}

// The agent loop: ask Claude, run the tools it picks, send results back, repeat
// until it calls the finish tool.
export async function runAgent<T>(opts: AgentOptions): Promise<T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  let toolCalls = 0;
  let retries = 0;

  for (let turn = 0; turn < 15; turn++) {
    const res = await withRetry(() => anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // If a safety check declines the request, the API retries it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: opts.system,
      tools: opts.tools,
      messages,
    }));
    if (res.stop_reason === "refusal") throw new Error("Claude declined this request");

    for (const block of res.content) await opts.onBlock?.(block);
    messages.push({ role: "assistant", content: res.content });

    // A long web search/fetch can pause mid-turn; sending the turn back resumes it.
    if (res.stop_reason === "pause_turn") continue;

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const finish = toolUses.find((t) => t.name === opts.finishTool);
    if (finish) {
      const problem = retries < 2 ? opts.checkFinish?.(finish.input) : null;
      if (!problem) return finish.input as T;
      retries++;
      // Every tool_use needs a result; the finish call gets the problem, any others are skipped.
      messages.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          is_error: true,
          content: t.id === finish.id ? problem : "Skipped.",
        })),
      });
      continue;
    }

    if (toolUses.length === 0) {
      messages.push({ role: "user", content: `Call the ${opts.finishTool} tool now with your final answer.` });
      continue;
    }

    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        toolCalls++;
        if (toolCalls > opts.maxToolCalls) {
          return {
            type: "tool_result",
            tool_use_id: t.id,
            is_error: true,
            content: `No more lookups are available for this task. Call ${opts.finishTool} now with what you have; describe anything unchecked as "couldn't confirm on the page".`,
          };
        }
        const handler = opts.handlers[t.name];
        try {
          if (!handler) throw new Error(`Unknown tool ${t.name}`);
          return { type: "tool_result", tool_use_id: t.id, content: await handler(t.input) };
        } catch (err) {
          return { type: "tool_result", tool_use_id: t.id, is_error: true, content: String((err as Error).message) };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent ran out of turns without finishing");
}
