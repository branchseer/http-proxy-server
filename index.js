'use strict'

var http = require('http');
var url  = require('url');
var net = require('net');
var util = require("util");
var events = require("events");
var fs = require('fs');
var path = require('path');
var https = require('https');
var domain = require('domain');
var HttpsProxyServer = require('./ssl')



module.exports = (function () {
  var HTTP_TUNNEL_OK = new Buffer('HTTP/1.1 200 Connection established\r\n\r\n');
  var errorResponse = function (res) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  };

  var handleHttp = function (isSSL, c2pRequest, p2cResponse) {
    //c2pRequest.pause();
    var self = this;
    this._applyMiddleware(0, c2pRequest, p2cResponse, function () {
      var p2sRequestOption = url.parse(c2pRequest.url);
      p2sRequestOption.method = c2pRequest.method;
      p2sRequestOption.headers = c2pRequest.headers;
      
      delete p2sRequestOption.headers['proxy-connection'];
        
      var p2sRequest = (isSSL ? https : http).request(p2sRequestOption, function (s2pResponse) {
        s2pResponse.once('error', function (e) {
          errorResponse(p2cResponse);
        });
        
        p2cResponse.writeHead(s2pResponse.statusCode, s2pResponse.headers);
        //c2pRequest.resume();
        s2pResponse.pipe(p2cResponse);//Redirect target server's response to proxy client
      });
      
      p2sRequest.once('error', function (e) {
        errorResponse(p2cResponse);
      });
      
      c2pRequest.once('error', function (e) {
        p2cResponse.end();
      })
    
      c2pRequest.pipe(p2sRequest);//Redirect proxy client's body to target server
      
      self.emit('connection', c2pRequest, p2sRequest);
    });
  };

  var handleTunneling = function (c2pRequest, p2cSocket, head) {
    p2cSocket.pause();
    var self = this;
    var url = c2pRequest.url;
    var urlParser = url.split(':');

    var host, port;
    
    var host = urlParser[0];
    if (urlParser.length == 1) {
      port = 443;
    }
    else {
      port = parseInt(urlParser[1]);
    }
    
    var p2sOpt = {
      host: host,
      port: port
    };

    var httpsProxy, p2sSocket;
    if (this.httpsOption && port === 443) {//SSL Tunnel
        p2sOpt.host = 'localhost';

        if (!(url in this._httpsProxies)) {
          this._httpsProxies[url] = new HttpsProxyServer(this.httpsOption, host, port)
            .once('listening', function () {
              p2sOpt.port = this.port;
              startConnection();
            })
            .on('request', handleHttp.bind(this, true));
        }
        else {
          var httpsProxy = this._httpsProxies[url];
          if (httpsProxy.port != null) {
            p2sOpt.port = httpsProxy.port;
            return startConnection();
          }
          httpsProxy.once('listening', function () {
            p2sOpt.port = httpsProxy.port;
            startConnection();
          });
        }
    }
    else {
      startConnection();
      
      process.nextTick(function () {
        self.emit('connection', c2pRequest, p2sSocket);
      });
    }
    function startConnection () {
      var d = domain.create();
      p2sSocket = new net.Socket();

      d.add(p2sSocket);
      d.add(p2cSocket);
      d.add(c2pRequest);
      
      d.run(function () {
        p2sSocket.connect(p2sOpt.port, p2sOpt.host);
  
        p2sSocket.on('connect', function () {
          p2cSocket.write(HTTP_TUNNEL_OK);
          p2cSocket.resume();
          p2cSocket.pipe(p2sSocket);
        });
        p2sSocket.pipe(p2cSocket);
      })
      d.on('error', function (e) {
        p2cSocket.end();
        p2sSocket.end();
      })
    }
  };

  function HttpProxyServer () {
    events.EventEmitter.call(this);
    var self = this;
    this._middlewares = []
    this._httpsProxies = {};

    this._server = http.createServer(function (req, res) {
      if (req.url.indexOf('http://') !== 0 && self.fallback) {
        return self.fallback(req, res);
      }
      return handleHttp.call(self, false, req, res);
    });//Handle common http requests

    this._server.on('listening', function () {
      self.emit('listening');
    });

    this._server.on('error', function (e) {
      self.emit('error', e);
    });

    this._server.on('close', function () {
      self.emit('close');
    });

    this._server.on('connect', handleTunneling.bind(this));//Http tunneling

    this._connections = []
    var addConnection = function (incoming) {
      var index = self._connections.push(incoming) - 1
      incoming.once('close', function () {
        self._connections[index] = null
      });
      incoming.once('error', function () {
        self._connections[index] = null
      });
    };
    this._server.on('connect', addConnection);
    this._server.on('request', addConnection);

    this.fallback = function (req, res) {
      res.writeHead(200, 'text/plain');
      res.end('Oops..');
    }
  }
  util.inherits(HttpProxyServer, events.EventEmitter);

  HttpProxyServer.prototype.use = function (middleware) {
    this._middlewares.push(middleware);
  };

  HttpProxyServer.prototype._applyMiddleware = function (index, req, res, done) {
    var self = this;
    if (index < this._middlewares.length) {
      this._middlewares[index](req, res, function () {
        self._applyMiddleware(index + 1, req, res, done)
      });
    }
    else {
      done();
    }
  }

  HttpProxyServer.prototype.listen = function () {
    http.Server.prototype.listen.apply(this._server, arguments);
  };

  HttpProxyServer.prototype.close = function () {
    var connection;
    for (var i = this._connections.length - 1; i >= 0; i--) {
      connection = this._connections[i];
      if (connection) {
        connection.destroy();
      }
    }
    this._connections.length = 0;

    http.Server.prototype.close.apply(this._server, arguments);
  };

  return HttpProxyServer;
})();


