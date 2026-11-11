"""Read-only discovery and static assets for the opt-in dashboard builder.

Dashboard creation and resource registration belong to Home Assistant's UI.
This module never writes Lovelace configuration or invokes entity services.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from homeassistant.components import websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import CONF_ENABLE_DASHBOARD, DEFAULT_ENABLE_DASHBOARD, DOMAIN

RESOURCE_URL = "/bticino_smarther_mqtt/smarther-dashboard.js"
_DATA_KEY = f"{DOMAIN}_dashboard"
_ENTITY_KEYS = {
    "climate": ("climate", "thermostat"),
    "program": ("select", "program_select"),
    "humidity": ("sensor", "humidity"),
    "heating": ("sensor", "load"),
    "active_program": ("sensor", "program"),
    "boost_end": ("sensor", "boost_end"),
    "last_message": ("sensor", "last_message"),
    "boost_30": ("button", "boost_30"),
    "boost_60": ("button", "boost_60"),
    "boost_90": ("button", "boost_90"),
    "cancel_boost": ("button", "cancel_boost"),
}


async def async_setup_dashboard(hass: HomeAssistant) -> None:
    """Register once, including during concurrent entry setup and later reloads.

    Serving an inert file does not load it in the browser. Users explicitly add
    the module in Resources. Keep the route after opt-out so an existing user
    dashboard remains usable; static routes have no public removal API.
    """
    data = hass.data.setdefault(_DATA_KEY, {"lock": asyncio.Lock()})
    async with data["lock"]:
        if "http" in hass.config.components and not data.get("static"):
            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        RESOURCE_URL,
                        str(Path(__file__).parent / "frontend" / "smarther-dashboard.js"),
                        False,
                    )
                ]
            )
            data["static"] = True
        if "websocket_api" in hass.config.components and not data.get("websocket"):
            websocket_api.async_register_command(hass, websocket_dashboard_info)
            data["websocket"] = True


@websocket_api.websocket_command({"type": f"{DOMAIN}/dashboard_info"})
@websocket_api.require_admin
@callback
def websocket_dashboard_info(hass, connection, msg) -> None:
    """Resolve this integration's real, visible registry IDs without secrets.

    The builder lists enabled entries. Already-created snapshots do not depend
    on that option, so turning discovery off cannot delete or rewrite a layout.
    """
    registry = er.async_get(hass)
    entries = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.state is not ConfigEntryState.LOADED:
            continue
        hub = entry.runtime_data
        entities = {}
        device_id = None
        for key, (entity_domain, unique_key) in _ENTITY_KEYS.items():
            entity_id = registry.async_get_entity_id(
                entity_domain, DOMAIN, f"{hub.stable_id}_{unique_key}"
            )
            if entity_id is None:
                continue
            registered = registry.async_get(entity_id)
            if (
                registered is None
                or registered.config_entry_id != entry.entry_id
                or registered.disabled_by is not None
                or registered.hidden_by is not None
            ):
                continue
            entities[key] = entity_id
            if key == "climate":
                device_id = registered.device_id
        entries.append(
            {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "enabled": bool(
                    entry.options.get(CONF_ENABLE_DASHBOARD, DEFAULT_ENABLE_DASHBOARD)
                ),
                "device_id": device_id,
                "entities": entities,
            }
        )
    connection.send_result(msg["id"], {"entries": entries})
