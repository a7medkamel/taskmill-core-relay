"use strict";

var Promise     = require('bluebird')
  , _           = require('underscore')
  , Agent       = require('./agent')
  , socket_io   = require('socket.io')
  , weighted    = require('weighted')
  , config      = require('config-url')
  , winston     = require('winston')
  ;

class AgentRegistry {
  constructor() {
    this.io = socket_io(config.getUrlObject('relay').port, { httpCompression : true });

    // todo [akamel] cleanup on disconnect
    this.io.on('connection', (socket) => {
      socket.__obj = new Agent(socket);
    });
  }

  find(query) {
    var connected = this.io.of('/').connected;

    return _
            .chain(connected)
            .map((i) => i.__obj)
            .filter(query)
            .value();
  }

  findRunOn(task) {
    var runon = task.runon || config.get('agent.group-id')

    // todo [akamel] cache group_id
    var options = this.find((i) => { return i.info.group === runon; });

    if (_.size(options)) {
      var weights = _.map(options, function(i){
        // return Math.pow(1 - usage, 6);
        return i.info.freemem / i.info.totalmem;
      });

      return weighted.select(options, weights);
    }

    return undefined;
  }
}

module.exports = AgentRegistry;