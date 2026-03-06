"""Tests for evo_utils.config — deep merge and layered loading."""

from pathlib import Path

import pytest

from evo_utils.config import deep_merge, load_config, load_json5

FIXTURES = Path(__file__).parent / "fixtures"


# -- deep_merge tests --


class TestDeepMerge:
    def test_flat_override(self):
        assert deep_merge({"a": 1}, {"a": 2}) == {"a": 2}

    def test_flat_preserve(self):
        assert deep_merge({"a": 1, "b": 2}, {"a": 10}) == {"a": 10, "b": 2}

    def test_nested_merge(self):
        base = {"d": {"x": 1, "y": 2}}
        over = {"d": {"y": 99, "z": 3}}
        result = deep_merge(base, over)
        assert result == {"d": {"x": 1, "y": 99, "z": 3}}

    def test_list_replaced_not_merged(self):
        base = {"items": [1, 2, 3]}
        over = {"items": [4, 5]}
        assert deep_merge(base, over) == {"items": [4, 5]}

    def test_dict_replaces_scalar(self):
        base = {"a": 1}
        over = {"a": {"nested": True}}
        assert deep_merge(base, over) == {"a": {"nested": True}}

    def test_scalar_replaces_dict(self):
        base = {"a": {"nested": True}}
        over = {"a": "flat"}
        assert deep_merge(base, over) == {"a": "flat"}

    def test_empty_base(self):
        assert deep_merge({}, {"a": 1}) == {"a": 1}

    def test_empty_override(self):
        assert deep_merge({"a": 1}, {}) == {"a": 1}

    def test_does_not_mutate_inputs(self):
        base = {"d": {"x": 1}}
        over = {"d": {"y": 2}}
        deep_merge(base, over)
        assert base == {"d": {"x": 1}}
        assert over == {"d": {"y": 2}}


# -- load_json5 tests --


class TestLoadJson5:
    def test_loads_platform(self):
        data = load_json5(FIXTURES / "platforms" / "testbot.json5")
        assert data["name"] == "testbot"
        assert data["type"] == "holonomic"

    def test_hex_values_parsed(self):
        data = load_json5(FIXTURES / "2026" / "robots" / "testbot" / "robot.json5")
        assert data["modules"]["propulsion"]["can_board_type"] == 0x04
        assert data["modules"]["actuators"]["boards"][0]["address_pca"] == 0x40


# -- load_config integration tests --


class TestLoadConfig:
    def test_full_load(self):
        cfg = load_config(FIXTURES, season=2026, robot="testbot")

        # Platform layer
        assert cfg["name"] == "testbot"
        assert cfg["type"] == "holonomic"

        # Table layer
        assert cfg["saison"] == 2026
        assert cfg["table"]["largeur"] == 3000

        # Robot layer overrides platform dimensions.height
        assert cfg["dimensions"]["height"] == 350
        # But preserves platform dimensions.radius
        assert cfg["dimensions"]["radius"] == 150

        # Actions layer
        assert cfg["positions"]["open"]["servo"] == 10

        # Metadata
        assert cfg["_meta"]["robot"] == "testbot"
        assert "platform" in cfg["_meta"]["layers_loaded"]
        assert "table" in cfg["_meta"]["layers_loaded"]

    def test_optional_strategy_missing(self):
        """Strategy layer is optional — should not raise."""
        cfg = load_config(FIXTURES, season=2026, robot="testbot")
        assert "strategy" not in cfg["_meta"]["layers_loaded"]

    def test_missing_mandatory_layer(self, tmp_path):
        """Missing platform file should raise FileNotFoundError."""
        with pytest.raises(FileNotFoundError, match="platform"):
            load_config(tmp_path, season=2026, robot="nonexistent")

    def test_extra_layers(self, tmp_path):
        override = tmp_path / "override.json5"
        override.write_text('{ name: "overridden" }')

        cfg = load_config(FIXTURES, season=2026, robot="testbot", extra_layers=[override])
        assert cfg["name"] == "overridden"
