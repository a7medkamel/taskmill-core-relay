var http  = require('http')
  , _     = require('underscore')
  ;

var requests = {};

function handle(req, res, next) {
  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  this.socket.emit('request', data);
}

var count_req = 0;
var count_res = 0;

function relay_listen(options, cb) {

  function handleRequest(req, res){
    var match = /^\/(res|req)\/(.*)\/?$/.exec(req.url) || []
      , type  = match[1]
      , id    = match[2]
      , entry = id? requests[id] : undefined;
      ;

    if (entry) {
      switch(type) {
        case 'req':
        count_req++;
        res.on('finish', function(){
          count_req--;
        });
        res.on('close', function(){
          count_req--;
          console.log('delete: A');
          delete requests[id];
        });
        entry.req.pipe(res);
        break;
        case 'res':
        count_res++;

        console.log('delete: B');
        delete requests[id];
        entry.res.on('finish', function(){
          count_res--;
          res.end();
        });

        req.pipe(entry.res);
        break;
        default:
        console.error('whaaaat u want?');
      }
    } else {
      console.error('couldn\'t find entry');
      res.end();
    }
  }

  // setInterval(function(){ console.log({
  //   count_res : count_res,
  //   count_req : count_req
  // }); }, 500);

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

  req
    .on('close', function(){
      console.log('on-close, delete', data);
      res.end();
      console.log('delete: C');
      delete requests[data.id];
    })
    ;
}

module.exports = {
    handle        : handle
  , relay_listen  : relay_listen
  , relay_emit    : relay_emit
}