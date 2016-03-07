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
  , content_type    = require('content-type')
  ;

var all = [];

function Task(doc, req, res) {
  this.id = doc.id;
  this.doc = doc;
  this.req = req;
  this.res = res;

  this.decline = _.once(this.decline);

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

  res.set('x-tm-id', doc.id);

  res.write = _.wrap(res.write, function(func) {
    var arg = _.rest(arguments);

    // console.log('write', !!this.s$cache, arg[0]? arg[0].toString('utf-8') : undefined);
    this.s$cache && this.s$cache.write.apply(this.s$cache, arg);
    return func.apply(res, arg);
  }.bind(this));

  res.end = _.wrap(res.end, function(func) {
    var arg = _.rest(arguments);

    // console.log('end', !!this.s$cache, arg[0]? arg[0].toString('utf-8') : undefined);
    this.s$cache && this.s$cache.end.apply(this.s$cache, arg);
    return func.apply(res, arg);
  }.bind(this));

  var self = this;
  onHeaders(res, function(){
    self.on_headers(this);
  });
}

Task.prototype.on_headers = function(res) {
  if (this.etag.type === 'public') {
    // don't cache if:
    // 1- there is no cache header in res
    // 1- the header has Age [means it came from cache server]
    // 1- the max-age is <= 0
    // 1- the cache is marked private
    var cache           = parser(res.getHeader('cache-control')) || {}
      , max_age         = Math.max(cache['max-age'] || 0, 0)
      , is_public       = !!cache.public
      , is_from_cache   = !_.isUndefined(res.getHeader('Age'))
      , is_err          = res.statusCode >= 400 && res.statusCode < 600
      ;
    if (is_from_cache || !max_age || !is_public || is_err) {
      this.etag.code = undefined;
    }
  } else if (this.etag.type === 'instance') {
    res.setHeader('cache-control', 'private, log, max-age=120');
  }

  // cache_bust if err or no cache-control is set
  if (is_err || !this.cache) {
    res.setHeader('cache-control', 'no-cache');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  // set type on content-type
  // todo [akamel] if res has no content-type; we can't set the transform type in it [not valid syntax]
  // if (_.has(this.doc.manual, 'type')) {
  //   var ct = content_type.parse(res.getHeader('content-type'));

  //   ct.parameters['type'] = this.doc.manual.type;
  //   res.setHeader('content-type', content_type.format(ct));
  // }

  // don't allow res to set cookie
  res.removeHeader('set-cookie');

  if (this.etag.code) {
    // console.log('setting cache', res._headers);
    this.s$cache  = http.request({
                        method    : 'POST'
                      , protocol  : 'http' + ':'
                      , hostname  : 'localhost'
                      , port      : 8787
                      , headers   : _.defaults({ 'x-tm-status-code' : res.statusCode }, res._headers)
                      , path      : '/write/' + this.etag.code
                    });
  }
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
      throw new Error('not found');
    })
    .nodeify(cb);
}

Task.prototype.decline = function(err) {
  if (!onFinished.isFinished(this.res)) {
    this.res.set('cache-control', 'no-cache');
    // todo [akamel] for some reason .send doesn't seem to really work? try again later
    // this.res.status(500).send(this.errorify(err));
    this.res.status(500);
    this.res.set('content-type', 'application/json');
    // note [akamel] sometimes onHeaders is called after the first .write is.. we call write('') to force onHeader first
    this.res.write('');
    this.res.write(JSON.stringify(this.errorify(err)));
    this.res.end();
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

Task.prototype.prepare = function(agent, cb) {
  // note [akamel] -- can throw
  // todo [akamel] do we need this in node 5.4 / latest?
  var es6 = babel.transform(this.doc.content); // => { code, map, ast }

  this.doc.content = es6.code;

  if (!_.isObject(this.doc.manual)) {
    this.doc.manual = man.get(es6);
  }

  // todo [akamel] why is this called $type?
  if (!_.isUndefined(this.doc.manual.type)) {
    this.res.set('$type', this.doc.manual.type);
  }
}

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