var _               = require('underscore')
  , Promise         = require('bluebird')
  , onFinished      = require('on-finished')
  , babel           = require('babel-core')
  , rp              = require('request-promise')
  , request         = require('request')
  , onHeaders       = require('on-headers')
  , man             = require('taskmill-core-man')
  , http            = require('http')
  , parser          = require('parse-cache-control')
  , sha1            = require('sha1')
  ;

var all = [];

function Task(doc, req, res) {
  this.id = doc.id;
  this.doc = doc;
  this.req = req;
  this.res = res;

  this.socket_id  = req.headers['x-tm-socket-id'];

  this.etag = {
      code : undefined
    , type : undefined
  };

  this.cache = parser(req.get('cache-control')) || {};

  if (this.cache.private && this.cache.log) {
    this.etag = {
        code  : this.id
      , type  : 'instance'
    };
  } else if (req.method === 'GET') {
    this.etag = {
        code  : sha1(this.req.url)
      , type  : 'public'
    };
  }

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

  var s$cache = undefined;
  // if (this.log) {
  res.write = _.wrap(res.write, function(func) {
    var arg = _.rest(arguments);

    s$cache && s$cache.write.apply(s$cache, arg);
    return func.apply(res, arg);
  });

  res.end = _.wrap(res.end, function(func) {
    var arg = _.rest(arguments);

    s$cache && s$cache.end.apply(s$cache, arg);
    return func.apply(res, arg);
  });
  // }

  var self = this;
  onHeaders(res, function(){
    var headers = res._headers;

    // don't allow response to set cookie
    this.removeHeader('set-cookie');

    // set statusCode
    this.setHeader('x-tm-status-code', res.statusCode);

    if (self.etag.type === 'public') {
      // don't cache if:
      // 1- there is no cache header in response
      // 1- the header has Age [means it came from cache server]
      // 1- the max-age is <= 0
      // 1- the cache is marked private
      var cache           = parser(this.getHeader('cache-control')) || {}
        , max_age         = Math.max(cache['max-age'] || 0, 0)
        , is_public       = !!cache.public
        , is_from_cache   = !_.isUndefined(this.getHeader('Age'))
        , is_err          = res.statusCode >= 400 && res.statusCode < 600
        ;
      if (is_from_cache || !max_age || !is_public || is_err) {
        self.etag.code = undefined;
      }
    } else if (self.etag.type === 'instance') {
      this.setHeader('cache-control', 'private, log, max-age=120');
    }

    // cache_bust if err or no cache-control is set
    if (is_err || !self.cache) {
      this.setHeader('cache-control', 'no-cache');
    }

    if (self.etag.code) {
      s$cache  = http.request({
                        method    : 'POST'
                      , protocol  : 'http' + ':'
                      , hostname  : 'localhost'
                      , port      : 8787
                      , headers   : headers
                      , path      : '/write/' + self.etag.code
                    });
    }
  });
}

Task.prototype.try_cache = function(cb) {
  Promise
    .resolve(this.req.get('cache-control'))
    .then((cache_control) => {
      // todo [akamel] parse cache-control and look for Cache-Control:no-cache, no-store
      if (!this.cache['no-cache'] && this.etag.type === 'public') {
        return rp.get({ url : 'http://localhost:8787/metadata/' + this.etag.code, json : true });
      }

      throw new Error('no-cache');
    })
    .then((metadata) => {
      return { 
          metadata  : metadata
        , stream    : request.get('http://localhost:8787/read/' + this.etag.code)
      };
    })
    .catch((err) => {
      if (!err.statusCode) {
        console.error(err);
      }
      throw new Error('not found');
    })
    .nodeify(cb);
}

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