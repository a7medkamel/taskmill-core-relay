var http = require('http');

function spy(id, options) {
  // todo [akamel] make all this configurable
  return http.request({
      hostname  : 'localhost'
    , port      : 8787
    , protocol  : 'http' + ':'
    , method    : 'POST'
    , headers   : options.headers
    , path      : '/write/' + id
  });
}

module.exports = {
  spy : spy
};