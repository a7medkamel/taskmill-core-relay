
function spy(id, options) {
  var name = id + '.' + options.ext;

  return options.createLogStream(name, {
      resumable : false
    , metadata : {
          contentType   : options.contentType || 'text/plain'
        , cacheControl  : 'public, max-age=604800' // week
        , metadata      : { }
      }
  });
}

module.exports = {
  spy : spy
};