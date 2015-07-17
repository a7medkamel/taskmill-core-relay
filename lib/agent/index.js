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

  var agent = this;

  this.handle = function(req, res, next) {
    // todo [akamel] handle possible error

    // todo [akamel] add urls for google files in execution result object
    var id            = req.id
      , dnode_req     = dnode_stream.writable(client)
      , dnode_res     = dnode_stream.readable()
      , dnode_stdout  = dnode_stream.readable()
      , dnode_stderr  = dnode_stream.readable()
      ;

    // todo [akamel] ordering here matters because we might not have registered req before data starts being sent
    req.pipe(dnode_req);

    var io = this.options.socket_io || sails.io;

    dnode_res.pipe(pipe.response(id, { sink : res, io : io, createLogStream : options.createLogStream }));

    dnode_stdout.pipe(pipe.socket(id, { type : 'stdout', io : io }));
    dnode_stdout.pipe(pipe.log(id, { ext : 'stdout', createLogStream : options.createLogStream }));

    dnode_stderr.pipe(pipe.socket(id, { type : 'stderr', io : io }));
    dnode_stderr.pipe(pipe.log(id, { ext : 'stderr', createLogStream : options.createLogStream }));

    // todo [akamel] we are already parsing the manual, pass it along and save a parsing on the worker
    var req_options = _.pick(req, 'task', 'query', 'method', 'headers', 'url');
    this.client.handle(dnode_req.toJSON(req_options), dnode_res.toJSON({ stdout : dnode_stdout, stderr : dnode_stderr }), next);
  };
}

util.inherits(Agent, EventEmitter);

module.exports = Agent;