/*global emit */
'use strict';
var Backbone = require('backbone')
  , cradle = require('cradle')
  , _ = require('lodash')
  , pkg = require('../package.json')
  , db
  , uuids = []

// gets a collection's url if it's a fn or a string
function getURL(obj) {
  if (_.isString(obj.url)) return obj.url
  if (_.isFunction(obj.url)) return obj.url()
}

// preps model for db
function toJSON(model){
  var doc = model.toJSON()
  doc._id = model.id
  return doc
}

// Get a list of 100 UUIDs from couch
function getUUIDList(callback){
  new(cradle.Connection)().uuids(100, function(err, res){
    if (err) throw new Error(err)
    uuids = res
    callback(res)
  })
}

// get a single UUId
function getUUID(callback){
  if (!_.isFunction(callback)) throw new Error('Must provide getUUID with a callback(uuid)')

  // return from a cached list of UUIDs
  if (uuids.length) return callback(uuids.pop())

  // if that list is empty, get some new UUIDs
  getUUIDList(function(){
    callback(uuids.pop())
  })
}

// Backbone sync method.
function sync(method, model, opts) {
  var options = opts || {}
    , success = options.success || function() {}
    , error = options.error || function() {}

  // console.log('syncing', method, model, opts)
  switch (method) {
    case 'read':
      if (model.id) {
        db.get(getURL(model), function(err, doc) {
          err ? error(model, new Error('No results')) : success(model, doc)
        })
      }
      else {
        db.view('backbone/collection', {key: getURL(model).split('/')[1]}, function(err, res) {
          if (err) return error(err)

          var models = []
          _.each(res.rows, function(row){
            models.push(row.value)
          })
          success(models)
        })
      }
      break
    case 'create': case 'update':
      if (model.get('_rev')) {
        // This is an update.
        // Ensure that partial updates work by retrieving the model and merging its attributes.
        db.get(model.id, function(err, doc) {
          var conflict
          if (err) error(model, err)
          if (doc._rev !== model.get('_rev')) {
            // Create a fake object we already know that sending
            // the request would fail.
            conflict = new Error('Document update conflict.')
            conflict.reason = 'Document update conflict.'
            conflict.statusCode = 409
            error(conflict)
          }
          else {
            db.save(doc._id, _.extend(doc, toJSON(model)), function(err, res) {
              if (err) return error(err)

              success({'_rev': res.rev})
            })
          }
        })
      }
      else {
        // This is a create.
        getUUID(function(uuid){
          db.save(getURL(model) + '/' + uuid, toJSON(model), function(err, res) {
            if (err) return error(err)
            success({'_rev': res.rev, _id: res._id})
          })
        })
      }
      break
    case 'delete':
      // We never actually want to remove something from the DB, instead, we'll just mark it as deleted with an attribute
      db.merge(model.id, {_isDeleted: true}, function(err, res) {
        if (err) return error(err)
        success({'_rev': res.rev})
      })
      break
  }
}

function install(db, callback) {
  db.create()
  db.save('_design/backbone', {
    views: {
      collection: {
        map: function(doc){
          if (!doc._isDeleted) emit(doc._id.split('/')[1], doc)
        }
      }
    }
  }, function(err){
    if (err) throw new Error(err)
    callback()
  })
}

exports.name = 'db'
exports.attach = function(opts){
  var app = this
    , config = app.config.get('database') || {}
    , options = _.defaults(opts || {}, {
      // use options passed in, but default to the config file
      host: config.host || 'localhost'
      , port: config.port || 5984
      , name: config.name || pkg.name
      // turn off cache by default in development
      , cache: app.env !== 'development'
      , raw: false
      , callback: function(){}
    })

  cradle.setup({
    host: options.host
    , port: options.port
  })
  db = new(cradle.Connection)().database(options.name)

  db.exists(function (err, exists) {
    if (err) throw new Error(err)
    if (exists) return options.callback()
    app.log.info('CouchDB database ' + options.name + ' did not exist; creating.');
    install(db, options.callback)
  })

  app.db = db
  Backbone.sync = sync
}
