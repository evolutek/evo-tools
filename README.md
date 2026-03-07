# evo_tools

> **Renamed from `evo_utils`** — this repo contains standalone tools, not shared library code.
> Shared utilities (config loader, logging, LocalBus) now live in **evo_hl_library**.

Standalone developer tools for Evolutek robots.

## What is this?

Command-line tools and scripts for developing, debugging, and validating the robot software. These are programs you **run**, not code you **import**.

- **CLI** — interactive debug shell to communicate with the robot
- **Config verifier** — validate JSON5 config files against schemas
- **Debug scripts** — one-off tools for hardware testing and diagnostics

## Ecosystem

| Repo | Role |
|------|------|
| **evo_tools** (this repo) | Standalone tools — CLI, config verifier, debug scripts |
| **evo_hl_library** | Shared library — drivers, config loader, logging, LocalBus |
| **evo_robot_configs** | JSON5 configuration data per robot and year |
| **evo_hl_omnissiah** | Robot brain: Orchestrator, IA, Trajman, Action, Client |
