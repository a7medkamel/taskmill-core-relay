var Agent         = require('../agent')
  , util          = require('util')
  , _             = require('underscore')
  , EventEmitter  = require('events').EventEmitter
  , upnode        = require('upnode')
  , dnode_stream  = require('dnode-http-stream')
  , man           = require('taskmill-core-man')
  ;

function AgentRegistry(options) {
  this.options = options;
}

util.inherits(AgentRegistry, EventEmitter);

AgentRegistry.prototype.list = {};

AgentRegistry.prototype.initialize = function(cb) {
  var me = this;
  this.server = upnode(function (client, conn) {

    var agent = new Agent(client, _.extend({
        connection      : conn
      , createLogStream : me.options.createLogStream

      }, _.pick(this.options, 'socket_io')
    ));

    this.heartbeat = function (from, cb) {
      agent.info      = from;
      agent.group     = from.group
      agent.name      = from.name;

      cb && cb(undefined, { name : me.name, time : new Date() });
    };

    this.write = dnode_stream.readable.write;

    this.error = function(id, err, cb) {
      console.error('error sent from connected agent', err);
    };

    conn
      .on('ready', function () {
        me.register(agent);
      })
      .on('end', function(){
        me.unregister(agent);
      })
      .on('error', function(err) {
        console.error('upnode err', err);
      })
      ;

  }).listen(this.options.port, cb);

  this.server.maxConnections = 400;
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
  var manual  = man.get(req.task.content)
    , workers = []
    ;

  if (manual.group) {
    workers = _.where(this.list, { group : manual.group });
  } else {
    // todo [akamel] cache group_id
    workers = _.where(this.list, { group : this.options.default_group_id });
  }

  var agent = _.sample(workers);

  if (agent) {
    agent.handle(req, res, next);
  } else {
    next(new Error('no agents available'));
  }
};

var singleton = undefined;

function listen(options, cb) {
  if (!singleton) {
    singleton = new AgentRegistry(options);

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