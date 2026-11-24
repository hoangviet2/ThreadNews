# Third-party skills (vendored)

Installed with `npx skills add <repo> --skill <name> --agent claude-code` on 2026-11-23.
Exact hashes are in `/skills-lock.json`. To update: re-run the same command, review the diff, update this file.

| Skill | Source repo | Path in repo | Commit | License |
|---|---|---|---|---|
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/react-best-practices` | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | MIT (SKILL.md frontmatter; repo has no LICENSE file) |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `skills/web-design-guidelines` | `5a37a6329fbad3666c3207392a6a7c0110e92efb` | Not declared (no LICENSE file, no frontmatter license) |
| `hig-foundations` | [raintree-technology/hig-doctor](https://github.com/raintree-technology/hig-doctor) (formerly `apple-hig-skills`) | `skills/hig-foundations` | `a0f1e4ec3c5ada82e538710b54a344db63189d8b` | MIT |
| `hig-patterns` | raintree-technology/hig-doctor | `skills/hig-patterns` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-content` | raintree-technology/hig-doctor | `skills/hig-components-content` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-controls` | raintree-technology/hig-doctor | `skills/hig-components-controls` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-dialogs` | raintree-technology/hig-doctor | `skills/hig-components-dialogs` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-layout` | raintree-technology/hig-doctor | `skills/hig-components-layout` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-menus` | raintree-technology/hig-doctor | `skills/hig-components-menus` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-search` | raintree-technology/hig-doctor | `skills/hig-components-search` | `a0f1e4ec…89d8b` | MIT |
| `hig-components-status` | raintree-technology/hig-doctor | `skills/hig-components-status` | `a0f1e4ec…89d8b` | MIT |

Audit (2026-11-23): Markdown only. Nothing runs scripts, fetches remote code or asks for secrets.
`web-design-guidelines/SKILL.md` has a maintainer-only "Updating" section with a `curl` command. The skill itself says "Do not fetch rules from the network".

Repo-owned skills in this folder (not third-party): `firebase-hybrid-inference`, `firebase-app-check`, `chrome-extension-mv3`, `grounded-results`.
