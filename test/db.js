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
      , callback: function(){
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
    it.only('keeps updated', function(done){
      var Collection = Backbone.Collection.extend({
          url: '/changes'
        })
        , collection = new Collection()

      collection.create({value: 'first'}, {
        success: function(model){
          should.exist(model.get('_id'))

          app.db.merge(model.get('_id'), {value: 2}, function(err, res){
            res.ok.should.be.ok
            setTimeout(function(){
              collection.first().get('value').should.equal(2)
              done()
            }, 50)
          })
        }
      })
    })
  })

  after(function(done){
    setTimeout(function(){
      app.db.destroy(function(){
        app.server.close(done)
      })
    }, 30)
  })
})
