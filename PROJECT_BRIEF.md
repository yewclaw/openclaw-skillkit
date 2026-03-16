Build the first MVP of openclaw-skillkit in this repository.

Project goal:
- A public open-source toolkit to help developers build, lint, and pack OpenClaw skills.
- Optimize for fast adoption and clarity. This should feel shippable and easy to star.

Requirements:
- Use TypeScript + Node.js CLI.
- Implement commands:
  1. init   -> scaffold a new skill folder with SKILL.md and optional resource folders
  2. lint   -> validate skill structure and frontmatter basics
  3. pack   -> package a skill directory into a .skill archive (zip renamed to .skill is acceptable)
- Include:
  - package.json
  - tsconfig.json
  - src/ CLI entrypoint(s)
  - README.md with sharp positioning, quickstart, and command examples
  - one example output or example skill template
- Keep it lean but real. Prefer a clean architecture and solid README over overbuilding.
- You may choose lightweight dependencies if they speed up delivery.

Constraints:
- Work only in this repo.
- Make autonomous implementation decisions.
- Commit all completed work to git with a sensible initial commit message.
- At the end, print a concise summary with run instructions.

When completely finished, run this command to notify me:
openclaw system event --text "Done: Codex built openclaw-skillkit MVP and committed it" --mode now
