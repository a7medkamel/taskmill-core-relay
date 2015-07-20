
var through             = require('through2')
  , parse               = require('parse-header-stream')
  ;

var header_map = {
    'content-type'      : 'contentType'
  , 'content-encoding'  : 'contentEncoding'
  , 'connection'        : false
};

function spy(id, options) {
  var name        = id + '.res'
    , file_op     = {
        cacheControl  : 'public, max-age=604800' // week
      , metadata      : { }
    }
    , file        = undefined
    , sink        = options.sink
    , stream      = parse();
    ;

  stream.on('http', function(data){
    file_op.metadata['$status-code'] = data.code;
    file_op.metadata['$status-text'] = data.text;
  });

  stream.on('header', function(key, value){
    var key_lower = key.toLowerCase()
      , ret       = header_map[key.toLowerCase()]
      ;

    if (ret) {
      file_op[ret] = value;
    }

    file_op.metadata[key] = value;

    if (sink && sink.setHeader && ret != false) {
      sink.setHeader(key, value);
    }

    if (key_lower == 'content-type') {
      // todo [akamel] coupling between stdio and other script info
      var msg = {
          type      : 'content-type'
        , text      : value
        , execution : { id : id }
      };

      options.io && options.io.sockets.in(id).emit('script-stdio', msg);
    }
  });

  stream.on('body', function(stream) {
    if (sink) {
      stream.pipe(sink);
    }

    if (!file && options.createLogStream) {
      file = options.createLogStream(name, { metadata : file_op, resumable : false });
    }

    if (file) {
      stream.pipe(file);
    }
  });

  function write(chunk, enc, cb) {
    stream.write(chunk, enc);
    cb(null, chunk);
  }

  function end(cb) {
    stream.end();

    cb();
  }

  return through(write, end);
}

module.exports = {
  spy : spy
};