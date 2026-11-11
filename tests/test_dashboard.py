"""Focused dashboard contract check without HA, a broker, or a thermostat.

Run with: python -m unittest discover -s tests -p test_dashboard.py

Minimal HA boundary stubs exercise our handler and registration behavior. They
do not qualify Home Assistant's authentication middleware or a real HA runtime.
"""

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


COMPONENT = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "bticino_smarther_mqtt"
)
DOMAIN = "bticino_smarther_mqtt"


class EntryState(Enum):
    LOADED = "loaded"
    NOT_LOADED = "not_loaded"


@dataclass
class StaticPath:
    url_path: str
    path: str
    cache_headers: bool


def load_dashboard(registry, register_command):
    """Import only the production constants and dashboard module, no setup."""
    names = (
        "homeassistant",
        "homeassistant.components",
        "homeassistant.components.websocket_api",
        "homeassistant.components.http",
        "homeassistant.config_entries",
        "homeassistant.core",
        "homeassistant.helpers",
        "homeassistant.helpers.entity_registry",
        "smarther_dashboard_under_test",
    )
    modules = {name: ModuleType(name) for name in names}
    package = modules["smarther_dashboard_under_test"]
    package.__path__ = [str(COMPONENT)]

    def websocket_command(schema):
        def decorate(handler):
            handler.websocket_schema = schema
            return handler
        return decorate

    def require_admin(handler):
        # Record use of HA's security decorator; do not emulate its internals.
        handler.requires_admin = True
        return handler

    websocket = modules["homeassistant.components.websocket_api"]
    websocket.websocket_command = websocket_command
    websocket.require_admin = require_admin
    websocket.async_register_command = register_command
    modules["homeassistant.components.http"].StaticPathConfig = StaticPath
    modules["homeassistant.config_entries"].ConfigEntryState = EntryState
    modules["homeassistant.core"].HomeAssistant = object
    modules["homeassistant.core"].callback = lambda handler: handler
    modules["homeassistant.helpers.entity_registry"].async_get = lambda hass: registry

    with patch.dict(sys.modules, modules):
        name = "smarther_dashboard_under_test.dashboard"
        spec = importlib.util.spec_from_file_location(name, COMPONENT / "dashboard.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        return module


class DashboardContractTest(unittest.IsolatedAsyncioTestCase):
    async def test_registry_snapshot_and_idempotent_setup_are_read_only(self):
        """Renames, multiple entries and denied entities cannot leak or write."""
        lookup = {}
        records = {}

        def registered(domain, unique_id, entity_id, entry_id, **overrides):
            lookup[(domain, DOMAIN, unique_id)] = entity_id
            records[entity_id] = SimpleNamespace(
                **{
                    "config_entry_id": entry_id,
                    "device_id": "device-" + entry_id,
                    "disabled_by": None,
                    "hidden_by": None,
                    **overrides,
                }
            )

        # Renamed entities and a name collision are deliberately unrelated to
        # the integration title or its stable unique-ID suffixes.
        registered("climate", "stable_a_thermostat", "climate.renamed_room", "entry-a")
        registered("select", "stable_a_program_select", "select.weekend_plan", "entry-a")
        registered("sensor", "stable_a_humidity", "sensor.hidden_humidity", "entry-a", hidden_by="user")
        registered("button", "stable_a_boost_30", "button.disabled_boost", "entry-a", disabled_by="user")
        registered("button", "stable_a_boost_60", "button.wrong_entry", "entry-b")
        registered("climate", "stable_b_thermostat", "climate.renamed_room_2", "entry-b")
        registered("sensor", "stable_b_humidity", "sensor.room_2_humidity", "entry-b")

        registry = SimpleNamespace(
            async_get_entity_id=lambda *key: lookup.get(key),
            async_get=records.get,
        )
        entries = [
            SimpleNamespace(
                entry_id="entry-a", title="First thermostat", state=EntryState.LOADED,
                options={"enable_controls": False},
                data={"topic_prefix": "sensitive-topic-fixture"},
                runtime_data=SimpleNamespace(stable_id="stable_a", prefix="sensitive-topic-fixture"),
            ),
            SimpleNamespace(
                entry_id="entry-b", title="Second thermostat", state=EntryState.LOADED,
                options={"enable_dashboard": True, "enable_controls": False},
                data={"topic_prefix": "another-sensitive-topic"},
                runtime_data=SimpleNamespace(stable_id="stable_b", password="sensitive-password-fixture"),
            ),
            # No runtime_data: an unloaded entry must never be dereferenced.
            SimpleNamespace(entry_id="offline", state=EntryState.NOT_LOADED),
        ]
        original_options = [entry.options.copy() for entry in entries[:2]]
        register_command = Mock()
        module = load_dashboard(registry, register_command)
        services = SimpleNamespace(async_call=Mock(side_effect=AssertionError("Unexpected service call")))
        hass = SimpleNamespace(
            data={}, config=SimpleNamespace(components=set()),
            http=SimpleNamespace(async_register_static_paths=AsyncMock()),
            config_entries=SimpleNamespace(async_entries=lambda domain: entries if domain == DOMAIN else []),
            services=services,
        )
        connection = SimpleNamespace(send_result=Mock())

        self.assertFalse(module.DEFAULT_ENABLE_DASHBOARD)
        self.assertTrue(module.websocket_dashboard_info.requires_admin)
        self.assertEqual(module.websocket_dashboard_info.websocket_schema, {"type": DOMAIN + "/dashboard_info"})
        module.websocket_dashboard_info(hass, connection, {"id": 7})
        response = connection.send_result.call_args.args
        self.assertEqual(response[0], 7)
        first, second = response[1]["entries"]
        self.assertFalse(first["enabled"])
        self.assertTrue(second["enabled"])
        self.assertEqual(first["device_id"], "device-entry-a")
        self.assertEqual(first["entities"], {"climate": "climate.renamed_room", "program": "select.weekend_plan"})
        self.assertEqual(second["entities"], {"climate": "climate.renamed_room_2", "humidity": "sensor.room_2_humidity"})
        serialized = json.dumps(response)
        for private_value in ("sensitive-topic", "sensitive-password", "stable_a", "stable_b", "topic_prefix"):
            self.assertNotIn(private_value, serialized)

        # Missing frontend services are safe; concurrent/repeated setup later
        # registers just one inert resource and one read-only websocket handler.
        await module.async_setup_dashboard(hass)
        hass.http.async_register_static_paths.assert_not_awaited()
        register_command.assert_not_called()
        hass.config.components.update({"http", "websocket_api"})
        await asyncio.gather(module.async_setup_dashboard(hass), module.async_setup_dashboard(hass))
        await module.async_setup_dashboard(hass)
        hass.http.async_register_static_paths.assert_awaited_once()
        path = hass.http.async_register_static_paths.call_args.args[0][0]
        self.assertEqual(path.url_path, "/bticino_smarther_mqtt/smarther-dashboard.js")
        self.assertEqual(Path(path.path), COMPONENT / "frontend" / "smarther-dashboard.js")
        self.assertFalse(path.cache_headers)
        register_command.assert_called_once_with(hass, module.websocket_dashboard_info)
        services.async_call.assert_not_called()
        self.assertEqual([entry.options for entry in entries[:2]], original_options)


if __name__ == "__main__":
    unittest.main()
