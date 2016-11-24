'use strict';

var path = require('path');
var fs = require('fs-extra');
var chalk = require('chalk');
var async = require('async');
var semver = require('semver');
var gittags = require('git-tags');
var _ = require('lodash');
var exec = require('child_process').exec;

module.exports = function(program) {

  var log = require('../lib/log')(program);

	program
		.command('release [folder]')
    .option('-o, --output [dir]', 'Directorio destino (git)')
		.option('-b, --beta', 'Define si el release es BETA')
    .option('--push', 'Ejecuta git push origin master al finalizar')
    .option('--verbose', 'Muestra mas información de lo que se esta haciendo')
    .description('Crear un nuevo release del PAD')
		.action(function(folder, args){

      if (args.verbose === true){
        log.level = 'verbose';
      }

      if (typeof args.output === 'undefined') {
         log.error('', 'output no ha sido definido');
         return process.exit(1);
      }

      if (!folder){
        folder = process.cwd();
      }

      var source = path.resolve(folder);
      var output = path.resolve(args.output);

      var distFolder = path.join(folder, '/dist');
      var appFolder = path.join(folder, '/app');

			log.verbose('source directory', source);
      log.verbose('output directory', output);
      log.verbose('build directory', distFolder);
      log.verbose('nw app directory', appFolder);

      async.waterfall([
        // :: version
        function(cb){
          var pkg = require(path.join(source, 'package.json'));
          var version = pkg.version;

          var candidate = 'v' + version;

          if (args.beta){
            candidate += '-beta';
          }

          log.info('::', chalk.bold.green('release candidate ' + candidate));
          cb(null, candidate, version)
        },
        // :: check version
        function(candidate, version, cb){
          log.verbose('::', 'chequeando versión');
          
          gittags.get(output, function(err, tags) {
            if (err){
              return cb(err);
            }
            
            var et = _.find(tags, function(t){
              return t.indexOf(version) !== -1;
            });

            if (et){
              return cb(new Error(chalk.bold.red('ya existe un release con esta versión, ' + et)));
            }

            cb(null, candidate);
          });
        },
        // :: clean the output folder
        function(candidate, cb){
          log.info('::', 'creando release ' + candidate);
          log.verbose('clean', 'limpiando el directorio ' + output);

          var toRemove = [ 
            path.join(output, 'app.js'),
            path.join(output, 'assets'),
            path.join(output, 'client'),
            path.join(output, 'index.html'),
            path.join(output, 'package.json'),
            path.join(output, 'server'),
          ];

          async.each(toRemove, function(dir, fn) {
              if (fs.existsSync(dir)){
                log.silly('clean', 'eliminando '+dir);
                fs.removeSync(dir);
              }
              fn();
            }, function(err){
              if (err){
                return cb(err);
              }
              cb(null, candidate);
           });
        },
        // :: copy into the output folder
        function(candidate, cb){
          log.verbose('copy', 'preparando para copiar');

          var toCopy = [ 
            { 
              from: path.join(distFolder, 'server'), 
                to: path.join(output, '/server')
            },
            { 
              from: path.join(distFolder, 'client'), 
                to: path.join(output, '/client' )
            },
            { 
              from: path.join(appFolder, 'index.html'),
                to: path.join(output, '/index.html')
            },
            { 
              from: path.join(appFolder, 'app.js'),
                to: path.join(output, '/app.js')
            },
            { 
              from: path.join(appFolder, 'assets'), 
                to: path.join(output, '/assets')
            }
         ];

         async.eachSeries(toCopy, function(file, fn){
            
            var mf = file.from.replace(source, '${source}');
            var mt = file.to.replace(output, '${output}');

            log.verbose('copy', mf + chalk.gray(' -> ') + mt);

            fs.copy(file.from, file.to, function(err){
              if (err) { 
                return cb(err); 
              }
              fn(err);
            });
          }, function(err){
            if (err) { 
              return cb(err); 
            }
            cb(null, candidate);
          });
        },
        // :: create package into the output folder
        function(candidate, cb){
          log.info('pkg', 'generando package.json');

          var json = {};

          var padJson = fs.readJsonSync(path.join(source, 'package.json'));
          var nwJson = fs.readJsonSync(path.join(appFolder, 'package.json'));

          // from pad
          var propPad = [ 'name', 'version', 'dependencies'];
          var propNw = [ 'main', 'window', 'chromium-args'];
          
          propPad.forEach(function(key){ 
            json[key] = padJson[key]; 
          });

          propNw.forEach(function(key){ 
            json[key] = nwJson[key]; 
          });
          
          json['padversion'] = candidate;

          fs.writeJson( path.join(output, 'package.json'), json, function(err){
            if (err) { 
              return cb(err); 
            }
            cb(null, candidate);
          });
        },
        // :: changing production
        function(candidate, cb){
          log.verbose('::', 'cambiando NODE_ENV -> production');
          var app = path.join(output, 'app.js');

          var data = fs.readFileSync(app, 'utf-8');

          var lineFrom = 'process.env.NODE_ENV = process.env.NODE_ENV || \'development\';';
          var lineTo = 'process.env.NODE_ENV = \'production\';';

          data = data.replace(lineFrom, lineTo);

          fs.writeFileSync(app, data);
          cb(null, candidate);
        },
        // :: create package into the output folder
        function(candidate, cb){
          log.info('::', 'release '+candidate +' creado');
          log.info('::', 'commiteando cambios');

          var execute = function(cmd, callback){
            exec(cmd, { cwd: output }, callback);
          };

          async.waterfall([
            function(fn){
              var cmd = 'git add --all .';
              log.verbose('git', cmd);

              execute(cmd, function(err, stdout, stderr) {
                if (err) return fn(err);
                return fn(null);
              });
            },
            function(fn){
              var cmd = 'git commit -m "release ' + candidate + '"';
              log.verbose('git', cmd);

              execute(cmd, function(err, stdout, stderr) {
                if (err) return fn(err);
                return fn(null);
              });
            },
            function(fn){
              var cmd = 'git tag ' + candidate;
              log.verbose('git', cmd);

              execute(cmd, function(err, stdout, stderr) {
                if (err) return fn(err);
                return fn(null);
              });
            },
            function(fn){
              if (args.push !== true){
                return fn(null);
              }
              var cmd = 'git push origin master --tags';
              log.verbose('git', cmd);

              execute(cmd, function(err, stdout, stderr) {
                if (err) return fn(err);
                return fn(null);
              });
            }
          ], function(err){
            if (err){
              return cb(err);
            }
            cb(null);
          });
        },
        function(cb){
          if (args.push !== true){
            log.info('git', chalk.bold.green('ahora puedes subir los cambios al repo remoto'));
          }

          console.log('');
          console.log(chalk.bold.blue('Bye ;)'));
        }

      ], function(err){
        if (err){
          log.error('', err.message);
          return process.exit(1);
        }

        process.exit(0);
      });

    });
	
};