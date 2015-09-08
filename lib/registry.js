var Agent         = require('./agent')
  , util          = require('util')
  , _             = require('underscore')
  , weighted      = require('weighted')
  , man           = require('taskmill-core-man')
  , Registry      = require('taskmill-core-relay-registry').Registry
  ;

function AgentRegistry(relay, options) {
  this.options  = options || {};

  this.relay    = relay;

  Registry.call(this, this.options.port, Agent);
}

util.inherits(AgentRegistry, Registry);

AgentRegistry.prototype.findOne = function(data) {
  var group  = this.options.default_group_id
    , manual = data.manual || man.get(data.content)
    ;

  if (manual.group) {
    group = manual.group;
  }

  // todo [akamel] cache group_id
  var options = this.findAll(function(i){ return i.group === group && !!_.size(i.info.workers); });

  if (_.size(options)) {
    var weights = _.map(options, function(i){ return _.size(i.info.workers); });

    return weighted.select(options, weights);
  }

  return undefined;
};

AgentRegistry.prototype.handle = function(req, res, next) {
  var agent = this.findOne(req.task);

  if (agent) {
    // todo [akamel] why do we have this req.agent? should be __taskmill_agent if even needed
    agent.handle(req, res, next);
  } else {
    next(new Error('no agents available'));
  }
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