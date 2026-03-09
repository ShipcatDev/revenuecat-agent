import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

// Singleton MCP client instance
let mcpClient: Client | null = null;
let mcpTools: Anthropic.Messages.Tool[] = [];
let mcpToolNames: Set<string> = new Set();

/**
 * Connect to RevenueCat's MCP Server and discover available tools.
 * Returns the tools converted to Anthropic format.
 */
export async function connectToRevenueCatMCP(): Promise<Anthropic.Messages.Tool[]> {
  if (mcpClient && mcpTools.length > 0) {
    return mcpTools; // Already connected
  }

  if (!config.revenuecat.apiKey) {
    console.error("  ⚠️  [MCP] No REVENUECAT_API_KEY set, skipping MCP connection");
    return [];
  }

  console.error("  🔌 [MCP] Connecting to RevenueCat MCP Server...");

  try {
    const client = new Client(
      { name: "shipcat", version: "0.1.0" },
      { capabilities: {} }
    );

    const transport = new StreamableHTTPClientTransport(
      new URL(config.revenuecat.mcpUrl),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${config.revenuecat.apiKey}`,
          },
        },
      }
    );

    await client.connect(transport);
    mcpClient = client;

    // Discover all available tools
    const allTools: Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }> = [];

    let cursor: string | undefined;
    do {
      const result = await client.listTools({ cursor });
      allTools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);

    console.error(`  🔌 [MCP] Connected! Found ${allTools.length} tools`);

    // Convert MCP tools to Anthropic tool format
    mcpTools = allTools.map((tool) => ({
      name: `rc_${tool.name}`, // Prefix with rc_ to avoid name collisions
      description: tool.description || `RevenueCat MCP tool: ${tool.name}`,
      input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
    }));

    mcpToolNames = new Set(mcpTools.map((t) => t.name));

    // Log discovered tools
    const debug = process.env.SHIPCAT_DEBUG === "true";
    if (debug) {
      for (const tool of allTools) {
        console.error(`    - ${tool.name}: ${(tool.description || "").substring(0, 60)}`);
      }
    }

    return mcpTools;
  } catch (err: any) {
    console.error(`  ❌ [MCP] Connection failed: ${err.message}`);
    return [];
  }
}

/**
 * Call a tool on RevenueCat's MCP server.
 * Tool name should include the rc_ prefix.
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  if (!mcpClient) {
    return "Error: MCP client not connected. Call connectToRevenueCatMCP() first.";
  }

  // Remove rc_ prefix for the actual MCP call
  const mcpToolName = toolName.startsWith("rc_")
    ? toolName.slice(3)
    : toolName;

  const debug = process.env.SHIPCAT_DEBUG === "true";
  if (debug) {
    console.error(`  🔌 [MCP] Calling tool: ${mcpToolName}`);
  }

  try {
    const result = await mcpClient.callTool({
      name: mcpToolName,
      arguments: args,
    });

    // result.content is an array of content blocks
    const contentBlocks = Array.isArray(result.content)
      ? (result.content as Array<{ type: string; text?: string; [key: string]: unknown }>)
      : [];

    if (result.isError) {
      const errorContent = contentBlocks
        .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .join("\n");
      return `MCP Error: ${errorContent || "Unknown error"}`;
    }

    // Extract text from result content blocks
    const textParts = contentBlocks
      .map((c) => {
        if (c.type === "text") return c.text || "";
        if (c.type === "resource") return JSON.stringify(c);
        return JSON.stringify(c);
      })
      .filter(Boolean);

    return textParts.join("\n") || "Tool executed successfully (no output)";
  } catch (err: any) {
    return `MCP call failed: ${err.message}`;
  }
}

/**
 * Check if a tool name belongs to MCP (has rc_ prefix)
 */
export function isMcpTool(toolName: string): boolean {
  return mcpToolNames.has(toolName);
}

/**
 * Create tool handlers for all MCP tools.
 * Returns a map of tool_name → handler function.
 */
export function createMcpToolHandlers(): Record<
  string,
  (input: any) => Promise<string>
> {
  const handlers: Record<string, (input: any) => Promise<string>> = {};

  for (const toolName of mcpToolNames) {
    handlers[toolName] = async (input: Record<string, unknown>) => {
      return callMcpTool(toolName, input);
    };
  }

  return handlers;
}

/**
 * Disconnect from the MCP server.
 */
export async function disconnectMCP(): Promise<void> {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // Ignore close errors
    }
    mcpClient = null;
    mcpTools = [];
    mcpToolNames = new Set();
  }
}
