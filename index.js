// This platform integrates Honeywell TCC's Fan into homebridge
// As I only own single thermostat, so this only works with one, but it is
// conceivable to handle mulitple with additional coding.
//
// The configuration is stored inside the ../config.json
// {
//     "platform": "tcc",
//     "name":     "Fan",
//     "username" : "username/email",
//     "password" : "password",
//     "debug" : "True",      - Optional
//     "refresh": "60",       - Optional
//     "devices" : [
//        { "deviceID": "123456789", "name" : "Main Floor Thermostat" },
//        { "deviceID": "123456789", "name" : "Upper Floor Thermostat" }
//     ]
// }
//

/*jslint node: true */
'use strict';

var tcc = require('./lib/tcc.js');
var Accessory, Service, Characteristic, UUIDGen, CommunityTypes;

var myAccessories = [];
var session; // reuse the same login session
var updating; // Only one change at a time!!!!

module.exports = function(homebridge) {

    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-tcc-fan", "tcc-fan", tccPlatform);
}

function tccPlatform(log, config, api) {

    this.username = config['username'];
    this.password = config['password'];
    this.refresh = config['refresh'] || 60; // Update every minute
    this.debug = config['debug'] || false;
    this.log = log;
    this.devices = config['devices'];

    this.showFanControl = config['showFanControl'] !== false;
    this.showAuto = config['showAuto'] || false;
    this.showOn = config['showOn'] || false;
    this.showCirculate = config['showCirculate'] || false;
    this.showFollowSchedule = config['showFollowSchedule'] || false;

    updating = false;
}

tccPlatform.prototype = {
    accessories: function(callback) {
        this.log("Logging into tcc...");
        var that = this;

        tcc.setCharacteristic(Characteristic);
        tcc.setDebug(this.debug);

        tcc.login(that.username, that.password).then(function(login) {
            this.log("Logged into tcc!", this.devices);
            session = login;

            let requests = this.devices.map((device) => {
                return new Promise((resolve) => {

                    session.CheckDataSession(device.deviceID,
                        function(err, deviceData) {
                            if (err) {
                                that.log("Create Device Error", err);
                                resolve();
                            } else {

                                var newAccessory = new tccAccessory(that.log, device.name,
                                    deviceData, that.username, that.password, device.deviceID, that.debug,
                                    that.showFanControl, that.showAuto, that.showOn, that.showCirculate, that.showFollowSchedule);
                                // store accessory in myAccessories
                                myAccessories.push(newAccessory);
                                resolve();
                            }
                        });
                });
            })

            // Need to wait for all devices to be configured

            Promise.all(requests).then(() => {
                callback(myAccessories);
                that.periodicUpdate();
                setInterval(that.periodicUpdate.bind(this), this.refresh * 1000);

            });

            // End of login section
        }.bind(this)).fail(function(err) {
            // tell me if login did not work!
            that.log("Error during Login:", err);
            callback(err);
        });
    }
};

function updateStatus(that, service, data) {
    // var that = this;
    // if (that.device.latestData.hasFan && that.device.latestData.fanData && that.device.latestData.fanData.fanModeOnAllowed) {
    if (data.hasFan && data.fanData && data.fanData.fanModeOnAllowed) {
        service.getCharacteristic(Characteristic.On).getValue();
    }


}

tccPlatform.prototype.periodicUpdate = function(t) {
    if (this.debug) this.log("periodicUpdate");
    var t = updateValues(this);
}

