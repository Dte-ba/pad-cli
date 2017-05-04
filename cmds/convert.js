'use strict';

var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var _ = require('lodash');
var EpmFile = require('epm-file');

module.exports = function(program) {

  var log = require('../lib/log')(program);

  program
    .command('convert [source] [output]')
    .description('Convierte un paquete de contenido .zip al formato SEP')
    .action(function(source, output, args) {
      console.log(source, output);
    });
  
};