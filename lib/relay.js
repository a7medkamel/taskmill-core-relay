var Promise     = require('bluebird')
  , _           = require('underscore')
  , express     = require('express')
  , registry    = require('./registry')
  , Dispatcher  = require('./dispatch')
  , pipe        = require('./agent/pipe')
  , app         = express()
  ;

var requests = {};
var socket = undefined;
var count_req = 0;
var count_res = 0;

app.get('/req/:id', function(req, res, next){
  var id    = req.params.id
    , item  = requests[id]
    ;

  if (item) {
    res.on('close', function(){
      delete requests[id];
    });
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
    delete requests[id];
    if (item.res) {
      item.res.on('finish', function(){
        res.end();
      });

      var status = req.get('x-tm-statusCode');
      if (status) {
        item.res.status(status);
      }
      item.res.set(req.headers);
      req.pipe(item.res);
    }

    req.pipe(pipe.log(id, { headers : req.headers }));

    // todo [akamel] if write to res is slow; we might not be truly done yet
    // todo [simplify this]
    if (socket) {
      socket.in(id).emit('script-stdio', {
          type      : 'stdout'
        , text      : null
        , execution : { id : id }
      });
    }
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
}

Relay.prototype.getSocket = function() {
  return socket;
};

Relay.prototype.emit = function(data, req, res) {
  requests[data.id] = {
      req   : req
    , res   : res
  };

  req.on('close', function(){
    res.end();
    delete requests[data.id];
  });

  return this.dispatcher.push.apply(this.dispatcher, _.toArray(arguments));
}

Relay.prototype.getAgents = function() {
  var instance = registry.get();

  return instance.list;
}


Relay.list = [];

Relay.get = function() {
  return _.sample(Relay.list);
}

module.exports = Relay;
