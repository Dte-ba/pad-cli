/* release commander component
 * To use add require('../cmds/release.js')(program) to your commander.js based node executable before program.parse
 */
'use strict';

var promptly = require('promptly');
var async = require('async');
var Client = require('ssh2').Client;

var SyncManager = require('../lib/sync.js');

module.exports = function(program) {

  program
    .command('sync')
    .version('1.0.0')
    .description('Sync local repository to online repository')
    .action(function(){
      var schema = {
        host: '',
        username: '',
        pwd: '',
        port: 22,
        destination: '',
        source: '',
        output: ''
      };

      async.waterfall([

        // get the host
        function(cb){
          promptly.prompt(' Host: ', function (err, value) {
              schema.host = value;
              cb();
          });
        },
        // get the host
        function(cb){
          promptly.prompt(' Port (22): ', {default: 22}, function (err, value) {
              schema.port = schema.port;
              cb();
          });
        },
        // get the username
        function(cb){
          promptly.prompt(' Username: ', function (err, value) {
              schema.username = value;
              cb();
          });
        },
        // get the password
        function(cb){
          promptly.password(' Pwd: ', function (err, pwd) {
              schema.pwd = pwd;
              cb();
          });
        },
        // get the remote source
        function(cb){
          promptly.prompt(' Destination: ', function (err, value) {
              schema.destination = value;
              cb();
          });
        },
        // get the local source
        function(cb){
          promptly.prompt(' Source: ', function (err, value) {
              schema.source = value;
              cb();
          });
        },
        // get the output
        function(cb){
          promptly.prompt(' Output: ', function (err, value) {
              schema.output = value;
              cb();
          });
        }

        ], function(err){

          var sm = new SyncManager(schema);

          sm.load(function(err){
            if (err){
              throw err;
            }

            sm.generate(schema.output, function(){
              if (err){
                throw err;
              }
            });

          });

      });

    });
  
};