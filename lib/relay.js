var Promise     = require('bluebird')
  , _           = require('underscore')
  , registry    = require('./registry')
  , dispatcher  = require('./dispatch')
  , channel     = require('./agent/channel')
  ;

function Relay(options) {
  this.web_socket       = options.web_socket;
  this.public_group_id  = options.public_group_id;
}

Relay.prototype.listen = function(options, cb) {
  var me = this;

  Promise
    .promisify(registry.listen)({
        port              : options.port
      , web_socket        : this.web_socket
      , default_group_id  : this.public_group_id
    })
    .then(function(registry){
      return Promise.promisify(dispatcher.listen)();
    })
    .then(function(){
      Relay.list.push(me);
    })
    .then(function(){
      return Promise.promisify(channel.relay_listen, me)({});
    })
    .nodeify(cb);
}

Relay.prototype.emit = function(data, req, res) {
  channel.relay_emit.apply(this, _.toArray(arguments));

  var instance = dispatcher.get();

  return instance.push.apply(instance, _.toArray(arguments));
}

Relay.prototype.getAgents = function() {
  var instance = registry.get();

  return instance.list;
}


Relay.list = [];

Relay.get = function() {
  return _.sample(Relay.list);
}

module.exports = Relay;
