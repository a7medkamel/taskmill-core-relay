var util                = require('util')
  , _                   = require('underscore')
  , EventEmitter        = require('events').EventEmitter
  , dnode_stream        = require('dnode-http-stream')
  , uuid                = require('node-uuid')
  , pipe                = require('./pipe/index')
  ;

function Agent(client, options) {
  EventEmitter.call(this);

  this.id                 = uuid.v4();
  this.client             = client;
  this.name               = undefined; //set by heartbeat
  this.group              = undefined; //set by heartbeat
  this.info               = undefined; //set by heartbeat
  this.options            = options;
}

// util.inherits(Agent, EventEmitter);

Agent.prototype.handle = function(req, res, next) {
  // todo [akamel] handle possible error

  // todo [akamel] add urls for google files in execution result object
  var id            = req.task.id
    , dnode_req     = dnode_stream.writable(this.client)
    , dnode_res     = dnode_stream.readable()
    , dnode_stdout  = dnode_stream.readable()
    , dnode_stderr  = dnode_stream.readable()
    ;

  // todo [akamel] ordering here matters because we might not have registered req before data starts being sent
  req.pipe(dnode_req);

  var io = this.options.web_socket;

  dnode_res.pipe(pipe.response(id, { sink : res, io : io, createLogStream : this.options.createLogStream }));

  var stdout_rt = pipe.socket(id, { type : 'stdout', io : io });
  if (stdout_rt) {
    dnode_stdout.pipe(stdout_rt);
  }

  var stderr_rt = pipe.socket(id, { type : 'stderr', io : io });
  if (stderr_rt) {
    dnode_stderr.pipe(stderr_rt);
  }

  var stdout = pipe.log(id, { ext : 'stdout', createLogStream : this.options.createLogStream });
  if (stdout) {
    dnode_stdout.pipe(stdout);
  }

  var stderr = pipe.log(id, { ext : 'stderr', createLogStream : this.options.createLogStream });
  if (stderr) {
    dnode_stderr.pipe(stderr);
  }

  // todo [akamel] we are already parsing the manual, pass it along and save a parsing on the worker
  var req_options = _.pick(req, 'task', 'query', 'method', 'headers', 'url');

  req_options.headers = _.omit(req_options.headers, 'cookie');
  this.client.handle(
      dnode_req.toJSON(req_options)
    , dnode_res.toJSON({ stdout : dnode_stdout, stderr : dnode_stderr })
    , next
  );
};

module.exports = Agent;