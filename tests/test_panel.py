"""Focused panel lifecycle/privacy tests using HA boundary stubs, no MQTT."""
import asyncio
from dataclasses import dataclass
from enum import Enum
import importlib.util
import json
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

COMPONENT = Path(__file__).resolve().parents[1] / "custom_components/bticino_smarther_mqtt"
DOMAIN = "bticino_smarther_mqtt"


class State(Enum):
    LOADED = "loaded"
    NOT_LOADED = "not_loaded"


@dataclass
class StaticPath:
    url_path: str
    path: str
    cache_headers: bool


def load_panel(registry):
    names = ["homeassistant", "homeassistant.auth", "homeassistant.auth.permissions",
             "homeassistant.auth.permissions.const", "homeassistant.components",
             "homeassistant.components.frontend", "homeassistant.components.panel_custom",
             "homeassistant.components.websocket_api", "homeassistant.components.http",
             "homeassistant.config_entries", "homeassistant.core", "homeassistant.helpers",
             "homeassistant.helpers.entity_registry", "panel_under_test"]
    modules = {name: ModuleType(name) for name in names}
    modules["panel_under_test"].__path__ = [str(COMPONENT)]
    modules["homeassistant.auth.permissions.const"].POLICY_READ = "read"
    websocket = modules["homeassistant.components.websocket_api"]
    def command(schema):
        def wrap(handler):
            handler.websocket_schema = schema
            return handler
        return wrap
    websocket.websocket_command = command
    websocket.async_register_command = Mock()
    frontend = modules["homeassistant.components.frontend"]
    frontend.async_remove_panel = Mock()
    custom = modules["homeassistant.components.panel_custom"]
    custom.async_register_panel = AsyncMock()
    modules["homeassistant.components.http"].StaticPathConfig = StaticPath
    modules["homeassistant.config_entries"].ConfigEntryState = State
    modules["homeassistant.core"].HomeAssistant = object
    modules["homeassistant.core"].callback = lambda fn: fn
    modules["homeassistant.helpers.entity_registry"].async_get = lambda hass: registry
    with patch.dict(sys.modules, modules):
        spec = importlib.util.spec_from_file_location("panel_under_test.panel", COMPONENT / "panel.py")
        panel = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = panel
        spec.loader.exec_module(panel)
    return panel, custom, frontend, websocket


def entry(name, **options):
    return SimpleNamespace(entry_id=name, title="Synthetic " + name, options=options,
                           state=State.LOADED, data={"topic_prefix": "private-fixture"},
                           runtime_data=SimpleNamespace(stable_id=name, password="private-fixture"))


class PanelTests(unittest.IsolatedAsyncioTestCase):
    def setup_panel(self, entries=(), registry=None):
        panel, custom, frontend, websocket = load_panel(registry)
        hass = SimpleNamespace(
            data={}, http=SimpleNamespace(async_register_static_paths=AsyncMock()),
            async_add_executor_job=AsyncMock(side_effect=lambda fn: fn()),
            config_entries=SimpleNamespace(async_entries=lambda domain: entries),
            services=SimpleNamespace(async_call=Mock(side_effect=AssertionError("Service call"))),
        )
        return panel, hass, custom, frontend, websocket

    async def test_default_visible_multi_entry_hide_show_unload(self):
        panel, hass, custom, frontend, websocket = self.setup_panel()
        first, second = entry("alpha"), entry("beta")
        self.assertTrue(panel.DEFAULT_SHOW_PANEL)
        await asyncio.gather(panel.async_setup_panel(hass, first), panel.async_setup_panel(hass, second))
        await panel.async_setup_panel(hass, first)
        custom.async_register_panel.assert_awaited_once()
        config = custom.async_register_panel.call_args.kwargs
        self.assertEqual(config["frontend_url_path"], "smarther")
        self.assertEqual(config["webcomponent_name"], "smarther-panel")
        self.assertRegex(config["module_url"], r"/smarther-panel\.js\?v=[a-f0-9]{12}$")
        self.assertFalse(config["require_admin"])
        hass.http.async_register_static_paths.assert_awaited_once()
        websocket.async_register_command.assert_called_once()
        first.options["show_panel"] = False
        await panel.async_setup_panel(hass, first)
        frontend.async_remove_panel.assert_not_called()
        second.options["show_panel"] = False
        await panel.async_setup_panel(hass, second)
        frontend.async_remove_panel.assert_called_once_with(hass, "smarther")
        first.options["show_panel"] = True
        await panel.async_setup_panel(hass, first)
        self.assertEqual(custom.async_register_panel.await_count, 2)
        hass.http.async_register_static_paths.assert_awaited_once()
        await panel.async_unload_panel(hass, first)
        self.assertEqual(frontend.async_remove_panel.call_count, 2)
        hass.services.async_call.assert_not_called()
        self.assertNotIn("enable_controls", first.options)

    async def test_registry_privacy_visibility_and_user_permissions(self):
        lookup, records = {}, {}
        def add(domain, stable, unique, entity_id, owner, **extra):
            lookup[(domain, DOMAIN, stable + "_" + unique)] = entity_id
            records[entity_id] = SimpleNamespace(config_entry_id=owner, device_id=owner,
                disabled_by=extra.get("disabled_by"), hidden_by=extra.get("hidden_by"))
        add("climate", "alpha", "thermostat", "climate.renamed", "alpha")
        add("select", "alpha", "program_select", "select.renamed", "alpha")
        add("sensor", "alpha", "humidity", "sensor.hidden", "alpha", hidden_by="user")
        add("button", "alpha", "boost_30", "button.disabled", "alpha", disabled_by="user")
        add("button", "alpha", "boost_60", "button.wrong_owner", "beta")
        add("button", "alpha", "boost_90", "button.denied", "alpha")
        add("climate", "beta", "thermostat", "climate.denied", "beta")
        add("climate", "hidden", "thermostat", "climate.hidden_entry", "hidden")
        hidden = entry("hidden", show_panel=False)
        offline = SimpleNamespace(state=State.NOT_LOADED)
        registry = SimpleNamespace(async_get_entity_id=lambda *args: lookup.get(args), async_get=records.get)
        panel, hass, *_ = self.setup_panel([entry("alpha"), entry("beta"), hidden, offline], registry)
        denied = {"button.denied", "climate.denied"}
        connection = SimpleNamespace(send_result=Mock(), user=SimpleNamespace(permissions=
            SimpleNamespace(check_entity=lambda entity_id, policy: entity_id not in denied)))
        panel.websocket_panel_info(hass, connection, {"id": 7})
        result = connection.send_result.call_args.args[1]["entries"]
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["entities"], {"climate": "climate.renamed", "program": "select.renamed"})
        self.assertNotIn("private-fixture", json.dumps(result))
        hass.services.async_call.assert_not_called()

    async def test_occupied_path_never_overwritten_or_removed(self):
        panel, hass, custom, frontend, _ = self.setup_panel()
        custom.async_register_panel.side_effect = ValueError("Occupied panel")
        first = entry("alpha")
        with self.assertRaises(ValueError):
            await panel.async_setup_panel(hass, first)
        await panel.async_unload_panel(hass, first)
        frontend.async_remove_panel.assert_not_called()
        self.assertNotIn("update", custom.async_register_panel.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
