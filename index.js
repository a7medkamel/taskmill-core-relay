"use strict";

var Relay = require('./lib/relay');

function main(options) {
  options = options || {};

  let relay = new Relay(options);

  return relay
          .listen({ port : options.port })
          .return(relay);
}

function instance() {
  return Relay.get();
}

module.exports = {
    Relay     : Relay
  , instance  : instance
  , main      : main
};