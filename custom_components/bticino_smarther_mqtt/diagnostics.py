"""Sanitized diagnostics: never disclose vendor IDs, topics or credentials."""

from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from .const import DOMAIN


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry) -> dict:
    hub = entry.runtime_data
    integration = await async_get_integration(hass, DOMAIN)
    return {
        "integration_version": integration.version,
        "configured": True,
        "mqtt_subscription_count": 4,
        "controls_enabled": not hub.read_only,
        "state_message_observed": hub.has_state,
        "last_mqtt_message": (
            hub.last_received.isoformat() if hub.last_received else None
        ),
        "last_non_retained_message": (
            hub.last_live.isoformat() if hub.last_live else None
        ),
        "last_message_retained": hub.last_retained,
        "programs_observed": sorted(hub.programs.keys()),
        "remote_broker_verified": False,
        "source": "external_mosquitto_bridge",
        # No raw MQTT payload, topic_prefix, client IDs, GitHub tokens or passwords.
    }
