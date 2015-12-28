var Agent         = require('./agent')
  , util          = require('util')
  , _             = require('underscore')
  , Promise       = require('bluebird')
  , weighted      = require('weighted')
  , Registry      = require('taskmill-core-relay-registry').Registry
  ;

function AgentRegistry(relay, options) {
  this.options  = options || {};

  this.relay    = relay;

  Registry.call(this, this.options.port, Agent);
}

util.inherits(AgentRegistry, Registry);

AgentRegistry.prototype.findOne = function(task) {
  var group  = this.options.default_group_id
    , manual = task.doc.manual
    ;

  if (manual.group) {
    group = manual.group;
  }

  // todo [akamel] cache group_id
  var options = this.findAll(function(i){ return i.group === group; });

  if (_.size(options)) {
    var weights = _.map(options, function(i){ return i.info.capacity; });

    return weighted.select(options, weights);
  }

  return undefined;
};

AgentRegistry.prototype.run = function(task, cb) {
  Promise
    .resolve(this.findOne(task))
    .then(function(agent){
      if (!agent) {
        throw new Error('no agents available');
      }

      return Promise.promisify(agent.run, agent)(task);
    })
    .nodeify(cb)
    ;
};

var singleton = undefined;

function listen(relay, options, cb) {
  if (!singleton) {
    _.delay(cb);

    return singleton = new AgentRegistry(relay, options);
  } else {
    _.defer(cb, new Error('registry already initialized'));
  }
}

module.exports = {
    listen  : listen
  , get     : function() { return singleton; }
};