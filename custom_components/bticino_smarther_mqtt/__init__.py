"""Home Assistant config entry lifecycle for BTicino Smarther MQTT.

This integration never installs a broker, runs a shell script, or issues commands
during setup/reload. Legacy YAML installations are not migrated implicitly.
"""

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .dashboard import async_setup_dashboard
from .mqtt_bridge import SmartherMqttHub

_LOGGER = logging.getLogger(__name__)

PLATFORMS = (
    Platform.CLIMATE, Platform.SENSOR, Platform.SELECT, Platform.BUTTON,
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Subscribe to this thermostat and create native HA entities."""
    hub = SmartherMqttHub(hass, entry)
    try:
        await hub.async_start()
    except Exception as exc:
        raise ConfigEntryNotReady("Cannot subscribe to Smarther MQTT topics") from exc
    entry.runtime_data = hub
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        hub.close()
        raise
    try:
        await async_setup_dashboard(hass)
    except Exception:
        # Optional frontend support must not interrupt thermostat telemetry.
        # Do not log raw exceptions, which can contain local paths.
        _LOGGER.warning(
            "Optional Smarther dashboard tools are unavailable; "
            "the manual dashboard remains available"
        )
    entry.async_on_unload(entry.add_update_listener(_async_options_changed))
    return True


async def _async_options_changed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apply changed read-only/control policy through normal entry reload."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove all entities and exact-topic MQTT subscriptions."""
    success = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if success:
        entry.runtime_data.close()
    return success

