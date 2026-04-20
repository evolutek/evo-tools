"""JSON5 config loader with layered deep merge.

Config layers are loaded in order and deep-merged so that later layers
override earlier ones while preserving unrelated keys:

    platform → table → robot → actions → strategy

Usage:
    from evo_utils import load_config

    cfg = load_config(
        config_dir="/path/to/evo_robot_configs",
        season=2026,
        robot="hololutek",
    )
    # cfg is a plain dict with all layers merged
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pyjson5

log = logging.getLogger(__name__)

# Ordered list of layer definitions.
# Each entry is (layer_name, path_template) where the template uses
# {config_dir}, {season}, and {robot} as placeholders.
LAYERS: list[tuple[str, str]] = [
    ("platform", "{config_dir}/platforms/{robot}.json5"),
    ("table", "{config_dir}/{season}/table.json5"),
    ("robot", "{config_dir}/{season}/robots/{robot}/robot.json5"),
    ("actions", "{config_dir}/{season}/robots/{robot}/actions.json5"),
    ("strategy", "{config_dir}/{season}/robots/{robot}/strategy.json5"),
]


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge *override* into *base* (returns a new dict).

    - Dict values are merged recursively.
    - Lists and scalars in *override* replace those in *base*.
    - Keys present only in *base* are preserved.
    """
    result = base.copy()
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def load_json5(path: Path) -> dict[str, Any]:
    """Load a single JSON5 file and return it as a dict."""
    text = path.read_text(encoding="utf-8")
    data = pyjson5.loads(text)
    if not isinstance(data, dict):
        raise TypeError(f"{path}: expected top-level object, got {type(data).__name__}")
    return data


def load_config(
    config_dir: str | Path,
    season: int,
    robot: str,
    *,
    extra_layers: list[str | Path] | None = None,
) -> dict[str, Any]:
    """Load and merge all config layers for a robot.

    Parameters
    ----------
    config_dir:
        Path to the evo_robot_configs checkout.
    season:
        Year (e.g. 2026).
    robot:
        Robot name matching filenames (e.g. "hololutek").
    extra_layers:
        Optional list of additional JSON5 files to merge on top
        (loaded after strategy, in order).

    Returns
    -------
    dict
        Merged configuration.

    Raises
    ------
    FileNotFoundError
        If a mandatory layer (platform, table, robot) is missing.
    """
    config_dir = Path(config_dir).resolve()
    fmt = {"config_dir": str(config_dir), "season": season, "robot": robot}

    # Mandatory layers that must exist
    mandatory = {"platform", "table", "robot"}

    merged: dict[str, Any] = {}

    for layer_name, path_tpl in LAYERS:
        path = Path(path_tpl.format(**fmt))

        if not path.exists():
            if layer_name in mandatory:
                raise FileNotFoundError(
                    f"Mandatory config layer '{layer_name}' not found: {path}"
                )
            log.debug("Optional layer '%s' not found, skipping: %s", layer_name, path)
            continue

        log.info("Loading config layer '%s' from %s", layer_name, path)
        layer_data = load_json5(path)
        merged = deep_merge(merged, layer_data)

    # Extra layers (e.g. match-specific overrides)
    for extra_path in extra_layers or []:
        extra_path = Path(extra_path)
        log.info("Loading extra config layer from %s", extra_path)
        layer_data = load_json5(extra_path)
        merged = deep_merge(merged, layer_data)

    # Inject metadata
    merged["_meta"] = {
        "config_dir": str(config_dir),
        "season": season,
        "robot": robot,
        "layers_loaded": [
            name
            for name, tpl in LAYERS
            if Path(tpl.format(**fmt)).exists()
        ],
    }

    return merged
