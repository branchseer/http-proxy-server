'use strict'

var http = require('http');
var url  = require('url');
var net = require('net');
var util = require("util");
var events = require("events");
var fs = require('fs');
var path = require('path');
var https = require('https');
var HttpsProxyServer = require('./ssl')


var certFolder = '/Users/patr0nus/repo/Cellist/build/certs';
var keyPath = path.join(certFolder, 'privatekey.pem');
var certPath = path.join(certFolder, 'certificate.pem')
var httpsOpts = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
}


module.exports = (function () {
  var HTTP_TUNNEL_OK = new Buffer('HTTP/1.1 200 Connection established\r\n\r\n');
  var errorResponse = function (res) {
    console.log("Bad Gateway");
    res.writeHead(502, 'text/plain');
    res.end('Bad Gateway');
  };

  var handleHttp = function (isSSL, c2pRequest, p2cResponse) {
    var self = this;

    var p2sRequestOption = url.parse(c2pRequest.url);
    p2sRequestOption.method = c2pRequest.method;
    p2sRequestOption.headers = c2pRequest.headers;
    
    delete p2sRequestOption.headers['proxy-connection'];
      
    var p2sRequest = (isSSL ? https : http).request(p2sRequestOption, function (s2pResponse) {
      s2pResponse.on('error', function (e) {
        errorResponse(p2cResponse);
      });
      
      p2cResponse.writeHead(s2pResponse.statusCode, s2pResponse.headers);
      s2pResponse.pipe(p2cResponse);//Redirect target server's response to proxy client
    });
    
    p2sRequest.on('error', function (e) {
      errorResponse(p2cResponse);
    });
    
    c2pRequest.on('error', function (e) {
      p2cResponse.end();
    })
  
    c2pRequest.pipe(p2sRequest);//Redirect proxy client's body to target server

    this.emit('connection', c2pRequest, p2sRequest);
  };

  var handleTunneling = function (c2pRequest, p2cSocket, head) {
    var self = this;
    var url = c2pRequest.url;
    var urlParser = url.split(':');

    if (urlParser.length !== 2) {
      return p2cSocket.end()
    }
    var host = urlParser[0];
    var port = parseInt(urlParser[1]);
    
    var p2sOpt = {
      host: host,
      port: port
    };

    var httpsProxy;
    if (port === 443) {//SSL Tunnel
        p2sOpt.host = 'localhost';

        if (!(url in this._httpsProxies)) {
          console.log(url);
          this._httpsProxies[url] = new HttpsProxyServer(httpsOpts, host, port)
            .on('request', handleHttp.bind(this, true))
            .once('listening', function () {
              p2sOpt.port = this.port;
              startConnection();
            });
        }
        else {
          p2sOpt.port = this._httpsProxies[url].port;
          startConnection();
        }
    }
    else {
      startConnection();
      self.emit('connection', c2pRequest, p2sSocket);
    }
    function startConnection () {
      var p2sSocket = net.connect(p2sOpt, function () {
        p2cSocket.write(HTTP_TUNNEL_OK);
        p2cSocket.pipe(p2sSocket);
      });
      
      p2sSocket.pipe(p2cSocket);
      p2sSocket.on('error', function (e) {
        p2cSocket.end();
      });
    
      p2cSocket.on('error', function (e) {
        p2sSocket.end();
      });
    }
  };

  function HttpProxyServer () {
    events.EventEmitter.call(this);
    var self = this;

    this._httpsProxies = {};

    this._server = http.createServer(function (req, res) {
      if (req.url.indexOf('http://') !== 0) {
        return this.fallback(c2pRequest, p2cResponse);
      }
      return handleHttp.call(self, false, req, res);
    });//Handle common http requests

    this._server.on('connect', handleTunneling.bind(this));//Http tunneling

    this.fallback = function (req, res) {
      res.writeHead(200, 'text/plain');
      res.end('Oops..');
    }
  }
  util.inherits(HttpProxyServer, events.EventEmitter);

  HttpProxyServer.prototype.listen = function () {
    http.Server.prototype.listen.apply(this._server, arguments);
  };

  HttpProxyServer.prototype.close = function () {
    http.Server.prototype.close.apply(this._server, arguments);
  };

  return HttpProxyServer;
})();


