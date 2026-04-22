// This platform integrates Honeywell TCC's Fan into homebridge
//
// Config example (in config.json):
// {
//     "platform": "tcc-fan",
//     "name":     "Fan",
//     "username" : "username/email",
//     "password" : "password",
//     "debug" : false,              - Optional
//     "refresh": 60,                - Optional, seconds between updates
//     "showFanControl": false,      - Optional, legacy on/off toggle (default: false)
//     "showAuto": true,             - Optional, show Auto mode switch (default: true)
//     "showOn": true,               - Optional, show On mode switch (default: true)
//     "showCirculate": true,        - Optional, show Circulate mode switch (default: true)
//     "showFollowSchedule": true,   - Optional, show Follow Schedule mode switch (default: true)
//     "devices" : [
//        { "deviceID": "123456789", "name" : "Main Floor Thermostat" },
//        { "deviceID": "987654321", "name" : "Upper Floor Thermostat" }
//     ]
// }

/*jslint node: true */
'use strict';

const tcc = require('./lib/tcc.js');

let Accessory, Service, Characteristic, UUIDGen;

let myAccessories = [];
let session;
let updating = false;

// Fan modes
const MODE_AUTO            = 0;
const MODE_ON              = 1;
const MODE_CIRCULATE       = 2;
const MODE_FOLLOW_SCHEDULE = 3;

module.exports = function(homebridge) {
    Accessory      = homebridge.platformAccessory;
    Service        = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen        = homebridge.hap.uuid;

    homebridge.registerPlatform('homebridge-tcc-fan', 'tcc-fan', tccPlatform);
};

function tccPlatform(log, config, api) {
    this.username = config['username'];
    this.password = config['password'];
    this.refresh  = config['refresh'] || 60;
    this.debug    = config['debug']   || false;
    this.log      = log;
    this.devices  = config['devices'];

    // Legacy on/off fan toggle — off by default in favour of mode switches
    this.showFanControl = config['showFanControl'] || false;

    // Stateful mode switches — all on by default
    this.showAuto           = config['showAuto']           !== false;
    this.showOn             = config['showOn']             !== false;
    this.showCirculate      = config['showCirculate']      !== false;
    this.showFollowSchedule = config['showFollowSchedule'] !== false;
}

tccPlatform.prototype = {
    accessories: function(callback) {
        this.log('Logging into tcc...');
        const that = this;

        tcc.setCharacteristic(Characteristic);
        tcc.setDebug(this.debug);

        tcc.login(that.username, that.password).then(function(login) {
            that.log('Logged into tcc!', that.devices);
            session = login;

            const requests = that.devices.map(device => {
                return new Promise(resolve => {
                    session.CheckDataSession(device.deviceID, function(err, deviceData) {
                        if (err) {
                            that.log('Create Device Error', err);
                            resolve();
                        } else {
                            const newAccessory = new tccAccessory(
                                that.log, device.name, deviceData,
                                that.username, that.password, device.deviceID, that.debug,
                                that.showFanControl, that.showAuto, that.showOn,
                                that.showCirculate, that.showFollowSchedule
                            );
                            myAccessories.push(newAccessory);
                            resolve();
                        }
                    });
                });
            });

            return Promise.all(requests).then(() => {
                callback(myAccessories);
                that.periodicUpdate();
                setInterval(that.periodicUpdate.bind(that), that.refresh * 1000);
            });
        }).catch(function(err) {
            that.log('Error during Login:', err);
            callback(err);
        });
    }
};

function updateStatus(that, accessory, data) {
    const latestData = data && data.latestData;
    if (!latestData || !latestData.hasFan || !latestData.fanData || !latestData.fanData.fanModeOnAllowed) return;

    const mode = latestData.fanData.fanMode;

    // Update legacy on/off fan service
    if (accessory.fanService) {
        accessory.fanService.getCharacteristic(Characteristic.On)
            .updateValue(tcc.toHomeBridgeFanSystem(mode));
    }

    // Update all mode switches — exactly one will be on
    accessory.updateAllSwitches(mode);
}

tccPlatform.prototype.periodicUpdate = function() {
    if (this.debug) this.log('periodicUpdate');
    updateValues(this);
};

function updateValues(that) {
    if (that.debug) that.log('updateValues', myAccessories.length);

    myAccessories.forEach(function(accessory) {
        session.CheckDataSession(accessory.deviceID, function(err, deviceData) {
            if (err) {
                that.log('ERROR: UpdateValues', accessory.name, err);
                tcc.login(that.username, that.password).then(function(login) {
                    that.log('Re-logged into tcc after error');
                    session = login;
                }).catch(function(loginErr) {
                    that.log('Error during re-login:', loginErr);
                });
            } else {
                if (that.debug) that.log('Update Values', accessory.name, deviceData);

                if (!tcc.deepEquals(deviceData, accessory.device)) {
                    if (that.debug) that.log('Change', accessory.name, tcc.diff(accessory.device, deviceData));
                    accessory.device = deviceData;
                    updateStatus(that, accessory, deviceData);
                } else {
                    if (that.debug) that.log('No change', accessory.name);
                }
            }
        });
    });
}

