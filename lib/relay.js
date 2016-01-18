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
      return Promise.promisify(me.server.listen, { context : me.server })(8989);
    })
    .nodeify(cb);
};

Relay.prototype.getSocket = function() {
  return this.io;
};

Relay.prototype.getSocketByTaskId = function(id) {
  var task = this.__tasks[id];
  if (task) {
    // todo [akamel] not sure why /# is required now
    var socket_id = '/#' + task.socket_id
      , ret       = this.io.sockets.connected[socket_id]
      ;
      
    return ret;
  }
};

Relay.prototype.emit = function(doc, req, res) {
  var task = new Task(doc, req, res);

  this.__tasks[task.id] = task;

  Promise
    .promisify(task.load_cache_info, { context : task })()
    .bind(this)
    .then(function(cache_info){
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
    // todo [akamel] do we really need this?
    var ws = this.getSocketByTaskId(task.id);
    if (ws) {
      ws.emit('script-stdio', {
          type      : 'stdout'
        , text      : null
        // todo [akamel] not needed anymore
        , execution : { id : task.id }
      });
    }

    setTimeout(() => {
      delete this.__tasks[task.id];
    }, 500);
  });
};

Relay.prototype.getAgents = function() {
  return registry.get().findAll();
};

Relay.prototype.__tasks = {};

Relay.get = function() {
  return Relay.__instance;
}

module.exports = Relay;
