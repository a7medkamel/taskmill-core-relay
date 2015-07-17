
var through = require('through2')
  ;

function spy(id, options) {
  function write(chunk, enc, cb) {
    var msg = {
        type      : options.type
      , text      : (new Buffer(chunk, enc)).toString()
      , execution : { id : id }
    };

    options.io.sockets.in(id).emit('script-stdio', msg);

    cb(null, chunk, enc);
  }

  function end(cb) {
    var msg = {
        type      : options.type
      , text      : null
      , execution : { id : id }
    };

    options.io.sockets.in(id).emit('script-stdio', msg);

    cb();
  }

  return through(write, end);
}


module.exports = {
  spy : spy
};