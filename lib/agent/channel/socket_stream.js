var ss    = require('socket.io-stream')
  , _     = require('underscore')
  , pipe  = require('../pipe')
  ;

var requests = {};

function handle(req, res, next) {
  var ss$req = ss.createStream({ decodeStrings : false });
  var ss$res = ss.createStream({ decodeStrings : false });
  // todo [akamel] next is not supported in socket-stream

  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  ss(this.socket).emit('request', ss$req, ss$res, data);

  req.pipe(ss$req);
  ss$res.pipe(res);

  // pipe.response(req.task.id, {
  //     sink            : res
  //   , io              : this.options.web_socket
  //   , createLogStream : this.options.createLogStream
  // })
}

function relay_listen(options, cb) {
  cb();
}

function relay_emit(data, req, res) {

}

module.exports = {
    handle        : handle
  , relay_listen  : relay_listen
  , relay_emit    : relay_emit
}