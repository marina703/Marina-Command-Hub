# MarinaAI Mission Brief

## Purpose

Build a local-first autonomous AI operations center that can:

- monitor work streams,
- prioritize tasks,
- coordinate content and operations,
- generate ideas and meeting summaries,
- connect to local LLMs without requiring a public internet dependency during development.

## Current status

- Local Ollama runtime is available and responding.
- Default model is qwen2.5:3b.
- Agent is connected to local model routing and can convert plain prompts into executable instructions.
- Dashboard is serving the mission-control interface locally.

## First milestone

Ship a working local command center loop with these three outcomes:

1. Intake human or system-triggered tasks.
2. Translate tasks into agent actions.
3. Track progress in the dashboard.

## Immediate next actions

- Create the first operational brief document.
- Define the task queue for launch.
- Add onboarding and workflow automation ideas.
- Trigger a first AI meeting summary for the team.
- Validate dashboard cards and history updates.

## Working principles

- Keep the local agent private and secure.
- Keep the public dashboard separate from private local model access.
- Favor transparent, human-readable task states over hidden automation.
- Save all real outputs to files and dashboard state so the system remains auditable.

## Suggested task sequence

1. Draft the launch brief.
2. Add a dashboard task for the next sprint.
3. Generate a brainstorm idea stream.
4. Schedule an AI team sync summary.
5. Review project health and update the system state.

## Owner

MarinaAI / operator

## Notes

This document is intentionally simple and operational so it can serve as the starting foundation for future expansions, including a dashboard UI, project assignment flows, and richer AI team workflows.
