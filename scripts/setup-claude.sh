#!/usr/bin/env bash
# One-time Claude Code setup for ThreadNews contributors.
#
# Why this exists: .claude/settings.json declares our marketplaces + enabledPlugins, but
# Claude Code doesn't always prompt contributors to install project plugins when they trust
# the folder. This script installs them explicitly (project scope). Safe to re-run.
# Skills in .claude/skills/ and the MCP servers in .mcp.json need no install step.
set -euo pipefail

cd "$(dirname "$0")/.."
command -v claude >/dev/null || { echo "claude CLI not found: https://docs.claude.com/claude-code" >&2; exit 1; }

# Marketplace adds are idempotent-ish: ignore "already added".
claude plugin marketplace add firebase/agent-skills || true
claude plugin marketplace add ChromeDevTools/chrome-devtools-mcp || true

for p in firebase@firebase frontend-design@claude-plugins-official chrome-devtools-mcp@chrome-devtools-plugins; do
  claude plugin install "$p" --scope project || echo "warn: $p not installed (already installed elsewhere? check /plugin)" >&2
done

claude mcp list
