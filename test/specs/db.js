/*globals describe, it, after */
'use strict';
var App = require('../fixtures/app')
  , Backbone = require('backbone')
  , app = new App()
  , dbPlugin = require('../../index.js')
  , pkg = require('../../package.json')

describe('db', function(){
  it('attaches to a flatiron app', function(done){
    app.use(dbPlugin, {
      name: pkg.name + '-test'
      , callback: function(){
        dbPlugin.should.exist
        app.db.should.exist
        done()
      }
      , getId: function(model){
        return model.url().replace('/api/', '')
      }
      , getCollectionName: function(collection){
        return collection.url.replace('/api/', '')
      }
    })
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
    app.db.remove('first', function(err, res){
      res.ok.should.be.true
      done()
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

  after(function(done){
    app.db.destroy(done)
  })
})
