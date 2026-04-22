# homebridge-tcc-fan-plus

Homebridge platform plugin for controlling the fan on Honeywell Total Connect Comfort (TCC) thermostats. Supports Homebridge v1.8+ and v2.0.

Forked from [hacctarr/homebridge-tcc-fan](https://github.com/hacctarr/homebridge-tcc-fan) with additional fan mode switches.

## Installation

Install via the Homebridge UI, or manually on the machine running Homebridge:

```sh
npm install -g homebridge-tcc-fan-plus
```

> **Note for hb-service installs (Raspberry Pi, Linux):** Homebridge bundles its own Node.js and npm that are not on the system PATH. Use the bundled npm and install into the Homebridge storage directory instead:
> ```sh
> cd /var/lib/homebridge
> sudo PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install homebridge-tcc-fan-plus
> sudo systemctl restart homebridge.service
> ```

### Installing a local or pre-release version for testing

If you are testing from a Git branch before publishing to npm:

```sh
cd /var/lib/homebridge
sudo PATH=/opt/homebridge/bin:$PATH /opt/homebridge/bin/npm install github:Freddicus/homebridge-tcc-fan#modernize
sudo systemctl restart homebridge.service
```

Watch the logs to confirm the plugin loaded:

```sh
sudo journalctl -u homebridge.service -f
```

## Configuration

Add a platform entry to your Homebridge `config.json`:

```json
{
  "platform": "tcc-fan",
  "name": "TCC Fan",
  "username": "your@email.com",
  "password": "yourpassword",
  "refresh": 60,
  "showAuto": true,
  "showOn": true,
  "showCirculate": true,
  "showFollowSchedule": true,
  "devices": [
    { "deviceID": "123456789", "name": "Main Floor" },
    { "deviceID": "987654321", "name": "Upper Floor" }
  ]
}
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `username` | string | required | TCC account email |
| `password` | string | required | TCC account password |
| `devices` | array | required | List of `{ deviceID, name }` objects |
| `refresh` | integer | `60` | Seconds between state updates |
| `debug` | boolean | `false` | Enable verbose logging |
| `showAuto` | boolean | `true` | Show Auto mode switch |
| `showOn` | boolean | `true` | Show On mode switch |
| `showCirculate` | boolean | `true` | Show Circulate mode switch |
| `showFollowSchedule` | boolean | `true` | Show Follow Schedule mode switch |
| `showFanControl` | boolean | `false` | Show legacy On/Off fan toggle (On = mode 1, Off = Auto) |

### Fan Modes

All four TCC fan modes are exposed as stateful HomeKit switches. Exactly one switch is on at a time, reflecting the current mode. Tapping a switch activates that mode; the others turn off automatically.

| TCC Mode | Value | Switch |
|---|---|---|
| Auto | 0 | Auto |
| On | 1 | On |
| Circulate | 2 | Circulate |
| Follow Schedule | 3 | Follow Schedule |

## Requirements

- Node.js 18.15.0 or later
- Homebridge 1.8.0 or later (including v2.0)
