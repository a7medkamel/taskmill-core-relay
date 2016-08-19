"use strict";

// localtunnel-server needs babel
require('babel-register')({
  // 'presets': ['es2015']
  only: /localtunnel-server/
});

var Promise               = require('bluebird')
  , _                     = require('underscore')
  , localtunnel_server    = require('localtunnel-server/server')
  , config                = require('config-url')
  , AgentRegistry         = require('./registry')
  , Task                  = require('./agent/task')
  // , socket_io             = require('socket.io')
  // , weighted              = require('weighted')
  ;

class Relay {
  constructor() {
    this.agent_registry = new AgentRegistry();
  }

  proxy(info) {
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

  listen(cb) {
    return Promise
            .try(() => {
              this.server = localtunnel_server({
                // todo [akamel] put this in config
                  max_tcp_sockets : 1
              });

              this.server.on('new_client', (info) => {
                this.proxy(info);
              });

              return Promise.promisify(this.server.listen, { context : this.server })(config.getUrlObject('tunnel').port);
            })
            .nodeify(cb);
  }

  emit(doc, req, res) {
    var task = new Task(doc, req, res);

    // start task; but don't wait for it to return in emit call...
    Promise
      .promisify(task.try_cache, { context : task })()
      .then((result) => {
        // todo [akamel] race condition cache can delete while we are reading
        // todo [akamel] change cache-control here to account for time since caching...
        res.set(result.metadata.headers);
        result.stream.pipe(res);
      })
      // try running if not cached
      .catch((err) => {
        return Promise
                .try(() => {
                  task.prepare();
                })
                .then(() => {
                  return this.agent_registry.findRunOn(task);
                })
                .then((agent) => {
                  if (!agent) {
                    throw new Error('no agents available');
                  }

                  return agent.run(task);
                });
      })
      .catch((err) => {
        task.decline(err);
      });

    return task;
  }
}

module.exports = Relay;
