var Promise     = require('bluebird')
  , _           = require('underscore')
  , express     = require('express')
  , registry    = require('./registry')
  , dispatcher  = require('./dispatch')
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
    // count_req++;
    // res.on('finish', function(){
    //   count_req--;
    // });
    res.on('close', function(){
      // count_req--;
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
    // count_res++;
    delete requests[id];
    if (item.res) {
      item.res.on('finish', function(){
        // count_res--;
        res.end();
      });

      req.pipe(item.res);
    }

    req.pipe(pipe.log(id));

    // todo [akamel] if write to res is slow; we might not be truly done yet
    // todo [simplify this]
    socket.in(id).emit('script-stdio', {
        type      : 'stdout'
      , text      : null
      , execution : { id : id }
    });
  } else {
    next();
  }
});

function Relay(options) {
  // global scope instance
  socket = options.web_socket;

  // this.web_socket       = options.web_socket;
  this.public_group_id  = options.public_group_id;
}

Relay.prototype.listen = function(options, cb) {
  var me = this;

  Promise
    .promisify(registry.listen)({
        port              : options.port
      // , web_socket        : this.web_socket
      , default_group_id  : this.public_group_id
    })
    .then(function(registry){
      return Promise.promisify(dispatcher.listen)();
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

Relay.prototype.emit = function(data, req, res) {
  requests[data.id] = {
      req   : req
    , res   : res
  };

  req.on('close', function(){
    res.end();
    delete requests[data.id];
  });

  var instance = dispatcher.get();

  return instance.push.apply(instance, _.toArray(arguments));
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
