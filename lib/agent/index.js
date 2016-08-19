var _                 = require('underscore')
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
}

Agent.prototype.run = function(task, cb) {
  return Promise
          .promisify(task.run, { context : task })(this)
          .nodeify(cb)
          ;
};

module.exports = Agent;