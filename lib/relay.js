var Promise               = require('bluebird')
  , _                     = require('underscore')
  , localtunnel_server    = require('localtunnel-server/server')
  , onFinished            = require('on-finished')
  , registry              = require('./registry')
  , Task                  = require('./agent/task')
  ;

function Relay(options) {
  // global scope instance
  // this.socket = options.web_socket;
  // todo [akamel] connect new socket if non passed in
  this.io = options.web_socket;

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
  return Promise
          .promisify(registry.listen)(this, {
              port              : options.port
          })
          .bind(this)
          .then(() => {
            // todo [akamel] put this in config
            // return Promise.promisify(app.listen, app)(8989);
            this.server = localtunnel_server({
                max_tcp_sockets : 1
              // todo [akamel] put this in config
            });

            this.server.on('new_client', (info) => {
              this.proxy(info);
            });

            // todo [akamel] put this in config
            return Promise.promisify(this.server.listen, { context : this.server })(8989);
          })
          .nodeify(cb);
};

Relay.prototype.getSocket = function() {
  return this.io;
};

Relay.prototype.getSocketByTaskId = function(id) {
  var task = this.__tasks[id];
  if (task && this.io) {
    // todo [akamel] not sure why /# is required now
    var socket_id = '/#' + task.socket_id
      , ret       = this.io.sockets.connected[socket_id]
      ;
      
    return ret;
  }
};

Relay.prototype.emit = function(doc, req, res) {
  var ar = registry.get();

  var task = new Task(doc, req, res);

  this.__tasks[task.id] = task;

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

    // todo [akamel] we have all in tasks why do we also have __tasks?
    setTimeout(() => {
      delete this.__tasks[task.id];
    }, 500);
  });

  // start task; but don't wait for it to return in emil call...
  Promise
    .promisify(task.try_cache, { context : task })()
    .then((result) => {
      // todo [akamel] race condition cache can delete while we are reading
      // todo [akamel] change cache-control here to account for time since caching...
      res.set(result.metadata.headers);
      result.stream.pipe(res);
    })
    .catch((err) => {
      // try running instead
      return Promise.promisify(ar.run, { context : ar })(task);
    })
    .catch((err) => {
      task.decline(err);
    });

  return task;
};

Relay.prototype.getAgents = function() {
  return registry.get().findAll();
};

Relay.prototype.__tasks = {};

Relay.get = function() {
  return Relay.__instance;
}

module.exports = Relay;
