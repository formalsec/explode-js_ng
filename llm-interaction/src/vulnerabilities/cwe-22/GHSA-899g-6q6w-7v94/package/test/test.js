var assert = require('assert');
var mServer = require('../lib/index.js').createServer;
var http = require('http');
var utils = require('../lib/utils.js');
var fs = require('fs');
describe('m-server', function() {
  describe('When m-server is listening on port 7000', function() {
    var sever = mServer();
    it('http server should return 200 status', function(done) {
      http.get('http://localhost:7000', function(res){
        assert.equal(res.statusCode, 200);
        done()
      })
    });
  });
  describe('When m-server is listening on custom port', function(){
    process.argv.push('-p')
    process.argv.push('6000')
    console.log(process.argv)
    var server = mServer({port:6000});

    it('http server should return 200 status', function(done){
      http.get('http://localhost:6000', function(res){
        assert.equal(res.statusCode,200);
        done();
      });
    })
    it('http server should return 404 status', function(done){
      http.get('http://localhost:6000/tesFJDFt/m-server-test', function(res){
        assert.equal(res.statusCode, 404);
        done();
      })
    })
    it('test open dir', function(done){
      var state = false;
      var dirname = 'testPathM-server';
      if(!fs.existsSync('./'+dirname)){
        state = true;
        fs.mkdirSync(dirname);
      }
      http.get('http://localhost:6000/' + dirname, function(res){
        assert.equal(res.statusCode, 200);
        state ? fs.rmdirSync(dirname) : '';
        done();
      })
    })
  })
  describe('Utils test.', function(){
    it('Object assign test', function(){
      var a = {a:1},b={b:2},c={c:3}
      utils.assign(a,b,c);
      assert.equal(a.a === 1 && a.b === 2 && a.c === 3, true);
    })
    
    it('assign test', function(){
      var a = {a:1},b={b:2},c={c:3}
      var cache = Object.assign;
      Object.assign = undefined;
      utils.assign(a,b,c);
      Object.assign = cache;
      assert.equal(a.a === 1 && a.b === 2 && a.c === 3, true);
    });

    it('sort test', function(){
      var ret = utils.sort('3','3');
      assert(ret === 0)
    })

  });


});