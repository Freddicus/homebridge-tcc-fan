# homebridge-tcc-fan-plus

Homebridge platform plugin for controlling the fan on Honeywell Total Connect Comfort (TCC) thermostats. Supports Homebridge v1.8+ and v2.0.

Forked from [hacctarr/homebridge-tcc-fan](https://github.com/hacctarr/homebridge-tcc-fan) with additional fan mode switches.

## Installation

Install via the Homebridge UI, or manually:

```sh
npm install -g homebridge-tcc-fan-plus
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
  "showFanControl": true,
  "showAuto": false,
  "showOn": false,
  "showCirculate": false,
  "showFollowSchedule": false,
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
| `showFanControl` | boolean | `true` | Show main On/Off fan control (On = On, Off = Auto) |
| `showAuto` | boolean | `false` | Show a momentary switch for Auto fan mode |
| `showOn` | boolean | `false` | Show a momentary switch for On fan mode |
| `showCirculate` | boolean | `false` | Show a momentary switch for Circulate fan mode |
| `showFollowSchedule` | boolean | `false` | Show a momentary switch for Follow Schedule fan mode |

### Fan Modes

| TCC Mode | Value |
|---|---|
| Auto | 0 |
| On | 1 |
| Circulate | 2 |
| Follow Schedule | 3 |

## Requirements

- Node.js 18.15.0 or later
- Homebridge 1.8.0 or later (including v2.0)
