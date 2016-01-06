var Promise               = require('bluebird')
  , _                     = require('underscore')
  , localtunnel_server    = require('localtunnel-server/server')
  , onFinished            = require('on-finished')
  , registry              = require('./registry')
  , Dispatcher            = require('./dispatch')
  , Task                  = require('./agent/task')
  ;

function Relay(options) {
  // global scope instance
  // this.socket = options.web_socket;
  // todo [akamel] connect new socket if non passed in
  this.io = options.web_socket;

  this.public_group_id  = options.public_group_id;

  Relay.__instance = this;
}

Relay.prototype.proxy = function(info, cb) {
  // todo [akamel] handle getting calls to proxy from machines that no longer have jobs [zombies]
  var id    = info.id
    , task  = Task.getById(id)
    ;

  if (task) {
    var req   = task.req
      , res   = task.res
      ;

    this.server.proxy(id, req, res);
  }
}

Relay.prototype.listen = function(options, cb) {
  var me = this;

  Promise
    .promisify(registry.listen)(me, {
        port              : options.port
      , default_group_id  : this.public_group_id
    })
    .bind(this)
    .then(function(registry){
      this.dispatcher = new Dispatcher(this);

      this.dispatcher.start();
    })
    .then(function(){
      // todo [akamel] put this in config
      // return Promise.promisify(app.listen, app)(8989);
      me.server = localtunnel_server({
          max_tcp_sockets : 1
        // todo [akamel] put this in config
      });

      me.server.on('new_client', function(info){
        me.proxy(info);
      });

      // todo [akamel] put this in config
      return Promise.promisify(me.server.listen, me.server)(8989);
    })
    .nodeify(cb);
};

Relay.prototype.getSocket = function() {
  return this.io;
};

Relay.prototype.getSocketByTaskId = function(id) {
  var task = this.__tasks[id];
  return task? this.io.sockets.connected[task.socket_id] : undefined;
};

Relay.prototype.emit = function(doc, req, res) {
  var task = new Task(doc, req, res);

  this.__tasks[task.id] = task;

  Promise
    .promisify(task.load_cache_info, task)()
    .bind(this)
    .then(function(cache_info){
      // console.log('about to read from cache:', cache_info, cache_info.cached);
      if (cache_info.cached) {
        task.stream_from_cache(cache_info);
      } else {
        this.dispatcher.push(task);
      }
    })
    .catch(function(err){
      task.decline(err);
    });

  onFinished(res, () => {
    delete this.__tasks[task.id];

    // todo [akamel] [simplify this]
    var ws = this.getSocketByTaskId(task.id);
    if (ws) {
      ws.emit('script-stdio', {
          type      : 'stdout'
        , text      : null
        // todo [akamel] not needed anymore
        , execution : { id : task.id }
      });
    }
  });
};

// todo [akamel] deprecate this in favor of decline on task
// todo [akamel] diffrentiate between uncaught exceptions; and known system errors
Relay.prototype.decline = function(err, req, res) {
  var err_obj = {
      type    : _.isError(err)? 'exception' : 'notification'
    , error   : err.message
    // todo [akamel] should we expose this? its OSS anyway
    , stack   : err.stack
    , details : req.url
    , target  : 'taskmill-core-relay'
  };

  // todo [akamel] this should be moved to new response mechanics...
  res.set('Cache-Control', 'no-cache');
  res.status(500).send(err_obj);
};

Relay.prototype.getAgents = function() {
  return registry.get().findAll();
};

Relay.prototype.__tasks = {};

Relay.get = function() {
  return Relay.__instance;
}

module.exports = Relay;
