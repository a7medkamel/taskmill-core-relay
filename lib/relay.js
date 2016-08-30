"use strict";

var Promise               = require('bluebird')
  , _                     = require('underscore')
  , config                = require('config-url')
  , AgentRegistry         = require('./registry')
  , Task                  = require('./task')
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

  emit(doc, req, res) {
    var task = new Task(doc, req, res);

    // start task; but don't wait for it to return in emit call...
    req.profiler.done('relay.emit.rec');
    return Promise
            .promisify(task.try_cache, { context : task })()
            .then((result) => {
              req.profiler.done('relay.cache.hit');
              // todo [akamel] race condition cache can delete while we are reading
              // todo [akamel] change cache-control here to account for time since caching...
              res.set(result.metadata.headers);
              result.stream.pipe(res);
            })
            // try running if not cached
            .catch((err) => {
              req.profiler.done('relay.cache.miss');
              return Promise
                      .try(() => {
                        return this.agent_registry.findRunOn(task);
                      })
                      .then((agent) => {
                        if (!agent) {
                          throw new Error('no agents available');
                        }

                        req.profiler.done('relay.agent.found');
                        return task.runOn(agent);
                      });
            })
            .return(task)
            .catchThrow((err) => {
              task.decline(err);
            });
  }
}

module.exports = Relay;
