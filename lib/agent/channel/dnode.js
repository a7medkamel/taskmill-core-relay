var ss    = require('socket.io-stream')
  , _     = require('underscore')
  ;

var requests = {};

function handle(req, res, next) {
//   // todo [akamel] handle possible error

//   var id            = req.task.id
//     , dnode_req     = dnode_stream.writable(this.client)
//     , dnode_res     = dnode_stream.readable()
//     , dnode_stdout  = dnode_stream.readable()
//     , dnode_stderr  = dnode_stream.readable()
//     ;

//   // todo [akamel] ordering here matters because we might not have registered req before data starts being sent
//   req.pipe(dnode_req);

//   var io = this.options.web_socket;

//   dnode_res.pipe(pipe.response(id, { sink : res, io : io, createLogStream : this.options.createLogStream }));

//   var stdout_rt = pipe.socket(id, { type : 'stdout', io : io });
//   if (stdout_rt) {
//     dnode_stdout.pipe(stdout_rt);
//   }

//   var stderr_rt = pipe.socket(id, { type : 'stderr', io : io });
//   if (stderr_rt) {
//     dnode_stderr.pipe(stderr_rt);
//   }

//   var stdout = pipe.log(id, { ext : 'stdout', createLogStream : this.options.createLogStream });
//   if (stdout) {
//     dnode_stdout.pipe(stdout);
//   }

//   var stderr = pipe.log(id, { ext : 'stderr', createLogStream : this.options.createLogStream });
//   if (stderr) {
//     dnode_stderr.pipe(stderr);
//   }

//   // todo [akamel] we are already parsing the manual, pass it along and save a parsing on the worker
//   var req_options = _.pick(req, 'task', 'query', 'method', 'headers', 'url');

//   req_options.headers = _.omit(req_options.headers, 'cookie');
//   this.client.handle(
//       dnode_req.toJSON(req_options)
//     , dnode_res.toJSON({ stdout : dnode_stdout, stderr : dnode_stderr })
//     , next
//   );
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