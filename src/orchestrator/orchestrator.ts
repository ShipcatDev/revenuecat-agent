import Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentResult } from "../agents/base-agent.js";
import { runContentAgent } from "../agents/content-agent.js";
import { runDataAgent } from "../agents/data-agent.js";
import { runPublisherAgent } from "../agents/publisher-agent.js";
import {
  saveMemory,
  searchMemories,
  logConversation,
  buildMemoryContext,
} from "../memory/memory-store.js";

// Sub-agent registry: maps names to their run functions
const subAgents: Record<string, (task: string) => Promise<AgentResult>> = {
  content: runContentAgent,
  data: runDataAgent,
  publisher: runPublisherAgent,
  // engagement: runEngagementAgent, // TODO: Paso 6
  // feedback: runFeedbackAgent,     // TODO: Paso 6
  // reporter: runReporterAgent,     // TODO: Paso 6
};

// Tools that the orchestrator exposes to Claude for routing
const orchestratorTools: Anthropic.Messages.Tool[] = [
  {
    name: "delegate_to_content_agent",
    description:
      "Delegate a content creation task to the Content Agent. Use for writing blog posts, tutorials, code samples, documentation, or any technical content about RevenueCat. The content agent also has access to RevenueCat MCP tools for real data.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "Detailed description of what content to create",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_to_data_agent",
    description:
      "Delegate a data query to the Data Agent. Use for querying RevenueCat's MCP Server — fetching apps, customers, subscriptions, products, entitlements, offerings, revenue charts, transactions, or any RevenueCat data.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description:
            "What data to query from RevenueCat (e.g., 'List all apps', 'Get revenue overview', 'Show products and entitlements')",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_to_publisher_agent",
    description:
      "Delegate a publishing task to the Publisher Agent. Use for committing and pushing content to GitHub (which deploys to GitHub Pages), checking git status, or listing published posts.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description:
            "What to publish (e.g., 'Publish all new blog posts', 'Push latest changes to GitHub', 'Show git status')",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "save_memory",
    description:
      "Save important information to persistent memory. Use this to remember facts, decisions, insights, or anything that should persist across sessions.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Category of the memory (e.g., 'insight', 'decision', 'feedback', 'learning', 'metric', 'contact')",
        },
        content: {
          type: "string",
          description: "The information to remember",
        },
      },
      required: ["category", "content"],
    },
  },
  {
    name: "search_memory",
    description:
      "Search through persistent memories. Use this to recall previous information, decisions, or context.",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "Keyword to search for in memories",
        },
        category: {
          type: "string",
          description:
            "Optional category filter (e.g., 'insight', 'decision', 'feedback')",
        },
      },
      required: [],
    },
  },
];

// Tool handlers for the orchestrator
const orchestratorHandlers: Record<string, (input: any) => Promise<string>> = {
  delegate_to_content_agent: async (input: { task: string }) => {
    console.error(`\n  🐱 [Orchestrator] Delegating to Content Agent...`);
    const result = await runContentAgent(input.task);
    return result.text;
  },
  delegate_to_data_agent: async (input: { task: string }) => {
    console.error(`\n  🐱 [Orchestrator] Delegating to Data Agent...`);
    const result = await runDataAgent(input.task);
    return result.text;
  },
  delegate_to_publisher_agent: async (input: { task: string }) => {
    console.error(`\n  🐱 [Orchestrator] Delegating to Publisher Agent...`);
    const result = await runPublisherAgent(input.task);
    return result.text;
  },
  save_memory: async (input: { category: string; content: string }) => {
    const memory = saveMemory(input.category, input.content);
    return `Memory saved (id=${memory.id}, category="${memory.category}")`;
  },
  search_memory: async (input: { keyword?: string; category?: string }) => {
    const memories = searchMemories({
      keyword: input.keyword,
      category: input.category,
      limit: 10,
    });
    if (memories.length === 0) return "No memories found matching that query.";
    return memories
      .map((m) => `[${m.category}] (${m.created_at}) ${m.content}`)
      .join("\n");
  },
};

const ORCHESTRATOR_PROMPT = `You are the orchestrator for Shipcat. Your job is to receive messages and decide how to handle them.

## Routing Rules

- **Content creation** (posts, tutorials, code samples, documentation) → delegate_to_content_agent
- **RevenueCat data queries** (apps, customers, subscriptions, products, offerings, revenue, analytics) → delegate_to_data_agent
- **Publishing** (commit, push, deploy, publish blog posts, git operations) → delegate_to_publisher_agent
- **Simple questions, greetings, status, anything else** → respond directly with text (do NOT use any tool)
- **Anything about RevenueCat's product, SDK, API as a knowledge question** → respond directly with text
- **Anything requiring REAL RevenueCat data** → delegate_to_data_agent

## Important
- When you respond directly (no tool call), speak as Shipcat (ironic, direct, technical, data-driven)
- When you delegate, provide a DETAILED task description so the sub-agent has full context
- Always pick the most appropriate action for the task
- For greetings, introductions, and general questions: just reply as text. No need for any tool.`;

export async function runOrchestrator(
  message: string,
  channel = "terminal"
): Promise<string> {
  // Build memory context for this query
  const memoryContext = buildMemoryContext(message);
  const fullContext = memoryContext
    ? `${ORCHESTRATOR_PROMPT}\n\n${memoryContext}`
    : ORCHESTRATOR_PROMPT;

  const result = await runAgent(message, {
    name: "orchestrator",
    systemPromptName: undefined, // Uses SOUL.md directly
    extraContext: fullContext,
    tools: orchestratorTools,
    toolHandlers: orchestratorHandlers,
  });

  // Log conversation for future context
  try {
    logConversation({
      channel,
      userMessage: message,
      agentResponse: result.text,
      agentName: "orchestrator",
      toolCalls: result.toolCalls,
    });
  } catch {
    // Don't fail on logging errors
  }

  return result.text;
}
