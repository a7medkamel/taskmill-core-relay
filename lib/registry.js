var Agent         = require('./agent')
  , util          = require('util')
  , _             = require('underscore')
  , weighted      = require('weighted')
  , man           = require('taskmill-core-man')
  ;

function AgentRegistry(relay, options) {
  this.options  = options || {};

  this.relay    = relay;
}

AgentRegistry.prototype.list = {};

AgentRegistry.prototype.initialize = function(cb) {
  var me = this;

  var io = require('socket.io')(this.options.port, { httpCompression : true });

  io.on('connection', function(socket){
    var agent = new Agent(me, socket);

    me.register(agent);

    socket.on('disconnect', function(){
      me.unregister(agent);
    });
  });

  cb();
};

AgentRegistry.prototype.find = function(id) {
  if (_.isObject(id)) {
    id = id.id;
  }

  return this.list[id];
};

AgentRegistry.prototype.register = function(agent) {
  this.list[agent.id] = agent;
};

AgentRegistry.prototype.unregister = function(agent) {
  if (_.isObject(agent)) {
    delete this.list[agent.id];
  }
};

AgentRegistry.prototype.handle = function(req, res, next) {
  var group  = this.options.default_group_id
    // , manual    = man.get(req.task.content)
    , manual = {}
    ;

  if (manual.group) {
    group = manual.group;
  }

  // todo [akamel] cache group_id
  var options = _.filter(this.list, function(i){
                  return i.group === group && !!_.size(i.info.workers);
                })
    , weights = _.map(options, function(i){ return _.size(i.info.workers); })
    , agent   = !!_.size(options)? weighted.select(options, weights) : undefined;
    ;

  if (agent) {
    // todo [akamel] why do we have this req.agent? should be __taskmill_agent if even needed
    req.agent = agent;
    agent.handle(req, res, next);
  } else {
    next(new Error('no agents available'));
  }
};

var singleton = undefined;

function listen(relay, options, cb) {
  if (!singleton) {
    singleton = new AgentRegistry(relay, options);

    singleton.initialize(cb);

    return singleton;
  } else {
    _.defer(cb, new Error('registry already initialized'));
  }
}

module.exports = {
    listen  : listen
  , get     : function() { return singleton; }
};