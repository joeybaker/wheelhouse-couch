'use strict';
var Backbone = require('backbone')
  , cradle = require('cradle')
  , _ = require('lodash')
  , pkg = require('../package.json')
  , internals = {}
  , db
  , dbExists
  , getCollectionName
  , getId
  , feed
  , options

internals.uuids = []

// preps model for db
internals.toJSON = function toJSON(model){
  var doc = model.toJSON()
  doc._id = model.id
  return doc
}

// Get a list of 100 UUIDs from couch
internals.getUUIDList = function getUUIDList(callback){
  var count = 100

  internals.connection.uuids(count, function(err, res){
    if (err) internals.log.error('db: uuids:', err)
    // try again in case things fail
    if (!res || res.length !== count) {
      internals.log.warn('db: uuids: returned a null response. Retrying.')

      setImmediate(function(){
        internals.getUUIDList(callback)
      })
      return
    }
    callback(res)
  })
}

// get a single UUId
internals.getUUID = function getUUID(callback){
  if (!_.isFunction(callback)) throw new Error('Must provide getUUID with a callback(uuid)')

  // return from a cached list of UUIDs
  if (internals.uuids.length > 1) return callback(internals.uuids.pop())

  // if that list is empty, get some new UUIDs
  internals.getUUIDList(function(uuids){
    // cache the uuids for future use
    internals.uuids = uuids
    callback(internals.uuids.pop())
  })
}