function updateValues(that) {
    if (that.debug) that.log("updateValues", myAccessories.length);
    myAccessories.forEach(function(accessory) {

        session.CheckDataSession(accessory.deviceID, function(err, deviceData) {
            if (err) {
                that.log("ERROR: UpdateValues", accessory.name, err);
                that.log("updateValues: Device not reachable", accessory.name);
                // TODO replace for 1.x accessory.newAccessory.updateReachability(false);
                tcc.login(that.username, that.password).then(function(login) {
                    that.log("Logged into tcc!");
                    session = login;
                }.bind(this)).fail(function(err) {
                    // tell me if login did not work!
                    that.log("Error during Login:", err);
                });
            } else {
                if (that.debug) that.log("Update Values", accessory.name, deviceData);
                // Data is live

                if (deviceData.deviceLive) {
                    if (that.debug) that.log("updateValues: Device reachable", accessory.name);
                    // TODO replace for 1.x accessory.newAccessory.updateReachability(true);
                } else {
                    if (that.debug) that.log("updateValues: Device not reachable", accessory.name);
                    // TODO replace for 1.x accessory.newAccessory.updateReachability(false);
                }

                if (accessory.fanService && !tcc.deepEquals(deviceData, accessory.device)) {
                    if (that.debug) that.log("Change", accessory.name, tcc.diff(accessory.device, deviceData));
                    accessory.device = deviceData;
                    updateStatus(that, accessory.fanService, deviceData);
                } else {
                    if (that.debug) that.log("No change", accessory.name);
                }
            }
        });
    });
}

// give this function all the parameters needed

function tccAccessory(log, name, deviceData, username, password, deviceID, debug, showFanControl, showAuto, showOn, showCirculate, showFollowSchedule) {

    var uuid = UUIDGen.generate(name);

    this.newAccessory = new Accessory(name, uuid);

    //    newAccessory.name = name;

    this.log = log;
    this.log("Adding TCC Device", name, deviceID);
    this.name = name;
    this.device = deviceData;
    this.device.deviceLive = "false";
    this.username = username;
    this.password = password;
    this.deviceID = deviceID;
    this.debug = debug;
    this.showFanControl = showFanControl;
    this.showAuto = showAuto;
    this.showOn = showOn;
    this.showCirculate = showCirculate;
    this.showFollowSchedule = showFollowSchedule;

    //    return newAccessory;
}

