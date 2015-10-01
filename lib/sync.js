'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var async = require('async');
var fse = require('fs-extra');

var Client = require('ssh2').Client;

var SyncManager = module.exports = function(ops){
  var self = this;

  if (false === (self instanceof SyncManager)){
    return new SyncManager();
  }

  self.ops = ops;
  self.source = ops.source;
  self.entries = [];
  self.local = [];
  self.remote = [];
  self.currents = [];

  self.diff = {
    keep: [],
    del: [],
    add: [],
    miss: []
  };

  return self;
};

SyncManager.prototype.load = function(callback){
  var self = this;

  async.waterfall([

      //read local files
      function(cb){
        _getLocals(self.source, function(err, files){
          if (err){
            return cb(err);
          }
          self.local = files;
          console.log(' Sync :: %s files finded on source directory', self.local.length);

          cb();
        });
      },
      //read changelog
      function(cb){
        self.parseChangelog(function(err, info){
          if (err){
            return cb(err);
          }

          console.log(' Sync :: %s entries finded on changelog', info.length);

          self.entries = info;
          cb();
        });
      },
      //read remote files
      function(cb){
        _getRemote(self.ops, function(err, files){
          if (err){
            return cb(err);
          }

          self.remote = files;
          
          console.log(' Remote :: %s files finded on destination directory', self.remote.length);

          cb();
        });
      },
      // make info
      function(cb){
        self
            .makeHistorySync()
            .makeDiffSync();

          console.log(' Sync :: %s currents files from changelog', self.currents.length);

          console.log(' Sync :: %s files to keep', self.diff.keep.length);
          console.log(' Sync :: %s files to delete', self.diff.del.length);
          console.log(' Sync :: %s files to add', self.diff.add.length);
          console.log(' Sync :: %s missing files', self.diff.miss.length);

          cb();
      }

    ], function(err){
      if (err){
        return callback(err);
      }

      callback();
  });

  return self;
};

SyncManager.prototype.generate = function(dir, callback){
  var self = this;

  var out = path.join(dir, 'pad-sync');
  var outf = path.join(out, 'files');

  console.log(' Sync :: Generating outputs on ' + out);

  async.waterfall([

    //clean the directory
    function(cb){
      if (fs.existsSync(out)){
        fse.remove(out, function(err){
          fse.mkdirsSync(out);
          cb();
        });
      } else {
        fse.mkdirsSync(out);
        fse.mkdirsSync(outf);
        cb();
      }
    },
    // copy files
    function(cb){
      async.eachSeries(self.diff.add, function(fname, cb){
          fse.copy(path.join(self.source, fname), path.join(outf, fname), cb);
        },
        function(err){
          console.log(' Sync :: %s files copied to output', self.diff.add.length);
          cb();
        }
      );
    },
    // make changelog
    function(cb){
      var lines = [];
      var now = new Date();

      lines.push('['+ now.getFullYear() + '-' + now.getMonth() + '-' + now.getDate() +']');
      lines.push('');
      self.diff.add.forEach(function(af){
        lines.push('+' + af);
      });
      self.diff.del.forEach(function(df){
        lines.push('-' + df);
      });
      lines.push('');

      self.entries.forEach(function(e){
        lines.push(e.entry);
        lines.push('');

        e.files.forEach(function(f){
          lines.push(f.operator + f.filename);
        });

        lines.push('');
      });

      var clog = lines.join('\n');
      fs.writeFile(path.join(out, 'CHANGELOG'), clog, function(err){
        if (err){
          return cb(err);
        }
        console.log(' Sync :: Changelog generated');
        cb();
      });

    },
    // make sh
    function(cb){
      var lines = [];

      lines.push('#!/bin/sh');
      lines.push('echo WARNING: This scripts move files');
      lines.push('');

      lines.push('read -p "Continue? (y/n) " RESP');
      lines.push('if [ "$RESP" = "y" ]; then');
      lines.push('');
      lines.push('\tmkdir -p ' + path.join(self.ops.destination, '/.epm/trash/'));
      lines.push('');
      self.diff.del.forEach(function(df){
        lines.push('\tmv -f ' + path.join(self.ops.destination, df) + ' ' + path.join(self.ops.destination, '/.epm/trash/'));
      });
      lines.push('');
      lines.push('fi');
      lines.push('');

      var sh = lines.join('\n');
      fs.writeFile(path.join(out, 'remove.sh'), sh, function(err){
        if (err){
          return cb(err);
        }
        console.log(' Sync :: remove.sh generated');
        cb();
      });
    }

    ], function(err){
      if (err){
        return callback(err);
      }

      console.log(' Sync :: ');
      console.log(' Sync :: Bye ;)!');

      callback();
  });

  return self;
};

