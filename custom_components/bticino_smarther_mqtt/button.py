"""Explicit Boost buttons, without automatic MQTT writes or timers."""

from homeassistant.components.button import ButtonEntity

from .entity import SmartherMqttEntity


async def async_setup_entry(hass, entry, async_add_entities):
    hub = entry.runtime_data
    async_add_entities([
        SmartherBoostButton(hub, duration) for duration in (30, 60, 90)
    ] + [SmartherBoostButton(hub, 0)])


class SmartherBoostButton(SmartherMqttEntity, ButtonEntity):
    def __init__(self, hub, minutes: int):
        key = f"boost_{minutes}" if minutes else "cancel_boost"
        label = f"Boost {minutes} minutes" if minutes else "End Boost (resume schedule)"
        super().__init__(hub, key, label)
        self.minutes = minutes

    @property
    def available(self) -> bool:
        return self.hub.has_state and not self.hub.read_only

    async def async_press(self) -> None:
        if self.minutes:
            await self.hub.async_boost(self.minutes)
        else:
            await self.hub.async_cancel_boost()