// Backbone sync method.
internals.sync = function sync(method, model, opts) {
  var options = opts || {}
    , success = options.success || function() {}
    , error = options.error || function() {}

  if (!dbExists) {
    internals.log.error('db: sync:', 'Tried to interact with db before it could be created.')
    return
  }

  switch (method) {
    case 'read':
      if (model.id) {
        db.get(getId(model), function(err, doc) {
          if (err) {
            internals.log.error('db: read:', {model: model.id, err: err})
            return error(model, 'No results')
          }

          success(model, doc)
        })
      }
      else {
        // at this point, the model is actually a collection
        db.view('backbone/collection', {key: getCollectionName(model)}, function(err, res) {
          if (err){
            internals.log.error('db: read:', err)
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
        // also helps to prevent document update conflicts
        db.get(model.id, function(err, doc) {
          var dbUpdateCb = function(err, res) {
              if (err) {
                internals.log.error('db: update:', {model: model.id, err: err})
                return error(model, err)
              }
              if (!res.ok) {
                internals.log.warn('db: update: db returned a null response, trying to save again.')
                return db.save(model.id, internals.toJSON(model), dbUpdateCb)
              }

              internals.log.info('db: update:', res)
              success({_rev: res.rev})
              // resume the feed, do it on nextTick so that we're sure backbone has time to process
              setImmediate(function(){
                feed.resume()
              })
            }
            , newModel = _.extend({}, doc, internals.toJSON(model))

          // ensure we're using the latest rev from the db
          newModel._rev = doc._rev

          if (err) return error(model, err)
          else {
            // pause the feed so that we can create a backbone model before the feed tries to parse it.
            feed.pause()
            db.save(model.id, doc._rev, newModel, dbUpdateCb)
          }
        })
      }
      else {
        // This is a create.
        internals.getUUID(function(uuid){
          var id = getId(model) + '/' + uuid
            , newModel = internals.toJSON(model)
            , dbCreateCb = function(err, res) {
              if (err) {
                internals.log.error('db: create:', {model: id, err: err, input: newModel})
                return error(model, err)
              }
              if (!res.ok) {
                internals.log.warn('db: create: db returned a null response, trying to save again.')
                return db.save(id, newModel, dbCreateCb)
              }

              internals.log.info('db: create:', res)
              success({_rev: res.rev, _id: res._id})

              // resume the feed, do it on nextTick so that we're sure backbone has time to process
              setImmediate(function(){
                feed.resume()
              })
            }

          // pause the feed so that we can create a backbone model before the feed tries to parse it.
          feed.pause()
          db.save(id, newModel, dbCreateCb)
        })
      }
      break
    case 'delete':
      // We never actually want to remove something from the DB, instead, we'll just mark it as deleted with an attribute
      var dbDeleteCb = function(err, res) {
          if (err) {
            internals.log.error('db: delete:', {model: model.id, err: err})
            return error(model, err)
          }
          if (!res.ok) {
            internals.log.warn('db: delete: db returned a null response, trying to delete again.')
            return db.save(model.id, {idDeleted: true}, dbDeleteCb)
          }

          internals.log.info('db: delete:', res)
          success({_rev: res.rev})

          // resume the feed, do it on nextTick so that we're sure backbone has time to process
          setImmediate(function(){
            feed.resume()
          })
        }

        // pause the feed so that we can delete the backbone model before the feed tries to parse it.
        feed.pause()
      db.save(model.id, {isDeleted: true}, dbDeleteCb)
      break
  }
}

internals.feedSetup = function feedSetup(){
  feed = db.changes({
    filter: function(doc){
      if (doc._id.indexOf('/') > 0 && doc._id.charAt(0) !== '_') return true
      else return false
    }
    , since: 'now'
  })

  feed.on('change', function(change){
    var name = change.doc._id.replace(/(.*?)\/[A-z0-9]*$/, '$1')
      , model

    // bail if we don't know about this collection
    if (!app.collections || !app.collections[name]) return

    // do this on nextTick to ensure backbone has time to process
    process.nextTick(function(){
      model = app.collections[name].get(change.doc._id)

      // detect a faux delete or a real delete
      if (change.deleted && model || (model && change.doc.isDeleted)) {
        internals.log.debug('db: changes: removing:', change.doc._id)
        app.collections[name].remove(change.doc._id, {notOriginal: true})
      }
      // if this is the first rev, and we don't have the model, add it
      else if (change.doc._rev.charAt(0) === '1' && !model){
        // probably no need to merge, but we'll do it just to be sure that our model gets added.
        internals.log.debug('db: changes: adding:', change.doc._id)
        app.collections[name].add(change.doc, {merge: true, notOriginal: true})
      }
      else if (model && model.get('_rev') !== change.doc._rev) {
        internals.log.debug('db: changes: updating:', change.doc._id)
        model.set(change.doc, {notOriginal: true})
      }
      else {
        // we're probably at app start, and haven't populated our collecitons yet, or this change has already happened on this server. just bail
        internals.log.debug('db: changes: ignoring:', change.doc._id)
      }
    })
  })

  feed.on('error', function(err){
    internals.log.error('db: changes:', err)
  })
}

internals.install = function install(callback) {
  db.create(function(err){
    if (err) {
      internals.log.error('db: install:', err)
      callback(new Error(err.reason))
      throw new Error(err.reason)
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
        internals.log.error('db: install:', err)
        callback(new Error(err.reason))
        throw new Error(err.reason)
      }

      internals.feedSetup()
      dbExists = true
      callback()
    })
  })
}

// expose private methods for testing
exports.internals = internals

exports.name = 'wheelhouse-couch'
exports.attach = function(opts){
  var config = {}

  options = _.defaults(opts || {}, {
    // use options passed in, but default to the config file
    host: config.host || 'localhost'
    , port: config.port || 5984
    , name: config.name || pkg.name
    , retries: config.retries || 3
    , retryTimeout: config.retryTimeout || 30 * 1000
    , cache: false
    , raw: false
    , getId: function(model){
      return _.result(model, 'url').substring(1)
    }
    , getCollectionName: function(collection){
      return _.result(collection, 'url').substring(1)
    }
  })

  internals.log = this.log
  internals.connection = new(cradle.Connection)(options)
  db = internals.connection.database(options.name)

  getCollectionName = options.getCollectionName
  getId = options.getId

  this.db = db
  Backbone.sync = internals.sync
  this.Backbone = Backbone
}

exports.init = function(done){
  db.exists(function (err, exists) {
    if (err) {
      internals.log.error('db: install:', err)
      return done(err)
    }

    if (exists) {
      internals.log.info('db: config:', 'Connected to ' + options.name)
      dbExists = true
      internals.feedSetup()
      return done()
    }

    internals.log.info('db: install:', 'CouchDB database ' + options.name + ' did not exist; creating.')
    internals.install(done)
  })
}
