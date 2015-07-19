var util                = require('util')
  , _                   = require('underscore')
  // , EventEmitter        = require('events').EventEmitter
  // , dnode_stream        = require('dnode-http-stream')
  , uuid                = require('node-uuid')
  , pipe                = require('./pipe/index')
  , ss                  = require('socket.io-stream')
  ;

function Agent(socket, options) {
  // EventEmitter.call(this);

  this.id                 = uuid.v4();
  this.socket             = socket;
  this.name               = undefined; //set by heartbeat
  this.group              = undefined; //set by heartbeat
  this.info               = undefined; //set by heartbeat
  this.options            = options;
  // this.requests           = {}

  // ss(socket).on('req', function(stream, data) {
  //   var entry = this.requests[data.id];

  //   if (entry) {
  //     entry.req.pipe(stream);

  //     delete this.requests[data.id];
  //   } else {
  //     // todo [akamel] pipe error to stream...
  //     console.error('todo [akamel] pipe error to stream...');
  //   }
  // }.bind(this));

  // socket.on('next', function() {
  //   console.log('req', arguments);

  //   var entry = this.requests[data.id];

  //   entry.next.apply(this, _.toArray(arguments));

  //   delete this.requests[data.id];
  // }.bind(this));
}

// util.inherits(Agent, EventEmitter);

Agent.prototype.handle = function(req, res, next) {
  // this.requests[req.task.id] = {
  //     req   : req
  //   , res   : res
  //   , next  : next
  // };

  var ss$req = ss.createStream({ decodeStrings : false });
  var ss$res = ss.createStream({ decodeStrings : false });
  // todo [akamel] next is not supported in socket-stream

  var data = _.pick(req, 'task', 'headers', 'method', 'hostname', 'url', 'query');

  ss(this.socket).emit('request', ss$req, ss$res, data);
  req.pipe(ss$req);
  ss$res.pipe(pipe.response(req.task.id, {
      sink            : res
    , io              : this.options.web_socket
    , createLogStream : this.options.createLogStream
  }));

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
};

module.exports = Agent;