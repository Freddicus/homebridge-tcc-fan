// This platform integrates Honeywell TCC's Fan into homebridge
//
// Config example (in config.json):
// {
//     "platform": "tcc-fan",
//     "name":     "Fan",
//     "username" : "username/email",
//     "password" : "password",
//     "debug" : false,            - Optional
//     "refresh": 60,              - Optional, seconds between updates
//     "showFanControl": true,     - Optional, show main fan On/Off (default: true)
//     "showAuto": false,          - Optional, show Auto mode switch
//     "showOn": false,            - Optional, show On mode switch
//     "showCirculate": false,     - Optional, show Circulate mode switch
//     "showFollowSchedule": false,- Optional, show Follow Schedule mode switch
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

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform('homebridge-tcc-fan', 'tcc-fan', tccPlatform);
};

function tccPlatform(log, config, api) {
    this.username = config['username'];
    this.password = config['password'];
    this.refresh = config['refresh'] || 60;
    this.debug = config['debug'] || false;
    this.log = log;
    this.devices = config['devices'];

    this.showFanControl = config['showFanControl'] !== false;
    this.showAuto = config['showAuto'] || false;
    this.showOn = config['showOn'] || false;
    this.showCirculate = config['showCirculate'] || false;
    this.showFollowSchedule = config['showFollowSchedule'] || false;
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

function updateStatus(that, service, data) {
    const latestData = data && data.latestData;
    if (latestData && latestData.hasFan && latestData.fanData && latestData.fanData.fanModeOnAllowed) {
        const value = tcc.toHomeBridgeFanSystem(latestData.fanData.fanMode);
        service.getCharacteristic(Characteristic.On).updateValue(value);
    }
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

                if (accessory.fanService && !tcc.deepEquals(deviceData, accessory.device)) {
                    if (that.debug) that.log('Change', accessory.name, tcc.diff(accessory.device, deviceData));
                    accessory.device = deviceData;
                    updateStatus(that, accessory.fanService, deviceData);
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

    this.log = log;
    this.log('Adding TCC Device', name, deviceID);
    this.name = name;
    this.device = deviceData;
    this.username = username;
    this.password = password;
    this.deviceID = deviceID;
    this.debug = debug;
    this.showFanControl = showFanControl;
    this.showAuto = showAuto;
    this.showOn = showOn;
    this.showCirculate = showCirculate;
    this.showFollowSchedule = showFollowSchedule;
}

tccAccessory.prototype = {

    getName: function(callback) {
        this.log('requesting name of', this.name);
        callback(null, this.name);
    },

    setState: function(value, callback) {
        const that = this;
        if (updating) {
            callback(null);
            return;
        }
        updating = true;

        that.log('Setting fan switch for', this.name, 'to', value);

        tcc.login(this.username, this.password).then(function(newSession) {
            return newSession.setFanSwitch(that.deviceID, value);
        }).then(function(taskId) {
            that.log('Successfully changed system!', taskId);
            updating = false;
            updateValues(that);
            callback(null);
        }).catch(function(err) {
            that.log('tcc Failed:', err);
            updating = false;
            callback(err);
        });
    },

    getState: function(callback) {
        const latestData = this.device && this.device.latestData;
        if (!latestData || !latestData.fanData) {
            callback(null, false);
            return;
        }
        const fanState = tcc.toHomeBridgeFanSystem(latestData.fanData.fanMode);
        this.log('getState is', fanState, this.name);
        callback(null, Boolean(fanState));
    },

    getServices: function() {
        const that = this;
        that.log('getServices', this.name);

        const informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Honeywell')
            .setCharacteristic(Characteristic.Model, this.model || 'TCC Thermostat')
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.SerialNumber, String(this.deviceID));

        const returnServices = [informationService];

        if (this.showFanControl) {
            that.log('Creating fan service...');
            this.fanService = new Service.Fan(this.name);
            this.fanService
                .getCharacteristic(Characteristic.Name)
                .on('get', this.getName.bind(this));
            that.log('Fan service created!');
        }

        const latestData = this.device && this.device.latestData;
        if (latestData && latestData.hasFan && latestData.fanData && latestData.fanData.fanModeOnAllowed) {

            if (this.showFanControl) {
                this.fanService
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getState.bind(this))
                    .on('set', this.setState.bind(this));
                returnServices.push(this.fanService);
            }

            if (this.showAuto) {
                that.log('Creating switch for \'Auto\'...');
                this.myMomemtarySwitchAuto = new Service.Switch('Auto', 'mode-auto');
                this.myMomemtarySwitchAuto
                    .getCharacteristic(Characteristic.On)
                    .on('get', callback => callback(null, false))
                    .on('set', (s, callback) => {
                        if (s === true) {
                            this.setState(0, callback);
                            setTimeout(() => {
                                this.myMomemtarySwitchAuto.updateCharacteristic(Characteristic.On, false);
                            }, 500);
                        } else {
                            callback(null);
                        }
                    });
                returnServices.push(this.myMomemtarySwitchAuto);
                that.log('\'Auto\' switch created!');
            }

            if (this.showOn) {
                that.log('Creating switch for \'On\'...');
                this.myMomemtarySwitchOn = new Service.Switch('On', 'mode-on');
                this.myMomemtarySwitchOn
                    .getCharacteristic(Characteristic.On)
                    .on('get', callback => callback(null, false))
                    .on('set', (s, callback) => {
                        if (s === true) {
                            this.setState(1, callback);
                            setTimeout(() => {
                                this.myMomemtarySwitchOn.updateCharacteristic(Characteristic.On, false);
                            }, 500);
                        } else {
                            callback(null);
                        }
                    });
                returnServices.push(this.myMomemtarySwitchOn);
                that.log('\'On\' switch created!');
            }

            if (this.showCirculate) {
                that.log('Creating switch for \'Circulate\'...');
                this.myMomemtarySwitchCirculate = new Service.Switch('Circulate', 'mode-circulate');
                this.myMomemtarySwitchCirculate
                    .getCharacteristic(Characteristic.On)
                    .on('get', callback => callback(null, false))
                    .on('set', (s, callback) => {
                        if (s === true) {
                            this.setState(2, callback);
                            setTimeout(() => {
                                this.myMomemtarySwitchCirculate.updateCharacteristic(Characteristic.On, false);
                            }, 500);
                        } else {
                            callback(null);
                        }
                    });
                returnServices.push(this.myMomemtarySwitchCirculate);
                that.log('\'Circulate\' switch created!');
            }

            if (this.showFollowSchedule) {
                that.log('Creating switch for \'Follow Schedule\'...');
                this.myMomemtarySwitchFollowSchedule = new Service.Switch('Follow Schedule', 'mode-follow-schedule');
                this.myMomemtarySwitchFollowSchedule
                    .getCharacteristic(Characteristic.On)
                    .on('get', callback => callback(null, false))
                    .on('set', (s, callback) => {
                        if (s === true) {
                            this.setState(3, callback);
                            setTimeout(() => {
                                this.myMomemtarySwitchFollowSchedule.updateCharacteristic(Characteristic.On, false);
                            }, 500);
                        } else {
                            callback(null);
                        }
                    });
                returnServices.push(this.myMomemtarySwitchFollowSchedule);
                that.log('\'Follow Schedule\' switch created!');
            }
        } else if (this.showFanControl && this.fanService) {
            // Fan service exists but device doesn't report fan capability yet
            returnServices.push(this.fanService);
        }

        return returnServices;
    }
};
