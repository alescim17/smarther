"""Automatic sidebar panel and permission-filtered presentation metadata.

No Lovelace storage/resource writes and no entity service calls.
"""
from __future__ import annotations

import asyncio
from hashlib import sha256
from pathlib import Path

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL, DOMAIN

PANEL_PATH = "smarther"
RESOURCE_URL = "/bticino_smarther_mqtt/smarther-panel.js"
_DATA_KEY = f"{DOMAIN}_panel"
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


def _panel_data(hass):
    return hass.data.setdefault(_DATA_KEY, {"lock": asyncio.Lock(), "entries": set()})


async def async_setup_panel(hass: HomeAssistant, entry) -> None:
    """Register the local module and one sidebar entry, default visible.

    Called after entity setup, including while this entry is still setting up.
    The set makes reloads/multiple devices idempotent. A hidden device is excluded
    from both the panel and discovery; command consent remains separate.
    """
    data = _panel_data(hass)
    async with data["lock"]:
        if entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL):
            data["entries"].add(entry.entry_id)
        else:
            data["entries"].discard(entry.entry_id)
        if not data.get("websocket"):
            websocket_api.async_register_command(hass, websocket_panel_info)
            data["websocket"] = True
        if data["entries"] and not data.get("registered"):
            path = Path(__file__).parent / "frontend" / "smarther-panel.js"
            if not data.get("version"):
                data["version"] = await hass.async_add_executor_job(
                    lambda: sha256(path.read_bytes()).hexdigest()[:12]
                )
            if not data.get("static"):
                await hass.http.async_register_static_paths([
                    StaticPathConfig(RESOURCE_URL, str(path), False)
                ])
                data["static"] = True
            # An occupied path belongs to somebody else. HA rejects it; never
            # overwrite another panel, even if its title happens to be Smarther.
            await panel_custom.async_register_panel(
                hass, webcomponent_name="smarther-panel",
                frontend_url_path=PANEL_PATH, sidebar_title="Smarther",
                sidebar_icon="mdi:thermostat", require_admin=False,
                module_url=f"{RESOURCE_URL}?v={data['version']}",
                config={},
            )
            data["registered"] = True
        elif not data["entries"] and data.get("registered"):
            frontend.async_remove_panel(hass, PANEL_PATH)
            data["registered"] = False


async def async_unload_panel(hass: HomeAssistant, entry) -> None:
    """Remove the shared menu entry when the final visible device unloads."""
    data = _panel_data(hass)
    async with data["lock"]:
        data["entries"].discard(entry.entry_id)
        if not data["entries"] and data.get("registered"):
            frontend.async_remove_panel(hass, PANEL_PATH)
            data["registered"] = False
    # Static route stays registered; HA exposes no static-route removal API.


@websocket_api.websocket_command({"type": f"{DOMAIN}/panel_info"})
@callback
def websocket_panel_info(hass, connection, msg) -> None:
    """Expose only visible entities this authenticated user can read."""
    registry = er.async_get(hass)
    entries = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        if (entry.state is not ConfigEntryState.LOADED
                or not entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL)):
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
            if (registered is None or registered.config_entry_id != entry.entry_id
                    or registered.disabled_by is not None
                    or registered.hidden_by is not None
                    or not connection.user.permissions.check_entity(entity_id, POLICY_READ)):
                continue
            entities[key] = entity_id
            if key == "climate":
                device_id = registered.device_id
        if "climate" in entities:
            entries.append({
                "entry_id": entry.entry_id, "title": entry.title,
                "device_id": device_id, "entities": entities,
            })
    connection.send_result(msg["id"], {"entries": entries})
