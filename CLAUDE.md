# homebridge-tcc-fan-plus

Homebridge platform plugin for controlling Honeywell Total Connect Comfort (TCC) thermostat fan modes. Exposes all four fan modes as stateful HomeKit switches.

## Project structure

```
index.js          Platform + accessory logic (Homebridge API)
lib/tcc.js        TCC HTTP client (login, CheckDataSession, setFanSwitch)
config.schema.json Homebridge UI config form schema
```

## Fan modes

| TCC value | Mode            | HomeKit switch |
|-----------|-----------------|----------------|
| 0         | Auto            | Auto           |
| 1         | On              | On             |
| 2         | Circulate       | Circulate      |
| 3         | Follow Schedule | Follow Schedule |

Four stateful switches are shown in HomeKit — exactly one is on at a time. Tapping a switch activates that mode and the others flip off automatically. Tapping the active switch off falls back to Auto.

## TCC API — important quirks

**Login (`lib/tcc.js` `login()`):**
- Must extract `__RequestVerificationToken` (ASP.NET CSRF) from the login page HTML and include it in the POST body
- Several cookies must be pre-seeded in the jar before the first request — they are normally set by JavaScript and the server uses them for bot detection:
  - `checkCookie=checkValue`
  - `cmapi_cookie_privacy`, `notice_gdpr_prefs`, `notice_preferences`, `notice_behavior`
- After a successful POST the server redirects to the dashboard — check that the response did NOT land back on the login page (which would mean bad credentials)

**`SubmitControlScreenChanges` (fan mode POST):**
- Returns a 302 redirect to `/portal/Device/Control/{deviceId}` after accepting the command — do NOT follow the redirect (`maxRedirects: 0`). The POST itself is the command; following the redirect causes a 30s hang.
- Reuse the existing `session` object for commands. Only re-login as a fallback if the request fails.
- All timeouts are 30s — the site is slow.

## Deployment (Raspberry Pi via hb-service)

Node and npm are at `/opt/homebridge/bin/` — NOT on the system PATH.

```sh
# Install from GitHub branch
cd /var/lib/homebridge
sudo PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install github:Freddicus/homebridge-tcc-fan#modernize

# Install from npm (after publishing)
sudo PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install homebridge-tcc-fan-plus

# Restart
sudo systemctl restart homebridge.service

# Logs
sudo journalctl -u homebridge.service -f
```

Plugins install to `/var/lib/homebridge/node_modules/` — installing with `-g` puts them in the wrong place.

## Config reference

```json
{
  "platform": "tcc-fan",
  "name": "TCC Fan",
  "username": "your@email.com",
  "password": "yourpassword",
  "refresh": 60,
  "debug": false,
  "showFanControl": false,
  "showAuto": true,
  "showOn": true,
  "showCirculate": true,
  "showFollowSchedule": true,
  "devices": [
    { "deviceID": "1811704", "name": "House Fan" }
  ]
}
```

`showFanControl` is a legacy on/off toggle (off by default). The four `show*` switches default to `true`.

## Publishing

Auto-publishes to npm when a GitHub Release is created (`.github/workflows/npm-publish.yml`). Requires an `npm_token` secret in the repo settings.
