'use strict';

var promptly = require('promptly');
var fs = require('fs-extra');
var path = require('path');
var async = require('async');

module.exports = function(program) {

  program
    .command('dist')
    .version('1.0.0')
    .description('Crear un nuevo release del PAD')
    .action(function(/* Args here */){
        
      var schema = {
        source: '',
        destination: '',
        distFolder: 'dist/',
        appFolder: 'app/',
      };

      async.waterfall([

        // get the host
        /*function(cb){
          promptly.prompt(' Source: ', function (err, value) {
              schema.source = value;
              cb();
          });
        },
        function(cb){
          promptly.prompt(' Destination: ', function (err, value) {
              schema.destination = value;
              cb();
          });
        },
        function(cb){
          promptly.prompt(' Dist folder ('+schema.distFolder+'): ', { default:schema.distFolder }, function (err, value) {
              schema.distFolder = value;
              cb();
          });
        },
        function(cb){
          promptly.prompt(' Nwjs folder ('+schema.appFolder+'): ', { default:schema.appFolder }, function (err, value) {
              schema.appFolder = value;
              cb();
          });
        },*/
        // create/clean destination
        function(cb){
          console.log(' Dist :: create/clean destination');
          if (!fs.existsSync(schema.destination)){
            fs.mkdirp(schema.destination, function(err){
              if (err){ return cb(err); }
              cb();
            });
          } else {
            fs.readdir(schema.destination, function(err, files){
              if (err){ 
                return cb(er);
              }
              if (files.length > 0) {
                promptly.confirm('Destination not empty, continue? [y/N]', { default: false }, function (err, value) {
                  if (value !== true) {
                    throw new Error('User abort');
                  }
                 
                 var toRemove = [ 
                  path.join(schema.destination, 'server'),
                  path.join(schema.destination, 'public'),
                  path.join(schema.destination, 'package.json'),
                  path.join(schema.destination, 'index.html'),
                  path.join(schema.destination, 'app.js'),
                  path.join(schema.destination, 'assets')
                 ];

                 async.each(toRemove, function(dir, fn) {
                    console.log('removing ', dir);
                    if (fs.existsSync(dir)){
                      fs.removeSync(dir);
                    }
                    fn();
                  }, function(err){
                    if (err){
                      return cb(err);
                    }
                    cb(null);
                 });
                  

                });
              } else {
                cb(null);
              }
            });
          }
        },
        // copy new files
        function(cb){
          console.log(' Dist :: copy new files');

          var toCopy = [ 
            { from: path.join(schema.distFolder, 'server'), to : './server' },
            { from: path.join(schema.distFolder, 'public'), to : './public' },
            { from: path.join(schema.appFolder, 'index.html'), to:'./index.html'},
            { from: path.join(schema.appFolder, 'app.js'), to:'./app.js'},
            { from: path.join(schema.appFolder, 'assets'), to:'./assets'}
           ];

           async.eachSeries(toCopy, function(file, fn){
              var from = path.join(schema.source, file.from);
              var to = path.join(schema.destination, file.from);
              if (file.to !== undefined) {
                to = path.join(schema.destination, file.to);
              }
              console.log('Dist :: copying %s -> %s', from, to);
              fs.copy(from, to, function(err){
                  if (err) { return cb(err); }
                  fn(err);
              });
          }, function(err){
            if (err) { return cb(err); }
            cb();
          });
        },
        // make package.json
        function(cb){
          console.log('Dist :: generating package.json');

          var json = {};

          var padJson = fs.readJsonSync(path.join(schema.source, 'package.json'));
          var nwJson = fs.readJsonSync(path.join(schema.source, schema.appFolder, 'package.json'));

          // from pad
          var propPad = [ 'name', 'version', 'dependencies'];
          var propNw = [ 'main', 'window'];
          
          propPad.forEach(function(key){ 
            json[key] = padJson[key]; 
          });

          propNw.forEach(function(key){ 
            json[key] = nwJson[key]; 
          });
          
          fs.writeJson( path.join(schema.destination, 'package.json'), json, function(err){
            if (err) { return cb(err); }
            cb(null);
          });
        }/*,
        function(cb){
          console.log('Dist :: executing npm install');
          var exec = require('child_process').exec;
          var child = exec(
            'npm install --prefix ' + schema.destination,
            function(err){
              if (err) { return cb(err); }
              cb(null);
            }
          ).stderr.pipe(process.stderr);
        }*/

        ], function(err){

          if (err){
            throw err;
          }

      });

    });
  
};
