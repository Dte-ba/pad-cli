'use strict';

var log = require('npmlog');
var osenv = require('osenv');
var fs = require('fs');
var path = require('path');

module.exports = function(program){
  var level = 'info';

  if (program.verbose === true){
    level = 'verbose';
  }

  if (process.env.NODE_ENV === 'develpment'){
   level = 'verbose'; 
  }

  var logfile = 'pad-cli.' + (new Date()).valueOf() + '.log';
  logfile = path.join(osenv.tmpdir(), logfile);

  log.level = level;
  log.enableColor();

  //console.log('log file on ', logfile);

  return log;
};