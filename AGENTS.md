# Contributor workflow

## Source of truth

This repository's `main` branch is the sole active development source for Smarther. Track work in GitHub issues, use a focused branch, and submit changes through pull requests. Do not mirror histories or synchronize another repository into this one.

## Changes and validation

Keep changes scoped to the issue. Run the focused checks that cover the files changed, and record any checks that could not run. Avoid repeating unrelated qualification or starting new CI campaigns without a reason.

## Privacy and runtime

Use generic placeholders in examples. Do not commit credentials, real MQTT identifiers, private hostnames, local paths, or raw operational logs. Do not change a live Home Assistant instance, broker, or thermostat without explicit authorization.

## Releases

Treat release tags, GitHub releases, and Marketplace publication as separate owner-approved steps. Do not create or publish them as part of routine implementation work.
