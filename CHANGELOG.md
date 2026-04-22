# Changelog

## [2.0.0] - 2026-04-21

### Breaking Changes
- Requires Node.js 18.15.0 or later (was `>=0.12.0`)
- Requires Homebridge 1.8.0 or later (was `>=0.4.16`)

### Changed
- Added Homebridge v2.0 compatibility (`^1.8.0 || ^2.0.0-beta.0`)
- Replaced deprecated `request` library with `axios` + `tough-cookie`
- Replaced `q` promise library with native Promises
- Removed unused `lodash` dependency
- Fixed `Characteristic.getValue()` (removed in HB v2) — now uses `updateValue()`
- Fixed double-callback bug in `setState`
- Fixed `getName` callback signature
- Fixed `updateStatus` to use correct `latestData` path
- Updated GitHub Actions workflows to Node.js 18/20/22 and actions/checkout@v4
- Added `config.schema.json` for Homebridge UI configuration support

## [1.0.1]

- Fork of [hacctarr/homebridge-tcc-fan](https://github.com/hacctarr/homebridge-tcc-fan)
- Added `showFanControl`, `showAuto`, `showOn`, `showCirculate`, `showFollowSchedule` config options
