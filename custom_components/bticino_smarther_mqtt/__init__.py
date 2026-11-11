"""Home Assistant config entry lifecycle for BTicino Smarther MQTT.

This integration never installs a broker, runs a shell script, or issues commands
during setup/reload. Legacy YAML installations are not migrated implicitly.
"""

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .const import CONF_ENABLE_CONTROLS, DEFAULT_ENABLE_CONTROLS
from .panel import async_setup_panel, async_unload_panel
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
        await async_setup_panel(hass, entry)
    except Exception:
        # Optional frontend support must not interrupt thermostat telemetry.
        # Do not log raw exceptions, which can contain local paths.
        _LOGGER.warning(
            "Smarther sidebar panel is unavailable; native entities remain available"
        )
    controls_enabled = entry.options.get(CONF_ENABLE_CONTROLS, DEFAULT_ENABLE_CONTROLS)

    async def options_changed(hass, updated_entry):
        if updated_entry.options.get(CONF_ENABLE_CONTROLS, DEFAULT_ENABLE_CONTROLS) != controls_enabled:
            await hass.config_entries.async_reload(updated_entry.entry_id)
        else:
            # Visibility is presentation only: do not reconnect MQTT or touch
            # thermostat controls just to show/hide the panel.
            await async_setup_panel(hass, updated_entry)

    entry.async_on_unload(entry.add_update_listener(options_changed))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove all entities and exact-topic MQTT subscriptions."""
    success = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if success:
        entry.runtime_data.close()
        await async_unload_panel(hass, entry)
    return success

