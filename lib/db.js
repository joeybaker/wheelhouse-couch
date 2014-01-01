'use strict';
var Backbone = require('backbone')
  , cradle = require('cradle')
  , _ = require('lodash')
  , internals = {}
  , app

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
    if (err) app.log.error('db: uuids:', err)
    // try again in case things fail
    if (!res || res.length !== count){
      app.log.warn('db: uuids: returned a null response. Retrying.')

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
internals.sync = function sync(method, model, options){
  var error
    , success

  options = options ? _.clone(options) : {}

  // ensure we have error and success callbacks
  error = options.error || function(){}
  success = options.success || function(){}

  if (!internals.dbExists){
    app.log.error('db: sync:', 'Tried to interact with db before it could be created.')
    return
  }

  switch (method){
    case 'read':
      if (model.id){
        internals.db.get(internals.options.getId(model), function(err, doc){
          if (err){
            app.log.error('db: read:', {model: model.id, err: err})
            return error(err)
          }

          success(doc)
        })
      }
      else {
        // without an id, the model is actually a collection
        internals.db.view('backbone/collection', {key: internals.options.getCollectionName(model)}, function(err, res){
          if (err){
            app.log.error('db: read:', {collection: internals.options.getCollectionName(model), err: err})
            return error(err)
          }

          success(_.reduce(res.rows, function(models, row){
            models.push(row.value)
            return models
          }, []))
        })
      }
      break
    case 'create': case 'update':
      if (model.get('_rev')){
        // This is an update.
        // Ensure that partial updates work by retrieving the model and merging its attributes.
        // also helps to prevent document update conflicts
        internals.db.get(model.id, function(err, doc){
          var dbUpdateCb = function syncUpdateCb(err, res){
              if (err){
                if (err.error === 'conflict'){
                  app.log.warn('db: update: document update conflict; retrying', {model: model.id, err: err})
                  return internals.db.save(model.id, internals.toJSON(model), dbUpdateCb)
                }

                app.log.error('db: update:', {model: model.id, err: err})
                return error(err)
              }

              if (!res || !res.ok){
                app.log.warn('db: update: db returned a null response, trying to save again.')
                return internals.db.save(model.id, internals.toJSON(model), dbUpdateCb)
              }

              app.log.info('db: update:', res)
              success({_rev: res.rev})
              // resume the feed, do it on nextTick so that we're sure backbone has time to process
              setImmediate(function(){
                internals.feed.resume()
              })
            }
            , newModel

          if (err) {
            app.log.error('db: create: get error', {model: model.id, err: err})
            return error(err)
          }
          else {
            // overwrite what's in the db with our new info
            // ensure we're using the latest rev from the db
            newModel = _.extend({}, doc, internals.toJSON(model), {_rev: doc._rev})

            // pause the feed so that we can create a backbone model before the feed tries to parse it.
            internals.feed.pause()
            internals.db.save(model.id, doc._rev, newModel, dbUpdateCb)
          }
        })
      }
      else {
        // This is a create.
        internals.getUUID(function(uuid){
          var id = internals.options.getId(model) + '/' + uuid
            // this is the one time we don't want to ensure there's an id attribute
            , newModel = model.toJSON()
            , dbCreateCb = function syncCreateCb(err, res){
              if (err){
                app.log.error('db: create:', {model: id, err: err, input: newModel})
                return error(err)
              }
              if (!res || !res.ok){
                app.log.warn('db: create: db returned a null response, trying to save again.')
                return internals.db.save(id, newModel, dbCreateCb)
              }

              app.log.info('db: create:', res)
              success({_rev: res.rev, _id: res.id})

              // resume the feed, do it on nextTick so that we're sure backbone has time to process
              setImmediate(function(){
                internals.feed.resume()
              })
            }

          // pause the feed so that we can create a backbone model before the feed tries to parse it.
          internals.feed.pause()
          internals.db.save(id, newModel, dbCreateCb)
        })
      }
      break
    case 'delete':
      // We never actually want to remove something from the DB, instead, we'll just mark it as deleted with an attribute
      model.set({isDeleted: true}, {silent: true})
      // a delete therefore, is just an update, but with an attribute added
      internals.sync('update', model, options)
      break
  }
}

internals.feedSetup = function feedSetup(){
  internals.feed = internals.db.changes({
    filter: function(doc){
      if (doc._id.indexOf('/') > 0 && doc._id.charAt(0) !== '_') return true
      else return false
    }
    , since: 'now'
  })

  internals.feed.on('change', function(change){
    var name = change.doc._id.replace(/(.*?)\/[A-z0-9]*$/, '$1')
      , model

    // bail if we don't know about this collection
    if (!app.collections || !app.collections[name]) return

    // do this on nextTick to ensure backbone has time to process
    process.nextTick(function(){
      model = app.collections[name].get(change.doc._id)

      // detect a faux delete or a real delete
      if (change.deleted && model || (model && change.doc.isDeleted)){
        app.log.debug('db: changes: removing:', change.doc._id)
        app.collections[name].remove(change.doc._id, {notOriginal: true})
      }
      // if this is the first rev, and we don't have the model, add it
      else if (change.doc._rev.charAt(0) === '1' && !model){
        // probably no need to merge, but we'll do it just to be sure that our model gets added.
        app.log.debug('db: changes: adding:', change.doc._id)
        app.collections[name].add(change.doc, {merge: true, notOriginal: true})
      }
      else if (model && model.get('_rev') !== change.doc._rev){
        app.log.debug('db: changes: updating:', change.doc._id)
        // clear so that attributes that are deleted from the doc are removed from the model
        model.clear({silent: true})
        model.set(change.doc, {notOriginal: true})
      }
      else {
        // we're probably at app start, and haven't populated our collecitons yet, or this change has already happened on this server. just bail
        app.log.debug('db: changes: ignoring:', change.doc._id)
      }
    })
  })

  internals.feed.on('error', function(err){
    app.log.error('db: changes:', err)
  })
}

internals.install = function install(callback){
  internals.db.create(function(err){
    if (err){
      app.log.error('db: install:', err)
      callback(new Error(err.reason))
      throw new Error(err.reason)
    }

    internals.db.save('_design/backbone', {
      views: {
        collection: {
          map: function(doc){
            /*global emit */
            if (!doc.isDeleted && doc._id.indexOf('/') > -1) emit(doc._id.split('/')[0], doc)
          }
        }
      }
    }, function(err){
      if (err){
        app.log.error('db: install:', err)
        callback(new Error(err.reason))
        throw new Error(err.reason)
      }

      internals.feedSetup()
      internals.dbExists = true
      callback()
    })
  })
}

// expose private methods for testing
exports.internals = internals

exports.name = 'wheelhouse-couch'
exports.attach = function(opts){

  internals.options = _.defaults(opts || {}, {
    host: 'localhost'
    , port: 5984
    , name: ''
    , retries: 3
    , retryTimeout: 30 * 1000
    , cache: false
    , raw: false
    , getId: function(model){
      return _.result(model, 'url').substring(1)
    }
    , getCollectionName: function(collection){
      return _.result(collection, 'url').substring(1)
    }
  })

  app = this
  internals.connection = new(cradle.Connection)(internals.options)
  internals.db = internals.connection.database(internals.options.name)

  app.db = internals.db
  Backbone.sync = internals.sync
  this.Backbone = Backbone
}

exports.init = function(done){
  internals.db.exists(function dbExistsCallback(err, exists){
    if (err){
      app.log.error('db: install:', err)
      return done(err)
    }

    if (exists){
      app.log.info('db: config:', 'Connected to ' + internals.options.name)
      internals.dbExists = true
      internals.feedSetup()
      return done()
    }

    app.log.info('db: install:', 'CouchDB database ' + internals.options.name + ' did not exist; creating.')
    internals.install(done)
  })
}
