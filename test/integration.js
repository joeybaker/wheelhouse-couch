/*global describe, it, after, before, beforeEach, afterEach */
'use strict';

describe('db integration tests', function(){
  var Backbone = require('backbone')
    , request = require('request')
    , App = require('./fixtures/app')
    , app = new App()
    , _ = require('lodash')
    , dbPlugin = require('../index.js')
    , pkg = require('../package.json')
    , chai = require('chai')
    , should = chai.should()

  before(function(done){
    // ensure our test user is created
    request.put({
      url: 'http://admin:test@localhost:5984/_config/admins/test'
      , json: 'test'
    }, function(){
      app.use(dbPlugin, {
        name: pkg.name + '-test'
        , getId: function(model){
          return model.url().replace('/api/', '')
        }
        , getCollectionName: function(collection){
          return collection.url.replace('/api/', '')
        }
        , auth: {username: 'test', password: 'test'}
      })
      app.options.log = {console: {silent: true}}
      app.start(8999, done)
    })
  })

  it('attaches to a flatiron app', function(){
    dbPlugin.should.exist
    app.db.should.exist
  })

  it('has a database', function(done){
    app.db.exists(function(err, exists){
      exists.should.be.true
      done()
    })
  })

  it('can write data', function(done){
    app.db.save('first', {value: 1}, function(err, res){
      res.ok.should.be.ok
      done()
    })
  })

  it('can update data', function(done){
    app.db.merge('first', {value: 2, second: true}, function(err, res){
      res.ok.should.be.true
      done()
    })
  })

  it('can read data', function(done){
    app.db.get('first', function(err, res){
      res.value.should.equal(2)
      res.second.should.be.true
      done()
    })
  })

  it('can delete data', function(done){
    app.db.get('first', function(err, res){
      should.not.exist(err)
      app.db.remove('first', res._rev, function(err, res){
        res.ok.should.be.true
        done()
      })
    })
  })

  describe('Backbone.Sync', function(){
    var Model = Backbone.Model.extend({
      defaults: {
        name: null
        , value: null
      }
      , idAttribute: '_id'
    })
    , Collection = Backbone.Collection.extend({
      model: Model
      , url: '/api/testers'
    })
    , testers = new Collection()

    beforeEach(function(done){
      testers.url = '/api/testers' + _.uniqueId()
      testers.create({name: 'test', value: true}, {
        success: function(){
          done()
        }
      })
    })

    afterEach(function(){
      testers.reset()
    })

    it('can save a collection to the db', function(done){
      testers.create({
        name: 'testing a name'
      }, {
        success: function(model, res){
          res.id.should.be.a('string')
          model.get('name').should.equal('testing a name')
          done()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
        }
      })
    })

    it('can update a model', function(done){
      testers.first().save({name: 'testing again'}, {
        success: function(model, res){
          model.get('name').should.equal('testing again')
          res._rev.should.exist
          done()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
        }
      })
    })

    it('errors when trying to modify `createdAt`', function(done){
      testers.first().save({name: 'testing again', createdAt: 'date'}, {
        success: function(model, res){
          should.not.exist(model)
          should.not.exist(res)
          done()
        }
        , error: function(model, err){
          should.exist(err)
          err.should.be.a.string
          done()
        }
      })
    })

    it('retries on a document update conflict', function(done){
      var end = _.after(2, done)

      testers.first().save({name: 'testing again'}, {
        success: function(model, res){
          model.get('name').should.equal('testing again')
          res._rev.should.exist
          end()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
          end()
        }
        , wait: false
      })

      testers.first().save({name: 'testing again'}, {
        success: function(model, res){
          model.get('name').should.equal('testing again')
          res._rev.should.exist
          end()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
          end()
        }
        , wait: false
      })
    })

    it('can fetch a collection', function(done){
      testers.reset()
      testers.length.should.equal(0)
      testers.fetch({
        success: function(collection){
          collection.first().get('name').should.equal('test')
          done()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
        }
      })
    })

    it('can delete a model', function(done){
      testers.first().destroy({
        success: function(model, res){
          res._rev.should.exist
          done()
        }
        , error: function(model, err){
          should.not.exist(model)
          should.not.exist(err)
        }
      })
    })

    it('can fetch an empty collection', function(done){
      var EmptyCollection = Backbone.Collection.extend({
          model: Model
          , url: '/api/emptyCollection'
        })
        , emptyCollection = new EmptyCollection()

      emptyCollection.fetch({
        error: function(collection, err){
          should.not.exist(err)
        }
        , success: function(){
          done()
        }
      })
    })
  })

  describe('keeping multiple servers in sync', function(){

    it('keeps models updated', function(done){
      var Model = Backbone.Model.extend({
          idAttribute: '_id'
        })
        , Collection = Backbone.Collection.extend({
          url: '/api/changes'
          , model: Model
        })
        , collection = new Collection()

      app.collections = {}
      app.collections.changes = collection

      collection.create({value: 'first'}, {
        success: function(model){
          should.exist(model.get('_id'))

          app.db.save(model.get('_id'), model.get('_rev'), _.extend({}, model.toJSON(), {value: 2}), function(err, res){
            res.ok.should.be.ok

            // syncing isn't immediate.
            setTimeout(function(){
              collection.first().get('value').should.equal(2)
              done()
            }, 10)
          })
        }
      })
    })

    it('pulls in new models from a different server', function(done){
      var Model = Backbone.Model.extend({
          idAttribute: '_id'
        })
        , Collection = Backbone.Collection.extend({
          url: '/api/serverTest'
          , model: Model
        })
        , collection = new Collection()

      app.collections = {}
      app.collections.serverTest = collection

      // save to the db (as if from another server)
      app.db.save('serverTest/1', {value: 'first'}, function(err, doc){
        should.not.exist(err)
        setTimeout(function(){
          // check this server's list of models to see if we got it
          app.collections.serverTest.get(doc._id).get('value').should.equal('first')
          done()
        }, 300)
      })
    })
  })

  after(function(done){
    app.db.destroy(function(){
      app.server.close(done)
    })
  })
})
