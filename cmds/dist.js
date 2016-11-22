'use strict';

var promptly = require('promptly');
var fs = require('fs-extra');
var path = require('path');
var async = require('async');

var _cwd;

module.exports = function(program) {

  program
    .command('dist')
    .option('--source [source]', 'The source folder')
    .option('--destination [destination]', 'The destination folder')
    .option('--output [output]', 'The output binary folder')
    .option('--dist [dist]', 'The folder inside of the source with the compiled app')
    .option('--app [app]', 'The folder inside of the source with the nw app')
    .version('1.0.0')
    .description('Crear un nuevo release del PAD')
    .action(function(args){
        
      var schema = {
        source: '',
        destination: '',
        outputFolder: '',
        distFolder: 'dist/',
        appFolder: 'app/',
      };

      async.waterfall([
        
        // get the host
        function(cb){
          if (args.source){
            schema.source = args.source;
            console.log(' Source: '+args.source);
            cb();
            return;
          }
          promptly.prompt(' Source: ', function (err, value) {
              schema.source = value;
              cb();
          });
        },
        function(cb){
          if (args.destination){
            schema.destination = args.destination;
            console.log(' Destination: '+args.destination);
            cb();
            return;
          }
          promptly.prompt(' Destination: ', function (err, value) {
              schema.destination = value;
              cb();
          });
        },
        function(cb){
          if (args.output){
            schema.outputFolder = args.output;
            console.log(' Output: '+args.output);
            cb();
            return;
          }
          promptly.prompt(' Output: ', function (err, value) {
              schema.outputFolder = value;
              cb();
          });
        },
        function(cb){
          if (args.dist){
            schema.distFolder = args.dist;
            console.log(' Dist folder: '+args.dist);
            cb();
            return;
          }
          promptly.prompt(' Dist folder ('+schema.distFolder+'): ', { default:schema.distFolder }, function (err, value) {
              schema.distFolder = value;
              cb();
          });
        },
        function(cb){
           if (args.app){
            schema.appFolder = args.app;
            console.log(' Nwjs folder: '+args.app);
            cb();
            return;
          }
          promptly.prompt(' Nwjs folder ('+schema.appFolder+'): ', { default:schema.appFolder }, function (err, value) {
              schema.appFolder = value;
              cb();
          });
        },
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
            { from: path.join(schema.distFolder, 'client'), to : './client' },
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
          var propNw = [ 'main', 'window', 'chromium-args'];
          
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
        },
        function(cb){
          var npmcommand = 'npm install --production --prefix '+schema.destination;
          console.log('Dist :: '+npmcommand);

          var exec = require('child_process').exec,
              child;

           child = exec(npmcommand,
           function (err, stdout, stderr) {
               if (err) { return cb(err); }
               cb(null);
           });
        },
        function(cb){
          console.log('Dist :: make to production');
          
          var appfile = path.join(schema.destination, 'app.js');

          var fs = require('fs');

          fs.readFile(appfile, 'utf-8', function(err, data){
              if (err) throw err;

              data = "process.env.NODE_ENV = 'production';\n" + data;

              fs.writeFile(appfile, data, cb)
          });
        },
        function(cb){
          var NwBuilder = require('nw-builder');
          var nw = new NwBuilder({
              files: schema.destination + '/**/**', // use the glob format
              buildDir: schema.outputFolder,
              platforms: ['win32', 'linux32', 'win64', 'linux64']
          });

          nw.on('log',  console.log);

          // Build returns a promise
          nw.build().then(function () {
             cb(null);
          }).catch(function (error) {
             cb(error);
          });
        }
        ], function(err){

          if (err){
            throw err;
          }

      });

    });
  
};
