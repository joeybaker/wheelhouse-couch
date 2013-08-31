/*global describe, it, after, before */
'use strict';

describe('db', function(){
  var Backbone = require('backbone')
    , App = require('./fixtures/app')
    , app = new App()
    , dbPlugin = require('../index.js')
    , pkg = require('../package.json')
    , chai = require('chai')
    , should = chai.should()

  before(function(done){
    app.use(dbPlugin, {
      name: pkg.name + '-test'
      , getId: function(model){
        return model.url().replace('/api/', '')
      }
      , getCollectionName: function(collection){
        return collection.url.replace('/api/', '')
      }
    }, done)
  })

  it('defaults options to app.config.db')

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

  describe('Backbone Sync', function(){
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

    it('can save a collection to the db', function(done){
      testers.create({
        name: 'testing a name'
      }, {
        success: function(model, res){
          res.id.should.be.a('string')
          model.get('name').should.equal('testing a name')
          done()
        }
        , error: function(model, xhr){
          console.error(xhr)
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
        , error: function(model, xhr){
          console.error(xhr)
        }
      })
    })
    it('can fetch a collection', function(done){
      testers.reset()
      testers.length.should.equal(0)
      testers.fetch({
        success: function(collection){
          collection.first().get('name').should.equal('testing again')
          done()
        }
        , error: function(model, xhr){
          console.error(xhr)
        }
      })
    })
    it('can delete a model', function(done){
      testers.first().destroy({
        success: function(model, res){
          res._rev.should.exist
          done()
        }
        , error: function(model, xhr){
          console.error(xhr)
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

          app.db.merge(model.get('_id'), {value: 2}, function(err, res){
            res.ok.should.be.ok
            // syncing isn't immediate. give it time to process
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
          collection.get(doc._id).get('value').should.equal('first')
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
