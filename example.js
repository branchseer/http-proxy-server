var HttpProxyServer = require('./');

var proxy = new HttpProxyServer();
proxy.listen(8080);

proxy.on('connection', function (request, proxyRequest) {
  console.log(request.method, request.url);

  
});
