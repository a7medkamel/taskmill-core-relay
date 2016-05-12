var util              = require('util')
  , _                 = require('underscore')
  , Task              = require('./task')
  , Promise           = require('bluebird')
  ;

function Agent(socket) {
  this.id         = socket.id;
  this.socket     = socket;

  this.name       = undefined; //set by heartbeat
  this.group      = undefined; //set by heartbeat
  this.info       = undefined; //set by heartbeat

  socket.on('/ping', (info) => {
    this.info      = info;
    this.group     = info.group
    this.name      = info.name;
  });

  socket.on('/worker-stdio', (msg) => {
    // todo [akamel] fix this
    var task = Task.getById(msg.id);
    if (task) {
      task.emit('script-stdio', {
          type      : msg.type
        , text      : msg.text
        // todo [akamel] not needed anymore
        , execution : { id : msg.id }
      });
    }
  });
}

Agent.prototype.run = function(task, cb) {
  return Promise
          .promisify(task.run, { context : task })(this)
          .nodeify(cb)
          ;
};

module.exports = Agent;