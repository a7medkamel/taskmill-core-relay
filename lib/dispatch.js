var async           = require('async')
  , Promise         = require('bluebird')
  , MemoryStream    = require('memorystream')
  , _               = require('underscore')
  , registry        = require('./registry')
  ;

function Dispatcher(relay) {
  // todo [akamel] dispatcher doesn't need relay anymore...
  this.relay = relay;
}

Dispatcher.prototype.queue = [];

Dispatcher.prototype.start = function() {
  var agent_registry = registry.get();

  async.forever(function(next) {
    var task = this.queue.shift();
    if (task) {
      Promise
        .promisify(agent_registry.run, { context : agent_registry })(task)
        .catch(function(err){
          task.decline(err);
        })
        ;
    }

    // todo [akamel] this is pretty bad loop logic; find better more efficient way
    _.delay(next, !task? 20 : 0);
  }.bind(this));
};

Dispatcher.prototype.push = function(task) {
  // todo [akamel] using .task here sucks... either rename to __taskmill.... or put doc on the item [queue] sibling to req
  // req.task = task.doc;
  this.queue.push(task);
};

module.exports = Dispatcher;