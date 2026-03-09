import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { runAgent, type AgentResult } from "./base-agent.js";
import { config } from "../config.js";
import {
  connectToRevenueCatMCP,
  createMcpToolHandlers,
} from "../tools/mcp-client.js";

// Filesystem tools available to the Content Agent
const filesystemTools: Anthropic.Messages.Tool[] = [
  {
    name: "write_file",
    description:
      "Write content to a file in the project. Use this to save blog posts, tutorials, or code samples.",
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description:
            "Relative path from project root (e.g., 'docs/_posts/2026-03-09-my-post.md')",
        },
        content: {
          type: "string",
          description: "The full content to write to the file",
        },
      },
      required: ["filepath", "content"],
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from the project. Use this to check existing content, read SOUL.md, or review previous posts.",
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description: "Relative path from project root",
        },
      },
      required: ["filepath"],
    },
  },
  {
    name: "list_directory",
    description: "List files in a directory. Use to see existing content.",
    input_schema: {
      type: "object" as const,
      properties: {
        dirpath: {
          type: "string",
          description:
            "Relative path from project root (e.g., 'content/posts')",
        },
      },
      required: ["dirpath"],
    },
  },
];

// Filesystem tool handlers
const filesystemHandlers: Record<string, (input: any) => Promise<string>> = {
  write_file: async (input: { filepath: string; content: string }) => {
    const fullPath = path.join(config.paths.root, input.filepath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, input.content, "utf-8");
    return `File written successfully: ${input.filepath} (${input.content.length} chars)`;
  },

  read_file: async (input: { filepath: string }) => {
    const fullPath = path.join(config.paths.root, input.filepath);
    if (!fs.existsSync(fullPath)) {
      return `Error: File not found: ${input.filepath}`;
    }
    return fs.readFileSync(fullPath, "utf-8");
  },

  list_directory: async (input: { dirpath: string }) => {
    const fullPath = path.join(config.paths.root, input.dirpath);
    if (!fs.existsSync(fullPath)) {
      return `Error: Directory not found: ${input.dirpath}`;
    }
    const files = fs.readdirSync(fullPath);
    return files.filter((f) => f !== ".gitkeep").join("\n") || "(empty)";
  },
};

const CONTENT_AGENT_RULES = `You are the Content Agent for Shipcat. Your ONLY job is creating high-quality technical content about RevenueCat.

## What You Create
- Blog posts (saved to docs/_posts/YYYY-MM-DD-slug.md with Jekyll frontmatter)
- Tutorials (saved to content/tutorials/)
- Code samples (saved to content/code-samples/)
- Case studies (saved to content/case-studies/)

## Content Rules (from AGENTS.md)
- Every post must include: working code OR real data OR actionable steps
- No filler introductions — start with the problem or result
- Include what went wrong, not just what went right
- End with a clear takeaway

## Blog Post Format (Jekyll)
\`\`\`
---
layout: post
title: "Your Title Here"
date: YYYY-MM-DD
tags: [revenuecat, relevant-tags]
author: Shipcat
---

Content here...
\`\`\`

## RevenueCat MCP Tools
You have access to RevenueCat's MCP Server tools (prefixed with rc_). These let you:
- Query real customer and subscription data
- Look up products, entitlements, and offerings
- Get revenue charts and analytics
- Manage the full subscription lifecycle

Use these tools to get REAL DATA for your content. Don't make up numbers — query the MCP Server.

## Today's Date
Today is ${new Date().toISOString().split("T")[0]}. Use this for blog post dates.

## Voice
Write as Shipcat: direct, ironic when appropriate, technical but accessible, always data-backed.`;

export async function runContentAgent(task: string): Promise<AgentResult> {
  console.error(`  📝 [Content Agent] Working on: ${task.substring(0, 80)}...`);

  // Connect to RevenueCat MCP and get tools
  const mcpTools = await connectToRevenueCatMCP();
  const mcpHandlers = createMcpToolHandlers();

  // Combine filesystem tools + MCP tools
  const allTools = [...filesystemTools, ...mcpTools];
  const allHandlers = { ...filesystemHandlers, ...mcpHandlers };

  return runAgent(task, {
    name: "content",
    extraContext: CONTENT_AGENT_RULES,
    tools: allTools,
    toolHandlers: allHandlers,
  });
}
