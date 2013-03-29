'use strict';
var flatiron = require('flatiron')
  , app = flatiron.app
  , path = require('path')
  , _base = path.join(__dirname, '/../..')

require('chai').should()

function appInstance(){
  app.use(flatiron.plugins.http, {})
  app.start(8999)
  app._base = _base

  return app
}

module.exports = appInstance
