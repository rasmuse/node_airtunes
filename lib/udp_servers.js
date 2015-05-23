var dgram = require('dgram'),
    events = require('events'),
    util = require('util'),
    async = require('async'),
    config = require('./config.js'),
    nu = require('./num_util.js'),
    ntp = require('./ntp.js');

var UNBOUND = 0,
    BINDING = 1,
    BOUND = 2;

function UDPServers() {
  events.EventEmitter.call(this);

  this.status = UNBOUND;

  this.control = {
    socket: null,
    port: null,
    name: 'control'
  };

  this.timing = {
    socket: null,
    port: null,
    name: 'timing'
  };
}

util.inherits(UDPServers, events.EventEmitter);

UDPServers.prototype.init = function(devices) {
  var self = this;

  devices.on('airtunes_devices', function(hasAirTunes) {
    // open UDP servers only when we have AirTunes devices
    if(!hasAirTunes)
      self.close();
  });
};

UDPServers.prototype.bind = function() {
  var self = this;

  switch(this.status) {
  case BOUND:
    process.nextTick(function() {
      self.emit('ports', null, this.control, this.timing);
    });
    return;

  case BINDING:
    return;
  }

  var self = this;
  this.status = BINDING;

  // Timing socket
  this.timing.socket = dgram.createSocket('udp4');

  this.timing.socket.on('message', function(msg, rinfo) {
    var ts1 = msg.readUInt32BE(16);
    var ts2 = msg.readUInt32BE(24);

    var reply = new Buffer(32);
    reply.writeUInt16BE(0x80d3, 0);
    reply.writeUInt16BE(0x0007, 2);
    reply.writeUInt32BE(0x00000000, 4);

    reply.writeUInt32BE(ts2, 8);

    var ntpTime = ntp.timestamp();

    ntpTime.copy(reply, 16);
    ntpTime.copy(reply, 24);

    self.timing.socket.send(
      reply, 0, reply.length,
      rinfo.port, rinfo.address
    );
  });

  // Control socket
  this.control.socket = dgram.createSocket('udp4');

  this.control.socket.on('message', function(msg, rinfo) {
    var resendRequested = msg.readUInt8(1) == (0x80|0x55);
    //var serverSeq = msg.readUInt16BE(2);
    if (resendRequested) {
      var missedSeq = msg.readUInt16BE(4);
      var count = msg.readUInt16BE(6);
      self.emit('resendRequested', missedSeq, count)
    }
  });

  // Find open ports
  var to_bind = [this.control, this.timing];
  var current_port = config.udp_default_port;

  async.whilst(
    function() { return to_bind.length > 0; },
    function(cb) {
      var nextPort = to_bind[0];
      nextPort.socket.once('error', function(e) {
        if(e.code === 'EADDRINUSE') {
          // try next port
          current_port++;
          cb();
        } else
          // otherwise, report the error and cancel everything
          cb(e);
      });

      nextPort.socket.once('listening', function() {
        // socket successfully bound
        to_bind.shift();
        nextPort.port = current_port;
        current_port++;
        cb();
      });

      nextPort.socket.bind(current_port);
    },
    function(err) {
      if(err) {
        self.close();
        self.emit('ports', err);
      } else {
        self.status = BOUND;
        self.emit('ports', null, self.control, self.timing);
      }
    }
  );
}

UDPServers.prototype.close = function() {
  if(this.status === UNBOUND) 
    return;

  this.status = UNBOUND;

  this.timing.socket.close();
  this.timing.socket = null;

  this.control.socket.close();
  this.control.socket = null;
}

UDPServers.prototype.sendControlSync = function(seq, dev, rtsp) {
  if(this.status !== BOUND)
    return;

  var packet = new Buffer(20);

  packet.writeUInt16BE(0x80d4, 0);
  packet.writeUInt16BE(0x0007, 2);

  var now =  nu.low32(seq*config.frames_per_packet +
    config.sampling_rate*2)

  packet.writeUInt32BE(now - rtsp.latency, 4);

  var ntpTime = ntp.timestamp();
  ntpTime.copy(packet, 8);

  packet.writeUInt32BE(now, 16);

  this.control.socket.send(packet, 0, packet.length, dev.controlPort, dev.host);
}

module.exports = new UDPServers();