tccAccessory.prototype = {

    getName: function(callback) {
        var that = this;
        that.log("requesting name of", this.name);
        callback(this.name);
    },

    setState: function(value, callback) {
        var that = this;
        if (!updating) {
            updating = true;

            that.log("Setting fan switch for", this.name, "to", value);
            // TODO:
            // verify that the task did succeed

            tcc.login(this.username, this.password).then(function(session) {
                session.setFanSwitch(that.deviceID, value).then(function(taskId) {
                    that.log("Successfully changed system!");
                    that.log(taskId);
                    // Update all information
                    // TODO: call periodicUpdate to refresh all data elements
                    updateValues(that);
                    callback(null, Number(1));
                });
            }).fail(function(err) {
                that.log('tcc Failed:', err);
                callback(null, Number(0));
            });
            callback(null, Number(0));
            updating = false
        }
    },

    getState: function(callback) {
        var that = this;

        // Homekit allowed values
        //         Characteristic.TargetFanState.MANUAL = 0;
        //         Characteristic.TargetFanState.AUTO = 1;

        var TargetFanState = tcc.toHomeBridgeFanSystem(this.device.latestData.fanData.fanMode);

        this.log("getTargetFanState is ", TargetFanState, this.name);

        callback(null, Boolean(TargetFanState));
    },

    getServices: function() {
        var that = this;
        that.log("getServices", this.name);

        // Information Service
        const informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Identify, this.name)
            .setCharacteristic(Characteristic.Manufacturer, "Honeywell")
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.Name, this.name)
            .setCharacteristic(Characteristic.SerialNumber, this.deviceID); // need to stringify the this.serial

        const returnServices = [];

        // Fan Service
        if (this.showFanControl) {
            this.log("Creating fan service...");
            this.fanService = new Service.Fan(this.name);
            this.fanService
                .getCharacteristic(Characteristic.Name)
                .on('get', this.getName.bind(this));
            this.log("Fan service created!")
        }

        if (this.device.latestData.hasFan && this.device.latestData.fanData && this.device.latestData.fanData.fanModeOnAllowed) {
            if (this.showFanControl) {
                this.log("Updating fan service...");
                this.fanService
                    .getCharacteristic(Characteristic.On)
                    .on('get', this.getState.bind(this))
                    .on('set', this.setState.bind(this));
                this.log("Fan service updated.")
            }

            if (this.showAuto) {
                this.log("Creating switch for \'Auto\'...");
                this.myMomemtarySwitchAuto = new Service.Switch("Auto", "mode-auto");
                this.myMomemtarySwitchAuto
                    .getCharacteristic(Characteristic.On)
                    .on("get", (callback) => {
                        callback(false)
                    })
                    .on("set", (s, callback) => {
                        if (s === true) {
                            if (myAccessories && myAccessories[0]) {
                                myAccessories[0].setState(0, callback);
                            }
                            // reset switch to off
                            setTimeout(function() {
                                this.myMomemtarySwitchAuto.setCharacteristic(Characteristic.On, false);
                            }.bind(this), 500);
                        } else {
                            callback(null, s);
                        }
                    });
                this.log("\'Auto\' switch created!");
            }

            if (this.showOn) {
                this.log("Creating switch for \'On\'...");
                this.myMomemtarySwitchOn = new Service.Switch("On", "mode-on");
                this.myMomemtarySwitchOn
                    .getCharacteristic(Characteristic.On)
                    .on("get", (callback) => {
                        callback(false)
                    })
                    .on("set", (s, callback) => {
                        if (s === true) {
                            if (myAccessories && myAccessories[0]) {
                                myAccessories[0].setState(1, callback);
                            }
                            // reset switch to off
                            setTimeout(function() {
                                this.myMomemtarySwitchOn.setCharacteristic(Characteristic.On, false);
                            }.bind(this), 500);
                        } else {
                            callback(null, s);
                        }
                    });
                this.log("\'On\' switch created!");
            }

            if (this.showCirculate) {
                this.log("Creating switch for \'Circulate\'...");
                this.myMomemtarySwitchCirculate = new Service.Switch("Circulate", "mode-circulate");
                this.myMomemtarySwitchCirculate
                    .getCharacteristic(Characteristic.On)
                    .on("get", (callback) => {
                        callback(false)
                    })
                    .on("set", (s, callback) => {
                        if (s === true) {
                            if (myAccessories && myAccessories[0]) {
                                myAccessories[0].setState(2, callback);
                            }
                            // reset switch to off
                            setTimeout(function() {
                                this.myMomemtarySwitchCirculate.setCharacteristic(Characteristic.On, false);
                            }.bind(this), 500);
                        } else {
                            callback(null, s);
                        }
                    });
                this.log("\'Circulate\' switch created!");
            }

            if (this.showFollowSchedule) {
                this.log("Creating switch for \'Follow Schedule\'...")
                this.myMomemtarySwitchFollowSchedule = new Service.Switch("Follow Schedule", "mode-follow-schedule");
                this.myMomemtarySwitchFollowSchedule
                    .getCharacteristic(Characteristic.On)
                    .on("get", (callback) => {
                        callback(false)
                    })
                    .on("set", (s, callback) => {
                        if (s === true) {
                            if (myAccessories && myAccessories[0]) {
                                myAccessories[0].setState(3, callback);
                            }
                            // reset switch to off
                            setTimeout(function() {
                                this.myMomemtarySwitchFollowSchedule.setCharacteristic(Characteristic.On, false);
                            }.bind(this), 500);
                        } else {
                            callback(null, s);
                        }
                    });
                this.log("\'Follow Schedule\' switch created!");
            }
        }

        returnServices.push(informationService);

        if (this.showFanControl) {
            returnServices.push(this.fanService);
        }

        if (this.showOn && this.myMomemtarySwitchOn) {
            returnServices.push(this.myMomemtarySwitchOn);
        }

        if (this.showAuto && this.myMomemtarySwitchAuto) {
            returnServices.push(this.myMomemtarySwitchAuto);
        }

        if (this.showCirculate && this.myMomemtarySwitchCirculate) {
            returnServices.push(this.myMomemtarySwitchCirculate);
        }

        if (this.showFollowSchedule && this.myMomemtarySwitchFollowSchedule) {
            returnServices.push(this.myMomemtarySwitchFollowSchedule);
        }

        return returnServices;
    }
}
