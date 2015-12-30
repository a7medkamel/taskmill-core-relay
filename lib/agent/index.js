var util              = require('util')
  , _                 = require('underscore')
  , Promise           = require('bluebird')
  ;

function Connection(registry, socket) {
  this.id         = socket.id;
  this.socket     = socket;
  this.registry   = registry;
}

function Agent(registry, socket) {
  Connection.call(this, registry, socket);

  this.name       = undefined; //set by heartbeat
  this.group      = undefined; //set by heartbeat
  this.info       = undefined; //set by heartbeat

  socket.on('ping', function(info){
    this.info      = info;
    this.group     = info.group
    this.name      = info.name;
  }.bind(this));

  socket.on('worker-stdio', (msg) => {
    var ws = this.registry.relay.getSocketByTaskId(msg.id);
    if (ws) {
      ws.emit('script-stdio', {
          type      : msg.type
        , text      : msg.text
        // todo [akamel] not needed anymore
        , execution : { id : msg.id }
      });
    }
  });
}

util.inherits(Agent, Connection);

Agent.prototype.run = function(task, cb) {
  Promise
    .promisify(task.run, task)(this)
    .nodeify(cb)
    ;
};

module.exports = Agent;