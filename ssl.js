var https = require('https');
var events = require('events');
var path = require('path');
var fs = require('fs');
var util = require('util');


const MAX_PORT = 65535;
const INIT_PORT = 1024;

module.exports = (function () {
  function HttpsProxyServer(httpsOpts, targetHost, targetPort) {
    events.EventEmitter.call(this);
    var self = this;

    this._httpsServer = https.createServer(httpsOpts, function (req, res) {
      req.url = 'https://' + targetHost + ':' + targetPort + req.url
      self.emit('request', req, res);
    });

    this._httpsServer.on('listening', function () {
      self.emit('listening');
    });

    this._httpsServer.on('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        if (HttpsProxyServer.port >= MAX_PORT) {
          HttpsProxyServer.port = INIT_PORT;
        }
        self._httpsServer.listen(this.port = HttpsProxyServer.port++);
      }
    });
    this._httpsServer.listen(this.port = HttpsProxyServer.port++);
  }

  HttpsProxyServer.port = INIT_PORT;
  util.inherits(HttpsProxyServer, events.EventEmitter);

  HttpsProxyServer.prototype.close = function () {
    try {
      this._httpsServer.close();
    }
    catch (e) {}
  }

  return HttpsProxyServer;
})();
