/*jslint node: true */
'use strict';

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

let Characteristic;
let debug = false;

// One shared cookie jar for the session
const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const COMMON_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Host': 'mytotalconnectcomfort.com',
    'DNT': '1',
    'Origin': 'https://mytotalconnectcomfort.com/portal',
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36'
};

function Session(username, password) {
    this.username = username;
    this.password = password;
}

Session.prototype.CheckDataSession = function(deviceID, cb) {
    const utc_seconds = Date.now();
    const url = `https://mytotalconnectcomfort.com/portal/Device/CheckDataSession/${deviceID}?_=${utc_seconds}`;

    this._request(url)
        .then(json => cb(null, json))
        .catch(err => {
            console.log('CDS Failed:', err);
            cb(err);
        });
};

Session.prototype.setFanSwitch = function(deviceId, fanSwitch) {
    const url = 'https://mytotalconnectcomfort.com/portal/Device/SubmitControlScreenChanges';

    const body = {
        DeviceID: Number(deviceId),
        SystemSwitch: null,
        HeatSetpoint: null,
        CoolSetpoint: null,
        HeatNextPeriod: null,
        CoolNextPeriod: null,
        StatusHeat: null,
        StatusCool: null,
        FanMode: Number(fanSwitch)
    };

    if (debug) console.log('setFanSwitch', body);

    return client.post(url, body, {
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.5',
            'Content-Type': 'application/json; charset=UTF-8',
            'Host': 'mytotalconnectcomfort.com',
            'Origin': 'https://mytotalconnectcomfort.com',
            'Referer': `https://mytotalconnectcomfort.com/portal/Device/Control/${deviceId}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).then(response => response.data);
};

Session.prototype._request = function(url) {
    return client.get(url, {
        timeout: 15000,
        headers: {
            'Accept': '*/*',
            'DNT': '1',
            'Cache-Control': 'max-age=0',
            'Accept-Language': 'en-US,en;q=0.8',
            'Connection': 'keep-alive',
            'Host': 'mytotalconnectcomfort.com',
            'Referer': 'https://mytotalconnectcomfort.com/portal/',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.95 Safari/537.36'
        }
    }).then(response => response.data);
};

function login(username, password) {
    // Step 1: GET to obtain initial session cookies
    return client.get('https://mytotalconnectcomfort.com/portal/', {
        timeout: 10000,
        headers: COMMON_HEADERS
    }).then(() => {
        // Step 2 & 3: POST credentials; axios auto-follows the 302 redirect
        const params = new URLSearchParams({
            UserName: username,
            Password: password,
            RememberMe: 'false'
        });

        return client.post('https://mytotalconnectcomfort.com/portal/', params.toString(), {
            timeout: 10000,
            headers: {
                ...COMMON_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    }).then(response => {
        if (response.status !== 200) {
            throw new Error(`TCC Login failed, please check your credentials (status ${response.status})`);
        }
    });
}

module.exports = {
    login: function(username, password) {
        return login(username, password).then(() => {
            return new Session(username, password);
        }).catch(err => {
            console.log('TCC Login Failed:', err.message || err);
            throw err;
        });
    }
};

module.exports.toHomeBridgeFanSystem = function(fanSystem) {
    switch (fanSystem) {
        case 1: return true;   // On
        case 0: return false;  // Auto
        default:
            console.log('Unexpected fanSystem value [%s]', fanSystem);
            return true;
    }
};

module.exports.toTCCFanSystem = function(fanSystem) {
    switch (fanSystem) {
        case true: return 1;   // On
        case false: return 0;  // Auto
        default:
            console.log('Unexpected fanSystem value [%s]', fanSystem);
            return 0;
    }
};

module.exports.isEmptyObject = function(obj) {
    for (const name in obj) {
        return false;
    }
    return true;
};

module.exports.diff = function(obj1, obj2) {
    const result = {};
    for (const key in obj1) {
        if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
            const change = module.exports.diff(obj1[key], obj2[key]);
            if (!module.exports.isEmptyObject(change)) {
                result[key] = change;
            }
        } else if (obj2[key] !== obj1[key]) {
            result[key] = obj2[key];
        }
    }
    return result;
};

module.exports.deepEquals = function(o1, o2) {
    return JSON.stringify(o1) === JSON.stringify(o2);
};

module.exports.setCharacteristic = function(data) {
    Characteristic = data;
};

module.exports.setDebug = function(data) {
    debug = data;
};
