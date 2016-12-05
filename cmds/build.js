'use strict';

var path = require('path');
var fs = require('fs-extra');
var chalk = require('chalk');
var async = require('async');
var semver = require('semver');
var request = require('request');
var _ = require('lodash');
var exec = require('child_process').exec;
var inquirer = require("inquirer");
var ProgressBar = require('progress');
var got = require('gh-got');
var targz = require('tar.gz');
var osenv = require('osenv');
var os = require('os');

module.exports = function(program) {

  var log = require('../lib/log')(program);

  var repoUri = 'https://api.github.com/repos/Dte-ba/pad-release/tags';

  var getTags = function(uri, cb){
    
    log.verbose('gh', 'fetching ' + repoUri);

    got(uri, {
      json: true,
      headers: {
        'accept': 'application/vnd.github.v3+json'
      }
    })
    .then(function(res){
      cb(null, res.body);
    })
    .catch(function(err){
      cb(err);
    });
  };

  program
    .command('build')
    .option('-o, --output [dir]', 'Directorio destino (si no usa el el directorio actual)', process.cwd())
    .option('-b, --beta', 'Tiene en cuenta versiones BETA')
    .option('-s, --latest', 'Compila la ultima versión')
    .option('-l, --list', 'Lista las versiones actuales')
    .option('--force', 'Force to download')
    .option('--verbose', 'Muestra más información de lo que se esta haciendo')
    .description('Crea un portable del PAD')
    .action(function(args){

      if (args.verbose === true){
        log.level = 'verbose';
      }

      var output = path.resolve(args.output);
      var cache = path.join(output, 'cache');

      log.verbose('output folder', output);
      log.verbose('cache folder', cache);

      log.verbose('cache folder', 'creating');

      fs.mkdirsSync(cache);

      if (args.list === true){

        getTags(repoUri, function(err, tags){
          if (err){
            return log.error('::', err.message);
          }

          var regex =  /^v?(?:(\d+)\.)?(?:(\d+)\.)?(\*|\d+)(\-beta)?$/i;
          var releases = _.filter(tags, function(r){
            return regex.test(r.name);
          });

          var regexBeta =  /\-beta?$/i;

          // filter betas
          if (args.beta !== true){
            releases = _.filter(releases, function(r){
              return !regexBeta.test(r.name);
            });
          }

          _.each(releases, function(r){
            console.log(chalk.bold.green(r.name));
          });

        });
        
        return;
      }

      async.waterfall([
        // :: get releases
        function(cb){
          getTags(repoUri, function(err, tags){
            if (err){
              return cb(err);
            }

            var regex =  /^v?(?:(\d+)\.)?(?:(\d+)\.)?(\*|\d+)(\-beta)?$/i;
            var releases = _.filter(tags, function(r){
              return regex.test(r.name);
            });

            var regexBeta =  /\-beta?$/i;

            // filter betas
            if (args.beta !== true){
              releases = _.filter(releases, function(r){
                return !regexBeta.test(r.name);
              });
            }

            cb(null, releases);

          });
        },
        // :: Select the version
        function(releases, cb){
          var tags = _.map(releases, 'name');
          if (!args.latest){
            inquirer.prompt([
              {
                type: "list",
                name: "version",
                message: "Versión?",
                choices: tags
              }
              ]).then(function( answers ) {
                var release = _.find(releases, function(r){
                  return r.name = answers.version;
                });

                cb(null, release);
              }).catch(function(err){
                cb(err);
              });
          } else {
            var release = _.first(releases);
            cb(null, release)
          }
        },
        // :: download
        function(release,  cb){
          log.info('::', chalk.bold.green('creando build ' + release.name));

          var filename = path.join(cache, release.name + '.tar.gz');

          if (fs.existsSync(filename)){
            log.verbose('::', 'file exists');
            if (args.force === true){
              fs.removeSync(filename);
            } else {
              log.info('::', 'file exists, use --force to replace');
              return cb(null, release, filename);
            }
          }

          log.verbose('::', 'downloading ' + release.tarball_url);

          got.stream(release.tarball_url)
             .on('response', function(res) {

                var len = parseInt(res.headers['content-length'], 10);
                
                var bar = {};

                try {
                  bar = new ProgressBar('[pad-'+release.name+'] [:bar] :percent', {
                    complete: '=',
                    incomplete: ' ',
                    width: 20,
                    total: len
                  });
                } catch(err){
                  log.verbose('::', 'failing to make progress-bar');
                }
                
                res.on('data', function (chunk) {
                  if (bar){
                    bar.tick(chunk.length);
                  }
                });
               
                res.on('end', function () {
                  console.log('');
                  cb(null, release, filename);
                  log.verbose('::', 'saved on ' + filename);
                });

             })
             .on('error', function(err){
               cb(err);
             })
             .pipe(fs.createWriteStream(filename));

        },
        function(release, filename, cb){
          log.verbose('::', 'extracting ' + filename);
          var extpath = path.join(osenv.tmpdir(), 'pad-'+release.name);

          targz().extract(filename, extpath, function(err){
            if(err){
              return cb(err);
            }
           
            cb(null, release, extpath);
          });

        },
        function(release, extpath, cb){

          var shortsha = release.commit.sha.substring(0, 7);
          var foname = 'Dte-ba-pad-release-' + shortsha;

          var fullname = path.join(extpath, foname);

          if (fs.existsSync(fullname)){
            log.verbose('::', 'files on ' + fullname);
          }

          var to = path.join(cache, release.name);

          if (fs.existsSync(to)){
            log.verbose('::', 'folder exists');
            return cb(null, release, to);
          }

          fs.copy(fullname, to, function (err) {
            if (err) {
              return cb(err);
            }
            
            cb(null, release, to);
          });
        },
        function(release, appFolder, cb){
          var npmcommand = 'npm install --production --prefix '+ appFolder;
          log.verbose('npm', npmcommand)

          var exec = require('child_process').exec,
              child;

           child = exec(npmcommand,
           function (err, stdout, stderr) {
              if (err) { 
                return cb(err); 
              }
              cb(null, release, appFolder);
           });
        },
        function(release, appFolder, cb){

          var platform = os.platform();
          var arch = os.arch();

          if (arch === 'x64'){
            if (platform === 'win32'){
              platform = 'win64';
            } else {
              platform += '64';
            }
          }

          var defaults = [ platform ];

          inquirer.prompt([
            {
              type: 'checkbox',
              name: 'platform',
              message: "Plataforma?",
              choices: [
                'linux32', 
                'linux64',
                'osx32', 
                'osx64', 
                'win32', 
                'win64',
              ],
              default: defaults
            }
            ]).then(function( answers ) {
              cb(null, answers.platform, release, appFolder);
            }).catch(function(err){
              cb(err);
            });          
        },
        function(platforms, release, appFolder, cb){
          var NwBuilder = require('nw-builder');
          var nw = new NwBuilder({
              files: appFolder + '/**/**', // use the glob format
              buildDir: output,
              platforms: platforms,
              zip: false
          });

          log.info('nw', chalk.bold.green('building!'));

          nw.on('log',  function(msg){
            log.silly('nw', msg);
          });

          // Build returns a promise
          nw.build().then(function () {
             cb(null);
          }).catch(function (error) {
             cb(error);
          });
        },
        function(cb){
          log.info('git', chalk.bold.green('ya tienes tu PAD portable'));

          console.log('');
          console.log(chalk.bold.blue('Bye ;)'));
        }
      ], function(err){
        if (err){
          log.error('', err.message);
          return process.exit(0);
        }

        process.exit(0);
      });

    });
  
};