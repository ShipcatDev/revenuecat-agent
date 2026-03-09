import Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentResult } from "./base-agent.js";
import {
  connectToRevenueCatMCP,
  createMcpToolHandlers,
} from "../tools/mcp-client.js";

const DATA_AGENT_RULES = `You are the Data Agent for Shipcat. Your job is to query RevenueCat's MCP Server and return structured data.

## What You Do
- Query RevenueCat data using MCP tools (prefixed with rc_)
- Summarize results in a clear, readable format
- Provide data-driven insights when relevant

## Rules
- Always present data clearly with numbers and specifics
- If a query returns no results, say so explicitly
- Don't make up data — only report what the MCP tools return
- Be concise — data, not essays

## Today's Date
Today is ${new Date().toISOString().split("T")[0]}.`;

export async function runDataAgent(task: string): Promise<AgentResult> {
  console.error(`  📊 [Data Agent] Querying: ${task.substring(0, 80)}...`);

  // Connect to RevenueCat MCP and get tools
  const mcpTools = await connectToRevenueCatMCP();
  const mcpHandlers = createMcpToolHandlers();

  if (mcpTools.length === 0) {
    return {
      text: "Cannot query RevenueCat data: MCP connection not available. Check that REVENUECAT_API_KEY is set.",
      toolCalls: [],
    };
  }

  return runAgent(task, {
    name: "data",
    extraContext: DATA_AGENT_RULES,
    tools: mcpTools,
    toolHandlers: mcpHandlers,
  });
}
