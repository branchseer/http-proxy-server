'use strict'

var http = require('http');
var url  = require('url');
var net = require('net');
var util = require("util");
var events = require("events");

module.exports = (function () {
  var HTTP_TUNNEL_OK = new Buffer('HTTP/1.1 200 Connection established\r\n\r\n');

  var handleHttp = function (request, response) {
    var requestOption = url.parse(request.url);
    requestOption.method = request.method;
    requestOption.headers = request.headers;
  
    var proxyRequest = http.request(requestOption, function (proxyResponse) {
      response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
      proxyResponse.pipe(response);//Redirect target server's response to proxy client
    });
  
    proxyRequest.on('error', function (e) {
      response.end();
    });
  
    request.pipe(proxyRequest);//Redirect proxy client's body to target server

    this.emit('connection', request, proxyRequest);
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


