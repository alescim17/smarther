"""Shared entity and identity for one Smarther config entry."""

from homeassistant.helpers.entity import Entity


class SmartherMqttEntity(Entity):
    """Properties are refreshed from the shared MQTT hub in memory."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hub, key: str, name: str | None) -> None:
        self.hub = hub
        self._attr_unique_id = f"{hub.stable_id}_{key}"
        self._attr_name = name

    @property
    def device_info(self):
        return self.hub.device_info

    @property
    def available(self) -> bool:
        """No fake readings: unavailable until a parsed state is observed."""
        return self.hub.has_state

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(self.hub.listen(self.async_write_ha_state))
