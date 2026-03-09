import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { buildSystemPrompt } from "../prompts/soul.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export interface AgentResult {
  text: string;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
}

export interface AgentOptions {
  name: string;
  systemPromptName?: string;
  tools?: Anthropic.Messages.Tool[];
  toolHandlers?: Record<string, (input: any) => Promise<string>>;
  extraContext?: string;
  model?: string;
}

export async function runAgent(
  message: string,
  options: AgentOptions
): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(
    options.systemPromptName || options.name,
    options.extraContext
  );

  const tools = options.tools || [];
  const toolHandlers = options.toolHandlers || {};
  const toolCalls: AgentResult["toolCalls"] = [];

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: message },
  ];

  const debug = process.env.SHIPCAT_DEBUG === "true";

  // Agentic loop: send → tool calls → send results → repeat
  let maxIterations = 10;
  let lastToolResult = "";

  while (maxIterations-- > 0) {
    if (debug) console.error(`  [debug] Agent "${options.name}" iteration ${10 - maxIterations}`);

    const response = await anthropic.messages.create({
      model: options.model || config.anthropic.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    if (debug) console.error(`  [debug] stop_reason=${response.stop_reason}, blocks=${response.content.length}`);

    // Collect text and tool_use blocks
    const textParts: string[] = [];
    const pendingToolUses: Array<{ id: string; name: string; input: unknown }> = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        pendingToolUses.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    const currentText = textParts.join("\n").trim();

    // If no tool calls pending, we're done
    if (pendingToolUses.length === 0) {
      // Use Claude's text response. If empty, fall back to the last tool result.
      const finalText = currentText || lastToolResult;
      if (debug) console.error(`  [debug] Done. text=${finalText.substring(0, 80)}...`);
      return { text: finalText, toolCalls };
    }

    // Process tool calls
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const tc of pendingToolUses) {
      if (debug) console.error(`  [debug] Tool call: ${tc.name}`);
      const handler = toolHandlers[tc.name];
      let result: string;
      if (handler) {
        try {
          result = await handler(tc.input);
        } catch (err: any) {
          result = `Error: ${err.message}`;
        }
      } else {
        result = `Error: No handler for tool "${tc.name}"`;
      }

      toolCalls.push({ name: tc.name, input: tc.input, result });
      lastToolResult = result; // Track for fallback
      toolResults.push({
        type: "tool_result",
        tool_use_id: tc.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { text: lastToolResult || "[Max iterations reached]", toolCalls };
}
