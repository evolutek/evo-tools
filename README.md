# evo_utils

Shared Python utilities for Evolutek robots: config loader, logging, LocalBus.

## What is this?

The glue layer between configuration data and the robot software. Provides:

- **ConfigLoader** — loads and merges JSON5 config files in layer order (platform → table → assemblies → actions → strategy)
- **Logging** — structured logging setup shared across all repos
- **LocalBus** — in-process event bus for communication between Omnissiah briques

## Ecosystem

| Repo | Role |
|------|------|
| **evo_utils** (this repo) | Shared utilities (config loader, logging, LocalBus) |
| **evo_robot_configs** | JSON5 configuration data (consumed by ConfigLoader) |
| **evo_hl_library** | Reusable hardware drivers |
| **evo_hl_omnissiah** | Robot brain: Orchestrator, IA, Trajman, Action, Client |

## Config flow

```
evo_robot_configs/     evo_utils            evo_hl_omnissiah
  *.json5 files    →   ConfigLoader    →   briques (Orchestrator, IA, Action, ...)
                       (load + merge)       each brique receives its relevant config
```
