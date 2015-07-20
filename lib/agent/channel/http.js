var http  = require('http')
  , _     = require('underscore')
  ;

var requests = {};

function handle(req, res, next) {
  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  this.socket.emit('request', data);
}

function relay_listen(options, cb) {

  function handleRequest(req, res){
    var match = undefined;
    if (match = /^\/req\/(.*)$/.exec(req.url)) {
      var id = match[1];
      var entry = requests[id];
      if (entry) {
        entry.req.pipe(res);
      }
    } else if (match = /^\/res\/(.*)$/.exec(req.url)) {
      var id = match[1];
      var entry = requests[id];
      if (entry) {
        req.pipe(entry.res);
        delete requests[id];
      }
    } else {
      console.error('whaaaat u want?');
    }
  }

  var server = http.createServer(handleRequest);
  server.listen(8989, function(){
      console.log("Relay listening on: http://localhost:%s", 8989);

      cb();
  });
}

function relay_emit(data, req, res) {
  requests[data.id] = {
      req   : req
    , res   : res
    // , next  : next
  };
}

module.exports = {
    handle        : handle
  , relay_listen  : relay_listen
  , relay_emit    : relay_emit
}