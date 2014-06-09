'use strict'

var http = require('http');
var url  = require('url');
var net = require('net');
var util = require("util");
var events = require("events");

module.exports = (function () {
  var HTTP_TUNNEL_OK = new Buffer('HTTP/1.1 200 Connection established\r\n\r\n');

  var handleHttp = function (c2pRequest, p2cResponse) {
    var p2sRequestOption = url.parse(c2pRequest.url);
    p2sRequestOption.method = c2pRequest.method;
    p2sRequestOption.headers = c2pRequest.headers;
    
    delete p2sRequestOption.headers['Proxy-Connection'];
    p2sRequestOption.headers['Connection'] = 'close';
  
    var p2sRequest = http.request(p2sRequestOption, function (s2pResponse) {
      p2cResponse.writeHead(s2pResponse.statusCode, s2pResponse.headers);
      s2pResponse.pipe(p2cResponse);//Redirect target server's response to proxy client
    });
    
    p2sRequest.on('error', function (e) {
      p2cResponse.end();
    });
  
    c2pRequest.pipe(p2sRequest);//Redirect proxy client's body to target server

    this.emit('connection', c2pRequest, p2sRequest);
  };

  var handleTunneling = function (request, socket, head) {
    var urlParser = request.url.split(':');
  
    var proxySocket = net.connect({
      host: urlParser[0],
      port: urlParser[1]
    }, function () {
      socket.write(HTTP_TUNNEL_OK);
      socket.pipe(proxySocket);
    });
  
    proxySocket.pipe(socket);
    proxySocket.on('error', function (e) {
      socket.end();
    });

    this.emit('connection', request, proxySocket);
  };

  function HttpProxyServer () {
    events.EventEmitter.call(this);

    this._server = http.createServer(handleHttp.bind(this));//Handle common http requests
    this._server.on('connect', handleTunneling.bind(this));//Http tunneling
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


