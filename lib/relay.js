var Promise     = require('bluebird')
  , _           = require('underscore')
  , express     = require('express')
  , crypto      = require('crypto')
  , rp          = require('request-promise')
  , request     = require('request')
  , registry    = require('./registry')
  , Dispatcher  = require('./dispatch')
  , pipe        = require('./agent/pipe')
  , app         = express()
  ;

var requests = {};
var socket = undefined;
var count_req = 0;
var count_res = 0;

app.all('/req/:id', function(req, res, next){
  var id    = req.params.id
    , item  = requests[id]
    ;

  if (item) {
    res.on('close', function(){
      delete requests[id];
    });

    res.set(item.req.headers);

    var tm_req = _.pick(item.req
                        , 'hostname'
                        , 'ip'
                        , 'ips'
                        , 'originalUrl'
                        , 'path'
                        , 'protocol'
                        , 'secure'
                        //
                        , 'url'
                      );

    res.set('x-tm-id', id);
    res.set('x-tm-req', JSON.stringify(tm_req));

    item.req.pipe(res);
  } else {
    next();
  }
});

app.post('/res/:id', function(req, res, next){
  var id    = req.params.id
    , item  = requests[id]
    ;

  if (item) {
    var waits = [];

    delete requests[id];
    if (item.res) {
      waits.push(new Promise(function(resolve, reject){
        item.res.on('finish', resolve);
        item.res.on('close', reject);
      }));

      var status = req.get('x-tm-statusCode');
      if (status) {
        item.res.status(status);
      }
      item.res.set(req.headers);
      req.pipe(item.res);
    }

    if (_.has(item.req.task.manual, 'cache') && !_.has(req.headers, 'x-tm-cache-max-age')) {
      var cache = item.req.task.manual.cache;
      if (_.isFinite(cache) && cache > 0) {
        req.headers['x-tm-cache-max-age'] = cache;
        // todo [akamel] add runas info to cachename to take into account vault/user data
        req.headers['x-tm-cache-key'] = crypto.createHash('md5').update(item.req.task.filename).digest('hex');
      }
    }

    var s$log = pipe.log(id, { headers : req.headers });
    waits.push(new Promise(function(resolve, reject){
      s$log.on('finish', resolve);
      s$log.on('error', reject);
    }));
    req.pipe(s$log);


    Promise
      .settle(waits)
      .finally(function(){
        res.end();

        // todo [simplify this]
        if (socket) {
          socket.in(id).emit('script-stdio', {
              type      : 'stdout'
            , text      : null
            , execution : { id : id }
          });
        }
      });
  } else {
    next();
  }
});

function Relay(options) {
  // global scope instance
  socket = options.web_socket;

  this.public_group_id  = options.public_group_id;
}

Relay.prototype.listen = function(options, cb) {
  var me = this;

  Promise
    .promisify(registry.listen)(me, {
        port              : options.port
      , default_group_id  : this.public_group_id
    })
    .bind(this)
    .then(function(registry){
      this.dispatcher = new Dispatcher(this);

      this.dispatcher.start();
    })
    .then(function(){
      Relay.list.push(me);
    })
    .then(function(){
      // todo [akamel] put this in config
      return Promise.promisify(app.listen, app)(8989);
    })
    .nodeify(cb);
};

Relay.prototype.getSocket = function() {
  return socket;
};

Relay.prototype.emit = function(data, req, res) {
  var p$cache = Promise.resolve({ cached : false });

  if (_.has(data.manual, 'cache')) {
    var cache = data.manual.cache;
    if (_.isFinite(cache) && cache > 0) {
      // we accept cashed results; go get from logger

      var key = crypto.createHash('md5').update(data.filename).digest('hex');
      p$cache = rp
                  .get('http://localhost:8787/cache/metadata/' + key + '/' + cache)
                  .then(function(data){
                    data = JSON.parse(data);
                    data.key = key;
                    return data;
                  });
    }
  }

  var args = arguments;

  p$cache
    .bind(this)
    .then(function(cache_info){
      // console.log('about to read from cache:', cache_info, cache_info.cached);
      if (cache_info.cached) {
        res.set(_.omit(cache_info.metadata, 'x-response-time'));
        res.set('x-tm-cache-age', cache_info.age);
        // todo [akamel] make this configurable
        request.get('http://localhost:8787/cache/read/' + cache_info.key).pipe(res);
      } else {
        requests[data.id] = {
            req   : req
          , res   : res
        };

        req.on('close', function(){
          res.end();
          delete requests[data.id];
        });

        this.dispatcher.push.apply(this.dispatcher, _.toArray(args));
      }
    })
    .catch(function(err){
      this.decline(err, req, res);
    });
};

Relay.prototype.decline = function(err, req, res) {
  var id = req.task? req.task.id : undefined;

  var err_obj = {
    '#system' : {
        type    : 'exception'
      , error   : err.message
      , details : req.url
    }
  }
  // todo [akamel] this should be moved to new response mechanics...
  if (res) {
    res.status(500).send(err_obj);
  }

  if (id) {
    pipe
      .log(id, { headers : { 'content-type' : 'application/json' } })
      .end(JSON.stringify(err_obj));

    var socket = this.getSocket();
    if (socket) {
      socket.in(id).emit('script-stdio', {
          type      : 'stdout'
        , text      : null
        , execution : { id : id }
      });
    }
  }
};

Relay.prototype.getAgents = function() {
  return registry.get().findAll();
};

Relay.list = [];

Relay.get = function() {
  return _.sample(Relay.list);
}

module.exports = Relay;
