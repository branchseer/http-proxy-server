var https = require('https');
var events = require('events');
var path = require('path');
var fs = require('fs');
var util = require('util');

randomInt = function (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
};

module.exports = (function () {
  function HttpsProxyServer(httpsOpts, targetHost, targetPort) {
    events.EventEmitter.call(this);
    var self = this;
    httpsOpts(targetHost, function (opts) {
      self._httpsServer = https.createServer(opts, function (req, res) {
        req.url = 'https://' + targetHost + ':' + targetPort + req.url
        self.emit('request', req, res);
      });
  
      self._httpsServer.once('listening', function () {
        self.emit('listening');
      });
  
      self._httpsServer.on('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          self.port = randomInt(1025, 65535);
          self._httpsServer.listen(self.port);
        }
      });
      self.port = randomInt(1025, 65535);
      self._httpsServer.listen(self.port);
    });
  }

  util.inherits(HttpsProxyServer, events.EventEmitter);

  HttpsProxyServer.prototype.close = function () {
    try {
      this._httpsServer.close();
    }
    catch (e) {}
  }

  return HttpsProxyServer;
})();
