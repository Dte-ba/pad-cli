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
    .option('--host [host]')
    .option('--port [port]')
    .option('--username [username]')
    .option('--destination [destination]')
    .option('--source [source]')
    .option('--output [output]')
    .version('1.0.0')
    .description('Sync local repository to online repository')
    .action(function(args){

      var props = [
        {caption: 'Host', prop: 'host' },
        {caption: 'Username', prop: 'username' },
        {caption: 'Port (22)', prop: 'port' },
        {caption: 'Host Folder', prop: 'destination' },
        {caption: 'Source', prop: 'source' },
        {caption: 'Output', prop: 'output' },
      ];

      var defaults = {
        port: 22
      };

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

          function(cb){
            async.eachSeries(
              props,
              function(prop, icb){
                if (args[prop.prop]){
                  schema[prop.prop] = args[prop.prop];
                  return icb();
                }
                promptly.prompt(' '+prop.caption+': ', {default: defaults[prop.prop]}, function (err, value) {
                  schema[prop.prop] = value;
                  icb();
                });
              },
              function(err) {
                cb(err);
              }
            );
          },
          function(cb){
            promptly.password(' Password for '+schema.username+': ', function (err, pwd) {
                schema.pwd = pwd;
                cb();
            });
          },

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