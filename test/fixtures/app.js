'use strict';
var flatiron = require('flatiron')
  , app = flatiron.app

module.exports = function appInstance(){
  app.use(flatiron.plugins.http, {})

  return app
}
