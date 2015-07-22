var util              = require('util')
  , _                 = require('underscore')
  // , dnode_stream      = require('dnode-http-stream')
  , uuid              = require('node-uuid')
  , pipe              = require('./pipe/index')
  , ss                = require('socket.io-stream')
  , channel           = require('./channel')
  ;

function Agent(socket, options) {
  this.id                 = uuid.v4();
  this.socket             = socket;
  this.name               = undefined; //set by heartbeat
  this.group              = undefined; //set by heartbeat
  this.info               = undefined; //set by heartbeat
  this.options            = options;

  this.sockets            = [];
}

Agent.prototype.handle = function(req, res, next) {
  channel.handle.call(this, req, res, next);
};

module.exports = Agent;