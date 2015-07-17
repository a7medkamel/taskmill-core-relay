var _   = require('underscore')
  , spy = require('through2-spy')
  ;

function main() {
  return spy(function(chunk, enc){
    if (_.isUndefined(chunk) || _.isNull(chunk)) {
      console.log('spy: ', 'null');
    }
    console.log('spy: ', (new Buffer(chunk, enc)).toString());
  });
}

module.exports = {
  spy : main
};