SyncManager.prototype.parseChangelog = function(cb){
  var self = this;

  var cfile = path.join(self.source, 'CHANGELOG');

  if (!fs.existsSync(cfile)){
    return cb(new Error('Changelog file not exists'));
  }

  var res = {};

  fs.readFile(cfile, 'utf-8', function(err, data){
    if (err){
      return cb(err);
    }

    _parse(data, function(perr, entries){

      if (perr){
        return cb(perr);
      }

      cb(null, entries);
    });
  });

  return self;
};

SyncManager.prototype.makeHistorySync = function(){
  var self = this;

  var history = {};

  // reverse history
  for(var i = self.entries.length-1; i>=0;i--) {
    var files = self.entries[i].files;

    for(var f = files.length-1; f>=0;f--) {
      var file = files[f];
      history[file.filename] = file.operator;
    }

  }

  self.currents = _.filter(Object.keys(history), function(fname){
    return history[fname] === '+';
  });

  return self;
};

SyncManager.prototype.makeDiffSync = function(){
  var self = this;

  self.diff.keep = _.intersection(self.local, self.currents);
  self.diff.del = _.difference(self.currents, self.local);
  self.diff.add = _.difference(self.local, self.currents);
  self.diff.miss = _.difference(self.remote, self.currents);

  return self;
};


//
//helps

function _getRemote(schema, cb){
  var conn = new Client();
  
  console.log('');

  console.log(' Ssh :: connecting to ' + schema.host + '...');

  conn.on('ready', function() {
    console.log(' Ssh :: ready');
    
    conn.sftp(function(err, sftp) {
    
      if (err) throw err;

      sftp.readdir(schema.destination, function(err, list) {

        if (err) throw err;
        
        var files = _.filter(_.map(list, function(e){
          return e.filename;
        }), function(fname){
          var patt = /[a-zA-Z0-9]+\.zip/i;
          return patt.test(fname);
        });

        cb(null, files);
        conn.end();

      });

    });

  }).connect({
    host: schema.host,
    port: schema.port,
    username: schema.username,
    password: schema.pwd
  });

}

function _getLocals(source, cb){
  fs.readdir(source, function(err, files){

    var res = _.filter(files, function(f){
      var patt = /[a-zA-Z0-9]+\.zip/i;
      return patt.test(f);
    });

    cb(null, res);

  });
}

function _parse(data, cb){

  var trim = data.replace(/\r\n/g, '\n')
  var lines = trim.split('\n');

  if (lines.length === 0) {
    return cb(null, []);
  }

  var res = [];

  var entryp = /^\s*\[/;
  var ce = { entry: 'Unknown', files: [] };

  for (var i=0; i<lines.length;i++){
    var line = _.trim(lines[i]);

    // is an entry
    if (entryp.test(line)) {
      if (i !== 0 && ce.entry == 'Unknown'){
        // push unknown entry
        res.push(ce);
      }
      // print
      ce = { entry: line, files: [] };
      res.push(ce);

    } else {
      if (line !== undefined && line !== '') {
        var operator = line.substring(0, 1);
        var filename = line.substring(1, line.length);
        ce.files.push({ operator: operator, filename: filename});  
      }
    }
  }

  cb (null, res);
}