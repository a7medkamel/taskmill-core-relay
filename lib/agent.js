"use strict";

var winston = require('winston');

class Agent {
  constructor(socket) {
    // ex: /#HnOCudy16YsOwLOOAAAA
    this.id       = socket.id;
    this.socket   = socket;
    this.info     = undefined; //set by heartbeat

    winston.info('agent connected', socket.id);

    socket.on('/ping', (info) => {
      if (!this.info) {
        winston.info('agent info', info);
      }

      this.info = info;
    });
  }
}

module.exports = Agent;