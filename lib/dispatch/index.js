var async           = require('async')
  , Promise         = require('bluebird')
  , MemoryStream    = require('memorystream')
  , _               = require('underscore')
  , pipe            = require('../agent/pipe')
  , registry        = require('../agent/registry')
  , STATUS_CODES    = require('http').STATUS_CODES
  ;

function Dispatcher() {}

Dispatcher.prototype.initialize = function(cb) {
  var d = this;

  _.defer(cb);

  async.forever(
      function(next) {
        var top = d.queue.shift();
        if (top) {
          d.handle(top.req, top.res, function(err){
            if (err) {
              if (top.tries < 5) {
                top.tries ++;
                // push at end of queue and retry
                d.queue.push(top);
              } else {
                var res = pipe
                            .response(top.id, { sink : top.res, io : sails.io })
                            // todo [akamel] needs on data instead of devnull
                            .on('data', function(){ })
                            .on('end', function(){
                              pipe.socket(top.id, { type : 'stdout', io : sails.io }).end();
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
                    , error   : 'agent not available'
                    , details : top.req.url
                  }
                }));
                res.end();

              }
            }
          });
        }

        // todo [akamel] this is pretty bad loop logic; find better more efficient way
        setTimeout(next, 0);
      }
    , function(err) { console.error('dispatcher forever err', err); }
  );
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
      var item = {
          id    : doc.id
        // todo [akamel] why do we have both task and doc?
        , doc   : doc
        , req   : req
        , res   : res
        , tries : 0
      };

      req.task = doc;
      req.id = doc.id;

      this.queue.push(item);
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