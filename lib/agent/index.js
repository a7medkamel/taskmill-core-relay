var util              = require('util')
  , _                 = require('underscore')
  , Promise           = require('bluebird')
  ;

function Agent(registry, socket) {
  this.id         = socket.id;
  this.socket     = socket;

  this.registry   = registry;

  this.name       = undefined; //set by heartbeat
  this.group      = undefined; //set by heartbeat
  this.info       = undefined; //set by heartbeat

  socket.on('ping', (info) => {
    this.info      = info;
    this.group     = info.group
    this.name      = info.name;
  });

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

Agent.prototype.run = function(task, cb) {
  Promise
    .promisify(task.run, task)(this)
    .nodeify(cb)
    ;
};

module.exports = Agent;