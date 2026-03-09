import { execSync } from "child_process";
import { config } from "../config.js";
import Anthropic from "@anthropic-ai/sdk";

/**
 * GitHub/Git tools for the Publisher Agent.
 * These tools handle git operations for publishing content to GitHub Pages.
 */

export const githubTools: Anthropic.Messages.Tool[] = [
  {
    name: "git_status",
    description:
      "Check the current git status of the project. Shows modified, staged, and untracked files.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "git_add",
    description:
      "Stage files for commit. Pass specific file paths or '.' for all changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        files: {
          type: "string",
          description:
            "Space-separated file paths to stage, or '.' for all files",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "git_commit",
    description: "Create a git commit with a message.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "The commit message",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "git_push",
    description:
      "Push committed changes to the remote repository (GitHub). This publishes content to GitHub Pages.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "git_log",
    description: "Show recent git commits.",
    input_schema: {
      type: "object" as const,
      properties: {
        count: {
          type: "number",
          description: "Number of recent commits to show (default: 5)",
        },
      },
      required: [],
    },
  },
  {
    name: "list_blog_posts",
    description:
      "List all published blog posts in the docs/_posts/ directory.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

function runGit(cmd: string): string {
  try {
    return execSync(cmd, {
      cwd: config.paths.root,
      encoding: "utf-8",
      timeout: 30000,
    }).trim();
  } catch (err: any) {
    return `Git error: ${err.message}`;
  }
}

export const githubHandlers: Record<string, (input: any) => Promise<string>> = {
  git_status: async () => {
    return runGit("git status --short") || "(clean working tree)";
  },

  git_add: async (input: { files: string }) => {
    const result = runGit(`git add ${input.files}`);
    return result || `Staged: ${input.files}`;
  },

  git_commit: async (input: { message: string }) => {
    // Sanitize commit message to prevent injection
    const safeMessage = input.message.replace(/"/g, '\\"');
    return runGit(`git commit -m "${safeMessage}"`);
  },

  git_push: async () => {
    return runGit("git push");
  },

  git_log: async (input: { count?: number }) => {
    const count = input.count || 5;
    return runGit(
      `git log --oneline --no-decorate -${count}`
    );
  },

  list_blog_posts: async () => {
    try {
      const result = runGit(
        "ls -1 docs/_posts/ 2>/dev/null"
      );
      return result || "(no posts yet)";
    } catch {
      return "(no posts yet)";
    }
  },
};
