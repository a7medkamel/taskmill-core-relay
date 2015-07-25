var util              = require('util')
  , _                 = require('underscore')
  , uuid              = require('node-uuid')
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
  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  this.socket.emit('request', data);
};

module.exports = Agent;