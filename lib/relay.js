var Promise     = require('bluebird')
  , _           = require('underscore')
  , registry    = require('./registry')
  , dispatcher  = require('./dispatch')
  ;

function Relay(options) {
  this.web_socket       = options.web_socket;
  // this.port             = options.port;
  this.public_group_id  = options.public_group_id;
  this.createLogStream  = options.createLogStream;
}

Relay.prototype.listen = function(options, cb) {
  var me = this;

  Promise
    .promisify(registry.listen)({
        web_socket        : this.web_socket
      , port              : options.port
      , default_group_id  : this.public_group_id
      , createLogStream   : this.createLogStream
    })
    .then(function(registry){
      return Promise.promisify(dispatcher.listen)();
    })
    .then(function(){
      Relay.list.push(me);
    })
    .nodeify(cb);
}

Relay.prototype.emit = function() {
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
