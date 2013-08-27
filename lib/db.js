'use strict';
var Backbone = require('backbone')
  , cradle = require('cradle')
  , _ = require('lodash')
  , pkg = require('../package.json')
  , db
  , connection
  , app
  , uuids = []
  , getCollectionName
  , getId

// preps model for db
function toJSON(model){
  var doc = model.toJSON()
  doc._id = model.id
  return doc
}

// Get a list of 100 UUIDs from couch
function getUUIDList(callback){
  var count = 100

  connection.uuids(count, function(err, res){
    if (err) app.log.error('db: uuids:', err)
    // try again in case things fail
    if (res.length !== count) {
      app.log.warn('db: uuids: returned a null response. Retrying.')
      return getUUIDList(callback)
    }

    uuids = res
    callback()
  })
}

// get a single UUId
function getUUID(callback){
  if (!_.isFunction(callback)) throw 'Must provide getUUID with a callback(uuid)'


  // return from a cached list of UUIDs
  if (uuids.length > 1) return callback(uuids.pop())

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
        db.get(getId(model), function(err, doc) {
          if (err) {
            app.log.error('db: read:', err)
            return error(model, 'No results')
          }

          success(model, doc)
        })
      }
      else {
        // at this point, the model is actually a collection
        db.view('backbone/collection', {key: getCollectionName(model)}, function(err, res) {
          if (err){
            app.log.error('db: read:', err)
            return error(model, err)
          }

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
          var // conflict
            dbUpdateCb = function(err, res) {
              if (err) {
                app.log.error('db: update:', err)
                return error(model, err)
              }
              if (!res.ok) {
                app.log.warn('db: update: db returned a null response, trying to save again.')
                return db.save(model.id, toJSON(model), dbUpdateCb)
              }

              app.log.info('db: update:', res)
              success({_rev: res.rev})
            }
            , newModel = _.extend(doc, toJSON(model))

          if (err) return error(model, err)
          else {
            db.merge(model.id, newModel, dbUpdateCb)
          }
        })
      }
      else {
        // This is a create.
        getUUID(function(uuid){
          var id = getId(model) + '/' + uuid
            , newModel = toJSON(model)
            , dbCreateCb = function(err, res) {
              if (err) {
                app.log.error('db: create:', err)
                return error(model, err)
              }
              if (!res.ok) {
                app.log.warn('db: create: db returned a null response, trying to save again.')
                return db.save(id, newModel, dbCreateCb)
              }

              app.log.info('db: create:', res)
              success({_rev: res.rev, _id: res._id})
            }

          db.save(id, newModel, dbCreateCb)
        })
      }
      break
    case 'delete':
      // We never actually want to remove something from the DB, instead, we'll just mark it as deleted with an attribute
      var dbDeleteCb = function(err, res) {
          if (err) {
            app.log.error('db: delete:', err)
            return error(model, err)
          }
          if (!res.ok) {
            app.log.warn('db: delete: db returned a null response, trying to delete again.')
            return db.save(model.id, {idDeleted: true}, dbDeleteCb)
          }

          app.log.info('db: delete:', res)
          success({_rev: res.rev})
        }

      db.save(model.id, {isDeleted: true}, dbDeleteCb)
      break
  }
}

function install(db, callback) {
  db.create(function(err){
    if (err) {
      app.log.error('db: install:', err)
      throw err
    }

    db.save('_design/backbone', {
      views: {
        collection: {
          map: function(doc){
            /*global emit */
            if (!doc.isDeleted) emit(doc._id.split('/')[0], doc)
          }
        }
      }
    }, function(err){
      if (err) {
        app.log.error('db: install:', err)
        throw err
      }
      callback()
    })
  })
}

exports.name = 'db'
exports.attach = function(opts){
  app = this

  var config = app.config.get('database') || {}
    , options = _.defaults(opts || {}, {
      // use options passed in, but default to the config file
      host: config.host || 'localhost'
      , port: config.port || 5984
      , name: config.name || pkg.name
      , retries: config.retries || 3
      , retryTimeout: config.retryTimeout || 30 * 1000
      // turn off cache by default in development
      , cache: app.env !== 'development'
      , raw: false
      , callback: function(){}
      , getId: function(model){
        return model.url().substring(1)
      }
      , getCollectionName: function(collection){
        return collection.url.substring(1)
      }
    })

  connection = new(cradle.Connection)(options)
  db = connection.database(options.name)

  db.exists(function (err, exists) {
    if (err) {
      app.log.error('db: install:', err)
      throw err
    }
    if (exists) {
      app.log.info('db: config:', 'Connected to ' + options.name)
      return options.callback()
    }
    app.log.info('db: install:', 'CouchDB database ' + options.name + ' did not exist; creating.');
    install(db, options.callback)
  })

  getCollectionName = options.getCollectionName
  getId = options.getId

  app.db = db
  Backbone.sync = sync
  app.Backbone = Backbone
}
