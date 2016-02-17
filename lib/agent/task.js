var _               = require('underscore')
  , Promise         = require('bluebird')
  , onFinished      = require('on-finished')
  , babel           = require('babel-core')
  , rp              = require('request-promise')
  , request         = require('request')
  , onHeaders       = require('on-headers')
  , man             = require('taskmill-core-man')
  , http            = require('http')
  ;

var all = [];

function Task(doc, req, res) {
  this.id = doc.id;
  this.doc = doc;
  this.req = req;
  this.res = res;

  this.log        = !!req.headers['x-tm-log'];
  this.socket_id  = req.headers['x-tm-socket-id'];

  all[doc.id] = this;

  onFinished(res, () => { this.kill(); });

  onFinished(req, function(){
    req.removeAllListeners();

    delete all[doc.id];
  });

  // todo [akamel] do we need this in node 5.4 / latest?
  var es6 = babel.transform(this.doc.content); // => { code, map, ast }

  this.doc.content = es6.code;

  if (!_.isObject(this.doc.manual)) {
    this.doc.manual = man.get(es6);
  }

  res.set('x-tm-id', doc.id);

  // todo [akamel] why is this called $type?
  if (!_.isUndefined(this.doc.manual.type)) {
    res.set('$type', this.doc.manual.type);
  }

  // only cache if the user explicity set the Cache-Control header otherwise Cache-bust
  if (!req.get('Cache-Control')) {
    res.set('cache-control', 'no-cache');
  }

  var log_stream = undefined;
  if (this.log) {
    res.write = _.wrap(res.write, function(func) {
      var arg = _.rest(arguments);

      if (log_stream) {
        log_stream.write.apply(log_stream, arg);
      }
      return func.apply(res, arg);
    });

    res.end = _.wrap(res.end, function(func) {
      var arg = _.rest(arguments);

      if (log_stream) {
        log_stream.end.apply(log_stream, arg);
      }
      return func.apply(res, arg);
    });
  }

  var self = this;
  onHeaders(res, function(){
    var headers = res._headers;
    if (_.has(doc.manual, 'cache') && !_.has(headers, 'x-tm-cache-max-age')) {
      var cache = doc.manual.cache;
      if (_.isFinite(cache) && cache > 0) {
        this.setHeader('x-tm-cache-max-age', cache);
      }
    }

    if (_.has(headers, 'x-tm-cache-max-age')) {
      if (doc.cache_key) {
        this.setHeader('x-tm-cache-key', doc.cache_key);
      }
    }

    // cache_bust if response is error
    if (res.statusCode >= 400 && res.statusCode < 600) {
      this.setHeader('cache-control', 'no-cache');
    }

    this.removeHeader('set-cookie');
// console.log('headers from relay', headers['set-cookie'], headers['set-cookie'].length);
    // todo [akamel] cache headers are _not_ sent ot cache server / setHeader but headers used below
    if (self.log) {
      log_stream  = http.request({
                        method    : 'POST'
                      , protocol  : 'http' + ':'
                      , hostname  : 'localhost'
                      , port      : 8787
                      , headers   : headers
                      , path      : '/write/' + doc.id
                    });
    }
  });
}

Task.prototype.load_cache_info = function(cb) {
  var doc = this.doc;

  var p$cache = Promise.resolve({ cached : false });

  if (_.has(doc.manual, 'cache')) {
    var max_age = doc.manual.cache;
    if (_.isFinite(max_age) && max_age > 0) {
      // we accept cashed results; go get from logger
      p$cache = rp
                  .get('http://localhost:8787/cache/metadata/' + doc.cache_key + '/' + max_age)
                  .then(function(data){
                    return JSON.parse(data);
                  })
                  .then(function(cache){
                    cache.key = doc.cache_key;
                    return cache;
                  });
    }
  }

  p$cache.nodeify(cb);
};

Task.prototype.stream_from_cache = function(cache_info) {
  this.res.set(_.omit(cache_info.metadata, 'x-response-time'));
  this.res.set({
      'cache-control'   : 'no-cache'
    , 'x-tm-cache-age'  : cache_info.age
  });

  // todo [akamel] make this configurable
  request.get('http://localhost:8787/cache/read/' + cache_info.key).pipe(this.res);
};

Task.prototype.decline = function(err) {
  if (!onFinished.isFinished(this.res)) {
    this.res.set('cache-control', 'no-cache');
    // note [akamel] use .write + .end because .send causes an error in memory stream with write after end
    this.res.status(500).send(this.errorify(err));
    // this.res.status(500).write(JSON.stringify(this.errorify(err)));
    // this.res.end();
  } else {
    console.error('can\'t decline, res already ended');
  }
};

Task.prototype.errorify = function(err) {
  err = err || {};

  var ret = {
      type    : err.stack? 'exception' : 'notification'
    , error   : err.message
    // todo [akamel] should we expose this? its OSS anyway
    , stack   : err.stack
    , details : this.req.url
    , target  : 'taskmill-core-relay'
  };

  return ret;
};

Task.prototype.run = function(agent, cb) {
  this.agent = agent;

  this.agent.socket.emit('/run', this.doc, cb);
};

Task.prototype.kill = function(cb) {
  if (this.agent) {
    this.agent.socket.emit('/SIGKILL', { id : this.id }, cb);
  }
};

Task.getById = function(id) {
  return all[id];
};

module.exports = Task;