var util              = require('util')
  , _                 = require('underscore')
  , uuid              = require('node-uuid')
  ;

function Agent(registry, socket, options) {
  this.options    = options || {};

  this.id         = uuid.v4();
  this.socket     = socket;
  this.registry   = registry;
  this.name       = undefined; //set by heartbeat
  this.group      = undefined; //set by heartbeat
  this.info       = undefined; //set by heartbeat

  socket.on('ping', function(info){
    this.info      = info;
    this.group     = info.group
    this.name      = info.name;

    socket.emit('ack', { id : this.id });
  }.bind(this));

  socket.on('worker', function(msg){
    this.registry.relay.getSocket().in(msg.id).emit('script-stdio', {
        type      : msg.type
      , text      : msg.text
      , execution : { id : msg.id }
    });
  }.bind(this));
}

Agent.prototype.handle = function(req, res, next) {
  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  this.socket.emit('request', data);
};

module.exports = Agent;