function tccAccessory(log, name, deviceData, username, password, deviceID, debug,
    showFanControl, showAuto, showOn, showCirculate, showFollowSchedule) {

    const uuid = UUIDGen.generate(name);
    this.newAccessory = new Accessory(name, uuid);

    this.log      = log;
    this.name     = name;
    this.device   = deviceData;
    this.username = username;
    this.password = password;
    this.deviceID = deviceID;
    this.debug    = debug;

    this.showFanControl     = showFanControl;
    this.showAuto           = showAuto;
    this.showOn             = showOn;
    this.showCirculate      = showCirculate;
    this.showFollowSchedule = showFollowSchedule;

    // Map of mode number → Switch service, used for mutual exclusion updates
    this.modeServices = {};

    this.log('Adding TCC Device', name, deviceID);
}

tccAccessory.prototype.getCurrentMode = function() {
    const fanData = this.device && this.device.latestData && this.device.latestData.fanData;
    return fanData ? fanData.fanMode : MODE_AUTO;
};

// Push the correct on/off state to every mode switch without triggering set handlers
tccAccessory.prototype.updateAllSwitches = function(mode) {
    for (const [modeKey, svc] of Object.entries(this.modeServices)) {
        svc.getCharacteristic(Characteristic.On).updateValue(Number(modeKey) === mode);
    }
};

tccAccessory.prototype.setFanMode = function(mode, callback) {
    const that = this;

    if (updating) {
        callback(null);
        return;
    }
    updating = true;

    that.log('Setting fan mode for', this.name, 'to', mode);

    tcc.login(this.username, this.password).then(function(newSession) {
        return newSession.setFanSwitch(that.deviceID, mode);
    }).then(function(taskId) {
        that.log('Fan mode set successfully', taskId);
        updating = false;
        updateValues(that);
        callback(null);
    }).catch(function(err) {
        that.log('setFanMode failed:', err);
        updating = false;
        callback(err);
    });
};

tccAccessory.prototype.getServices = function() {
    const that = this;
    that.log('getServices', this.name);

    const informationService = new Service.AccessoryInformation();
    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'Honeywell')
        .setCharacteristic(Characteristic.Model, this.model || 'TCC Thermostat')
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.SerialNumber, String(this.deviceID));

    const returnServices = [informationService];

    const latestData = this.device && this.device.latestData;
    const hasFan = latestData && latestData.hasFan && latestData.fanData && latestData.fanData.fanModeOnAllowed;

    // Legacy on/off fan toggle
    if (this.showFanControl) {
        this.fanService = new Service.Fan(this.name);
        this.fanService
            .getCharacteristic(Characteristic.Name)
            .on('get', cb => cb(null, this.name));

        if (hasFan) {
            this.fanService
                .getCharacteristic(Characteristic.On)
                .on('get', cb => cb(null, tcc.toHomeBridgeFanSystem(this.getCurrentMode())))
                .on('set', (value, cb) => this.setFanMode(value ? MODE_ON : MODE_AUTO, cb));
        }

        returnServices.push(this.fanService);
    }

    if (!hasFan) return returnServices;

    // Stateful, mutually exclusive mode switches
    const modeDefs = [
        { key: 'showAuto',           name: 'Auto',            mode: MODE_AUTO,            subtype: 'mode-auto' },
        { key: 'showOn',             name: 'On',              mode: MODE_ON,              subtype: 'mode-on' },
        { key: 'showCirculate',      name: 'Circulate',       mode: MODE_CIRCULATE,       subtype: 'mode-circulate' },
        { key: 'showFollowSchedule', name: 'Follow Schedule', mode: MODE_FOLLOW_SCHEDULE, subtype: 'mode-follow-schedule' },
    ];

    const currentMode = this.getCurrentMode();

    modeDefs.forEach(({ key, name, mode, subtype }) => {
        if (!this[key]) return;

        const svc = new Service.Switch(name, subtype);

        svc.getCharacteristic(Characteristic.On)
            .on('get', cb => cb(null, this.getCurrentMode() === mode))
            .on('set', (value, cb) => {
                if (value) {
                    // User turned this mode on — activate it
                    this.setFanMode(mode, cb);
                } else {
                    // User turned this mode off — fall back to Auto
                    // (ignored if this switch IS Auto, since Auto turning off = Auto)
                    this.setFanMode(mode === MODE_AUTO ? MODE_AUTO : MODE_AUTO, cb);
                }
            });

        // Set initial state
        svc.getCharacteristic(Characteristic.On).updateValue(currentMode === mode);

        this.modeServices[mode] = svc;
        returnServices.push(svc);
        that.log(`'${name}' mode switch created`);
    });

    return returnServices;
};
