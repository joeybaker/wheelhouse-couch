'use strict';
var flatiron = require('flatiron')
  , app = flatiron.app
  , path = require('path')
  , _base = path.join(__dirname, '/../..')

function appInstance(){
  app.use(flatiron.plugins.http, {})
  app._base = _base
  app.start(8999)

  return app
}

module.exports = appInstance
