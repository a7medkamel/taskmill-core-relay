"use strict";

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
  , randtoken       = require('rand-token')
  , urljoin         = require('url-join')
  , config          = require('config-url')
  , content_type    = require('content-type')
  , winston         = require('winston')
  ;

var all = [];

class Task {
  constructor(doc, req, res) {
    this.doc = doc;

    if (!_.has(this.doc, 'id')) {
      this.doc.id =  randtoken.generate(32, 'abcdefghijklnmopqrstuvwxyz1234567890');
    }

    this.id = doc.id;
    this.req = req;
    this.res = res;

    this.runon = req.get('Run-On');

    this.decline = _.once(this.decline);

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

      // this delay might be needed due to socket msg coming _after_ termination
      setTimeout(() => {
        // delete this.__tasks[task.id];
        delete all[doc.id];
      }, 500);
    });

    res.set('X-Request-Id', doc.id);

    var self = this;
    onHeaders(res, function(){
      self.on_headers(this);
    });

    // prepare the task for execution
    // note [akamel] -- can throw
    // todo [akamel] do we need this in node 5.4 / latest?
    var es6 = babel.transform(this.doc.blob); // => { code, map, ast }

    this.doc.blob = es6.code;

    if (!_.isObject(this.doc.manual)) {
      this.doc.manual = man.get(es6);
    }

    // todo [akamel] why is this called $type?
    if (!_.isUndefined(this.doc.manual.type)) {
      this.res.set('$type', this.doc.manual.type);
    }
  }

  on_headers(res) {
    this.req.profiler.done('relay.req.headers');
    let events        = this.req.profiler.events
      , timing_start  = _.first(events).time
      , timing        = _.chain(events)
                          .tail()
                          .map((t) => { 
                            return {
                                name : t.name
                              , span : t.time - timing_start
                            };
                          })
                          .value();

    winston.info('timing', timing);
    if (this.etag.type === 'instance') {
      res.setHeader('cache-control', 'private, log, max-age=120');
    }

    let is_err = res.statusCode >= 400 && res.statusCode < 600
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
  }

  try_cache(cb) {
    Promise
      .resolve(this.req.get('cache-control'))
      .then((cache_control) => {
        // todo [akamel] parse cache-control and look for Cache-Control:no-cache, no-store
        if (!this.cache['no-cache'] && this.etag.type === 'public') {
          return rp.get({ 
                      url     : urljoin(config.getUrl('log'), 'metadata', this.etag.code)
                    , json    : true
                    , timeout : 2 * 1000
                  });
        }

        throw new Error('no-cache');
      })
      .then((metadata) => {
        return { 
            metadata  : metadata
          , stream    : request.get(urljoin(config.getUrl('log'), 'read', this.etag.code))
        };
      })
      .catch((err) => {
        throw new Error('not found');
      })
      .nodeify(cb);
  }

  decline(err) {
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
      winston.error('can\'t decline, res already ended', err);
    }
  }

  errorify(err) {
    err = err || {};

    var ret = {
        type    : err.stack? 'exception' : 'notification'
      , message : err.message
      // todo [akamel] should we expose this? its OSS anyway
      , stack   : err.stack
      , details : this.req.url
      , target  : 'taskmill-core-relay'
    };

    return ret;
  }

  runOn(agent, cb) {
    // return Promise
    //         .fromCallback((cb) => {
    //           this.agent = agent;

    //           this.agent.socket.emit('/run', this.doc, cb);
    //         })
    //         .asCallback(cb);
    let url = agent.info.run_url;
    let stream = this.req.pipe(request({
        url     : url
      , headers : {
          // todo [akamel] rename foobar
          '__metadata' : JSON.stringify(this.doc)
      }
    }));

    stream.on('response', (response) => {
      if (this.etag.type === 'public') {
        // don't cache if:
        // 1- there is no cache header in res
        // 1- the header has Age [means it came from cache server]
        // 1- the max-age is <= 0
        // 1- the cache is marked private
        // var cache           = parser(res.getHeader('cache-control')) || {}
        var cache           = parser(response.headers['cache-control']) || {}
          , max_age         = Math.max(cache['max-age'] || 0, 0)
          , is_public       = !!cache.public
          , is_from_cache   = !_.isUndefined(response.headers['Age'])
          , is_err          = response.statusCode >= 400 && response.statusCode < 600
          ;
        if (is_from_cache || !max_age || !is_public || is_err) {
          this.etag.code = undefined;
        }
      }

      stream.pipe(this.res);
      if (this.etag.code) {
        let headers = _.defaults({ 'x-tm-status-code' : response.statusCode }, response.headers);

        // todo [akamel] refactor this block it's copy paste from on_header event
        //=>>>>>>>>>>>>>>>> start refactor todo
        if (this.etag.type === 'instance') {
          headers['cache-control'] = 'private, log, max-age=120';
        }

        // cache_bust if err or no cache-control is set
        if (is_err || !this.cache) {
          headers['cache-control'] = 'no-cache';
        }

        headers['Access-Control-Allow-Origin'] = '*';
        //=>>>>>>>>>>>>>>>> end refactor todo

        stream.pipe(request({
                            method    : 'POST'
                          , url       : urljoin(config.getUrl('log'), 'write', this.etag.code)
                          , headers   : headers
                        }));
      }
    })

  }

  kill(cb) {
    return Promise
            .fromCallback((cb) => {
              if (this.agent) {
                this.agent.socket.emit('/SIGKILL', { id : this.id }, cb);
              }
            })
            .asCallback(cb);
  }

  static getById(id) {
    return all[id];
  }
}

module.exports = Task;