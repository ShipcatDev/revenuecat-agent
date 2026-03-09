import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { runAgent, type AgentResult } from "./base-agent.js";
import { config } from "../config.js";
import { githubTools, githubHandlers } from "../tools/github-tools.js";

// Filesystem tools for the publisher (read-only access to check content)
const publisherFileTools: Anthropic.Messages.Tool[] = [
  {
    name: "read_file",
    description:
      "Read a file from the project. Use this to review content before publishing.",
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
    description: "List files in a directory.",
    input_schema: {
      type: "object" as const,
      properties: {
        dirpath: {
          type: "string",
          description: "Relative path from project root",
        },
      },
      required: ["dirpath"],
    },
  },
];

const publisherFileHandlers: Record<string, (input: any) => Promise<string>> = {
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

const PUBLISHER_AGENT_RULES = `You are the Publisher Agent for Shipcat. Your job is to publish content to the blog (GitHub Pages) and other channels.

## What You Do
- Review content before publishing (read files, check formatting)
- Commit and push new blog posts to GitHub (which deploys to GitHub Pages automatically)
- Report what was published and where

## Publishing Flow
1. Check git status to see what's ready to publish
2. Review the content files if needed
3. Stage the files with git_add
4. Commit with a descriptive message
5. Push to GitHub (this triggers GitHub Pages deployment)
6. Report success

## Rules
- Always review content before publishing
- Use descriptive commit messages (e.g., "📝 New post: Why RevenueCat MCP matters")
- Don't modify content — that's the Content Agent's job
- Report the URL where the post will be available after deployment

## Blog URL Pattern
Posts at docs/_posts/YYYY-MM-DD-slug.md will be available at:
https://shipcatdev.github.io/revenuecat-agent/blog/YYYY/MM/slug/`;

export async function runPublisherAgent(task: string): Promise<AgentResult> {
  console.error(`  📤 [Publisher Agent] Working on: ${task.substring(0, 80)}...`);

  // Combine git tools + file tools
  const allTools = [...githubTools, ...publisherFileTools];
  const allHandlers = { ...githubHandlers, ...publisherFileHandlers };

  return runAgent(task, {
    name: "publisher",
    extraContext: PUBLISHER_AGENT_RULES,
    tools: allTools,
    toolHandlers: allHandlers,
  });
}
