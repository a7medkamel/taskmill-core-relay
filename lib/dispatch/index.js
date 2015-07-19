var async           = require('async')
  , Promise         = require('bluebird')
  , MemoryStream    = require('memorystream')
  , _               = require('underscore')
  , pipe            = require('../agent/pipe')
  , registry        = require('../registry')
  , STATUS_CODES    = require('http').STATUS_CODES
  ;

function Dispatcher() {}

Dispatcher.prototype.initialize = function(cb) {
  _.defer(cb);

  this.pump();
};

Dispatcher.prototype.pump = function() {
  async.forever(function(next) {
    var top = this.queue.shift();
    if (top) {
      this.handle(top.req, top.res, function(err){
        this.handle_cb(err, top);
      }.bind(this));
    }

    // todo [akamel] this is pretty bad loop logic; find better more efficient way
    _.defer(next);
  }.bind(this));
};

Dispatcher.prototype.handle = function(req, res, next) {
  function end(err) {
    if (req) {
      req.removeAllListeners();
    }

    next(err);
  }

  var once_end = _.once(end);

  // todo [akamel] should we listen to req instead since it will never be udefined?
  if(req) {
    req
      .on('finish', once_end)
      .on('close', once_end)
      ;
  }

  registry.get().handle(req, res, once_end);
};

Dispatcher.prototype.handle_cb = function(err, item) {
  if (err) {
  //   if (item.tries < 5) {
  //     item.tries ++;
  //     // push at end of queue and retry
  //     this.queue.push(item);
  //   } else {
  //     this.reject(err, item)
  //   }
    this.reject(err, item);
  }
};

Dispatcher.prototype.reject = function(err, item) {
  // todo [akamel] sails.io is not defined...


  var res = pipe
              .response(item.id, { sink : item.res, io : sails.io })
              // todo [akamel] needs on data instead of devnull
              .on('data', function(){ })
              .on('end', function(){
                pipe.socket(item.id, { type : 'stdout', io : sails.io }).end();
              })
              ;

  // todo [akamel] refactor this
  res.writeHead = function(statusCode, reason, headers) {
    if (arguments.length == 2 && typeof arguments[1] !== 'string') {
      headers = reason;
      reason = undefined;
    }

    var status = 'HTTP/ ' + statusCode + ' ' + (reason || STATUS_CODES[statusCode] || 'unknown') + '\r\n';

    this.write(status);

    if (headers) {
      for (var name in headers) {
        this.write(name + ': ' + headers[name] + '\r\n');
      }
    }

    this.write('\r\n');
  };

  res.writeHead(403, undefined, {
    'content-type' : 'application/json'
  });

  res.write(JSON.stringify({
    '#system' : {
        type    : 'exception'
      , error   : err.message
      , details : item.req.url
    }
  }));
  res.end();
};

Dispatcher.prototype.queue = [];

Dispatcher.prototype.push = function(doc, req, res /* res | function */) {
  var next = function(){};

  if (_.isFunction(res)) {
    next = res;
    res = undefined;
  }

  req.session = undefined;

  // todo [akamel] handle case when no agents are connected
  // if (!this._ready) {
  //   next(new Error('dispatcher not ready'));

  //   // todo [akamel] make it alwayse take a cb and not a res
  //   if (res) {
  //     res.status(503).end();
  //   }

  //   return;
  // }

  // todo [akamel] limit number of workers tries
  // todo [akamel] read all the req in in case we are going to close it for $async / $editor
  p$res = !_.isUndefined(res)
            ? Promise.cast(req)
            : new Promise(function(resolve){
                // todo [akamel] if the body is ever parsed; this will never continue
                var memStream = new MemoryStream();

                _.extend(memStream, _.pick(req, 'headers', 'method', 'hostname', 'url', 'query'));
                // var buf = new stream_buffers.WritableStreamBuffer();
                req
                  .on('end', function(){
                    // var str = buf.getContentsAsString('utf8');

                    resolve(memStream);
                  })
                  .pipe(memStream)
                  ;
              });


  p$res
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

function listen(cb) {
  if (!singleton) {
    singleton = new Dispatcher();

    singleton.initialize(cb);
  } else {
    _.defer(cb, new Error('dispatcher already initialized'));
  }
}

module.exports = {
    listen  : listen
  , get     : function() { return singleton; }
};