/*jslint node: true */
'use strict';

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

let Characteristic;
let debug = false;

// One shared cookie jar — persists session across all requests
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const PORTAL = 'https://mytotalconnectcomfort.com/portal/';

// Current macOS Safari UA — less suspicious than Chrome 28 from 2013
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
    + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const BROWSER_HEADERS = {
    'User-Agent':                USER_AGENT,
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':           'en-US,en;q=0.9',
    'Accept-Encoding':           'gzip, deflate, br',
    'Connection':                'keep-alive',
    'Upgrade-Insecure-Requests': '1',
};

// ─── Session ────────────────────────────────────────────────────────────────

function Session(username, password) {
    this.username = username;
    this.password = password;
}

Session.prototype.CheckDataSession = function(deviceID, cb) {
    const url = `https://mytotalconnectcomfort.com/portal/Device/CheckDataSession/${deviceID}?_=${Date.now()}`;
    this._request(url)
        .then(json => cb(null, json))
        .catch(err => {
            console.log('CheckDataSession failed:', err.message || err);
            cb(err);
        });
};

Session.prototype.setFanSwitch = function(deviceId, fanSwitch) {
    const url = 'https://mytotalconnectcomfort.com/portal/Device/SubmitControlScreenChanges';
    const body = {
        DeviceID:      Number(deviceId),
        SystemSwitch:  null,
        HeatSetpoint:  null,
        CoolSetpoint:  null,
        HeatNextPeriod: null,
        CoolNextPeriod: null,
        StatusHeat:    null,
        StatusCool:    null,
        FanMode:       Number(fanSwitch)
    };
    if (debug) console.log('setFanSwitch', body);

    return client.post(url, body, {
        timeout: 30000,
        // The server redirects to /portal/Device/Control/{id} after the POST.
        // We don't need to follow it — the POST itself is what sets the fan mode.
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400,
        headers: {
            'User-Agent':      USER_AGENT,
            'Accept':          'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type':    'application/json; charset=UTF-8',
            'Referer':         `https://mytotalconnectcomfort.com/portal/Device/Control/${deviceId}`,
            'Origin':          'https://mytotalconnectcomfort.com',
            'X-Requested-With': 'XMLHttpRequest',
        }
    }).then(r => r.data);
};

Session.prototype._request = function(url) {
    return client.get(url, {
        timeout: 30000,
        headers: {
            'User-Agent':      USER_AGENT,
            'Accept':          'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer':         PORTAL,
            'X-Requested-With': 'XMLHttpRequest',
        }
    }).then(r => r.data);
};

// ─── Login ──────────────────────────────────────────────────────────────────

function extractCsrfToken(html) {
    // ASP.NET MVC anti-forgery token hidden field
    const patterns = [
        /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
        /value="([^"]+)"[^>]*name="__RequestVerificationToken"/,
    ];
    for (const re of patterns) {
        const m = html.match(re);
        if (m) return m[1];
    }
    return null;
}

function login(username, password) {
    if (debug) console.log('TCC login: fetching login page...');

    // Step 1 — GET the login page to collect session cookies + CSRF token
    return client.get(PORTAL, {
        timeout: 30000,
        headers: BROWSER_HEADERS,
    }).then(response => {
        const html = typeof response.data === 'string' ? response.data : '';
        const csrfToken = extractCsrfToken(html);

        if (debug) console.log('TCC login: CSRF token', csrfToken ? 'found' : 'NOT FOUND');

        const params = new URLSearchParams();
        params.append('UserName', username);
        params.append('Password', password);
        params.append('RememberMe', 'false');
        if (csrfToken) params.append('__RequestVerificationToken', csrfToken);

        // Step 2 — POST credentials; axios auto-follows the 302 → authenticated page
        return client.post(PORTAL, params.toString(), {
            timeout: 30000,
            headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer':      PORTAL,
                'Origin':       'https://mytotalconnectcomfort.com',
            }
        });
    }).then(response => {
        // If we ended up back at the login page, credentials were rejected
        const html = typeof response.data === 'string' ? response.data : '';
        const landedOnLogin = html.includes('id="loginForm"')
            || html.includes('name="UserName"')
            || html.includes('name="Password"');

        if (landedOnLogin) {
            throw new Error('TCC Login failed — credentials rejected (landed back on login page)');
        }

        if (debug) console.log('TCC login: success');
    });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    login: function(username, password) {
        return login(username, password)
            .then(() => new Session(username, password))
            .catch(err => {
                console.log('TCC Login Failed:', err.message || err);
                throw err;
            });
    }
};

// Maps TCC fan mode (0-3) to HomeKit boolean.
// Modes where the fan is actively doing something → true
// Modes where the fan is passive/automated → false
module.exports.toHomeBridgeFanSystem = function(fanMode) {
    switch (fanMode) {
        case 0: return false;  // Auto
        case 1: return true;   // On
        case 2: return true;   // Circulate
        case 3: return false;  // Follow Schedule
        default:
            console.log('Unexpected fanMode value [%s]', fanMode);
            return false;
    }
};

// Toggling on/off always uses On(1) / Auto(0).
// Use mode switches for Circulate(2) or Follow Schedule(3).
module.exports.toTCCFanSystem = function(fanSystem) {
    return fanSystem ? 1 : 0;
};

module.exports.isEmptyObject = function(obj) {
    for (const name in obj) return false;
    return true;
};

module.exports.diff = function(obj1, obj2) {
    const result = {};
    for (const key in obj1) {
        if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
            const change = module.exports.diff(obj1[key], obj2[key]);
            if (!module.exports.isEmptyObject(change)) result[key] = change;
        } else if (obj2[key] !== obj1[key]) {
            result[key] = obj2[key];
        }
    }
    return result;
};

module.exports.deepEquals = function(o1, o2) {
    return JSON.stringify(o1) === JSON.stringify(o2);
};

module.exports.setCharacteristic = function(data) { Characteristic = data; };
module.exports.setDebug         = function(data) { debug = data; };
