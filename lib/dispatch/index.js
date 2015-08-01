var async           = require('async')
  , Promise         = require('bluebird')
  , MemoryStream    = require('memorystream')
  , _               = require('underscore')
  , pipe            = require('../agent/pipe')
  , registry        = require('../registry')
  , STATUS_CODES    = require('http').STATUS_CODES
  ;

function Dispatcher(relay) {
  this.relay = relay;
}

Dispatcher.prototype.start = function() {
  this.pump();
};

Dispatcher.prototype.pump = function() {
  async.forever(function(next) {
    var top = this.queue.shift();
    if (top) {
      this.handle(top.req, top.res, function(err){
        this.next(err, top);
      }.bind(this));
    }

    // todo [akamel] this is pretty bad loop logic; find better more efficient way
    _.delay(next, !top? 20 : 0);
  }.bind(this));
};

Dispatcher.prototype.handle = function(req, res, next) {
  function end(err) {
    // if (req) {
      req.removeAllListeners();
    // }

    // todo [akamel] maybe we should call next _if_ req was closed
    next(err, req);
  }

  var once_end = _.once(end);

  // todo [akamel] should we listen to req instead since it will never be udefined?
  // if(req) {
    req
      .on('finish', once_end)
      .on('close', once_end)
      ;
  // }

  registry.get().handle(req, res, once_end);
};

// todo [akamel] can this ever be called without an err?
Dispatcher.prototype.next = function(err, item) {
  var id = item.req.task.id;

  if (err) {
    this.relay.decline(err, item.req, item.res);
  }
};

Dispatcher.prototype.queue = [];

Dispatcher.prototype.push = function(doc, req, res /* res | function */) {
  var next = function(){};

  // if (_.isFunction(res)) {
  //   next = res;
  //   res = undefined;
  // }

  req.session = undefined;

  // todo [akamel] limit number of workers tries
  // todo [akamel] read all the req in in case we are going to close it for $async / $editor
  p$req = res || req.isSocket
            ? Promise.cast(req)
            : new Promise(function(resolve){
                // todo [akamel] if the body is ever parsed; this will never continue
                var memStream = new MemoryStream();

                _.extend(memStream, _.pick(req, 'headers', 'method', 'hostname', 'url', 'query'));
                // var buf = new stream_buffers.WritableStreamBuffer();
                req
                  .on('end', function(){
                    resolve(memStream);
                  })
                  .pipe(memStream)
                  ;
              });

  p$req
    .then(function(req){
      req.task = _.extend({}, doc, {
          tries : 0
      });

      this.queue.push({
          req : req
        , res : res
      });
    }.bind(this))
    .nodeify(next)
    ;
};

var singleton = undefined;

function listen(relay, cb) {
  if (!singleton) {
    singleton = new Dispatcher(relay);

    singleton.initialize(cb);
  } else {
    _.defer(cb, new Error('dispatcher already initialized'));
  }
}

module.exports = Dispatcher;