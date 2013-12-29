/*global describe, it, before, beforeEach, afterEach */
'use strict';

var chai = require('chai')
  // , expect = chai.expect
  , _ = require('lodash')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai')
  , plugin = require('../lib/db.js')
  , Backbone = require('backbone')
  , app = {}

chai.use(sinonChai)
chai.should()

describe('db unit tests', function(){
  beforeEach(function(){
    // fake the log
    app.log = {
      debug: sinon.stub()
      , info: sinon.stub()
      , warn: sinon.stub()
      , error: sinon.stub()
    }
  })

  afterEach(function(){
    _.each(app.log, function(stub){
      stub.reset()
    })
  })

  describe('#toJSON', function(){
    var fn = plugin.internals.toJSON
      , model

    beforeEach(function(){
      model = new (Backbone.Model.extend({
        defaults: {
          value: 1
          , value2: 'string'
          , value3: false
        }
      }))()
    })

    it('is attached to the plugin', function(){
      fn.should.be.a.function
    })

    it('returns json', function(){
      fn(model).should.be.an.object
      JSON.stringify(fn(model)).should.not.throw
    })

    it('always as an `_id` attribute', function(){
      // set an id which is the default idAttribute
      model.set({id: 'id'})
      fn(model).should.include.keys('_id')
      fn(model)._id.should.equal('id')
      // change the idAttribute
      model.idAttribute = 'value'
      // call a set so that model.id can be defined
      model.set({value: 'value'})
      fn(model)._id.should.equal('value')
    })
  })

  describe('#getUUIDList', function(){
    var uuids = []
      , fn
      , uuidStub

    for (var i = 0; i < 100; i++){
      uuids.push(_.uniqueId('getUUIDList'))
    }

    beforeEach(function(){
      plugin.internals.connection = {uuids: function(){}}
      uuidStub = sinon.stub(plugin.internals.connection, 'uuids')
      fn = sinon.spy(plugin.internals, 'getUUIDList')
    })

    afterEach(function(){
      plugin.internals.uuids = []
      uuidStub.restore()
      fn.restore()
    })

    it('gets a list of 100 uuids', function(done){
      uuidStub.callsArgWith(1, null, uuids)
      fn(function(res){
        res.should.deep.equal(uuids)
        done()
      })
    })

    it('retrys on a failure', function(done){
      uuidStub.callsArgWith(1, null, [])
      fn(function(res){
        fn.should.have.been.called.twice
        res.should.deep.equal(uuids)
        done()
      })
      uuidStub.restore()
      uuidStub = sinon.stub(plugin.internals.connection, 'uuids')
        .callsArgWith(1, null, uuids)
    })
  })

  describe('#getUUID', function(){
    var uuids
      , fn

    beforeEach(function(){
      uuids = ['uuid1', 'uuid2', 'uuid3']
      fn = plugin.internals.getUUID
      sinon.stub(plugin.internals, 'getUUIDList')
        .yields(uuids)
    })

    afterEach(function(){
      plugin.internals.uuids = []
      plugin.internals.getUUIDList.restore()
    })

    it('saves the uuid list to internals', function(done){
      fn(function(){
        plugin.internals.uuids.should.deep.equal(uuids)
        done()
      })
    })

    it('calls getUUIDList if there are no stored UUIDs', function(done){
      plugin.internals.uuids = []
      fn(function(){
        plugin.internals.getUUIDList.should.have.been.calledOnce
        plugin.internals.uuids.should.deep.equal.uuids
        done()
      })
    })

    it('returns a single uuid', function(){
      fn(function(uuid){
        uuid.should.equal('uuid3')
      })
    })
  })

  describe('#sync', function(){
    var fn
      , model
      , collection

    before(function(){
      // call attach so that app is avaliable in the plugin
      plugin.attach.call(app)
    })

    beforeEach(function(){
      // fake that we have a db
      plugin.internals.dbExists = true
      fn  = plugin.internals.sync
      model = new (Backbone.Model.extend({
        idAttribute: '_id'
        , urlRoot: '/model'
      }))()
      collection = new (Backbone.Collection.extend({
        url: '/collection'
      }))()
    })

    it('logs an error if the db doesn\'t exist', function(){
      plugin.internals.dbExists = false
      fn('read', model)
      app.log.error.should.have.been.calledOnce
    })

    describe('read', function(){
      describe('model', function(){
        var getStub

        beforeEach(function(){
          getStub = sinon.stub(plugin.internals.db, 'get')
          model.set({_id: 1})
        })

        afterEach(function(){
          getStub.restore()
        })

        it('operates only on models with an id', function(){
          model.id.should.equal(1)
          fn('read', model)
          getStub.should.have.been.calledOnce
        })

        it('gets from the database', function(){
          fn('read', model)
          getStub.should.have.been.calledOnce
        })

        it('calls success with the doc', function(){
          var success = sinon.spy()
            , doc = {_id: 1, _rev: 2, value: 2}
            , options = {success: success}
          getStub.yields(null, doc)

          fn('read', model, options)

          success.should.have.been.calledOnce
          success.should.have.been.calledWith(doc)
        })

        it('logs errors', function(){
          var error = {error: 'err', reason: 'reason'}
          getStub.yields(error)
          fn('read', model)
          app.log.error.should.have.been.calledOnce
        })

        it('calls error with the error response on error', function(){
          var options = {
            error: sinon.stub()
          }
          , error = {error: 'err', reason: 'reason'}
          getStub.yields(error)

          fn('read', model, options)

          options.error.should.have.been.calledOnce
          options.error.should.have.been.calledWith(error)
        })
      })

      describe('collection', function(){
        var viewStub

        beforeEach(function(){
          viewStub = sinon.stub(plugin.internals.db, 'view')
        })

        afterEach(function(){
          viewStub.restore()
        })

        it('operates only on "models" without an id', function(){
          fn('read', collection)
          viewStub.should.have.been.calledOnce
        })

        it('uses the backbone/colleciton view to get models', function(){
          fn('read', collection)
          viewStub.should.have.been.calledWith('backbone/collection', {key: 'collection'})
        })

        it('calls success with the collection models', function(){
          var options = {
              success: sinon.stub()
            }
            , res = {
              rows: [
                {value: {_id: 1, _rev: 1, value: true}}
                , {value: {_id: 2, _rev: 1, value: true}}
              ]
            }

          viewStub.yields(null, res)

          fn('read', collection, options)

          options.success.should.have.been.calledWith([res.rows[0].value, res.rows[1].value])
        })

        it('logs errors', function(){
          var options = {
              error: sinon.stub()
            }
            , error = {error: 'err', reason: 'reason'}

          viewStub.yields(error)

          fn('read', collection, options)

          app.log.error.should.have.been.calledOnce
        })

        it('calls error with the error response on error', function(){
          var options = {
              error: sinon.stub()
            }
            , error = {error: 'err', reason: 'reason'}

          viewStub.yields(error)

          fn('read', collection, options)

          options.error.should.have.been.calledWith(error)

        })
      })
    })
    describe('update', function(){})
    describe('create', function(){
      before(function(){
        sinon.stub(plugin.internals, 'getUUID')
          .yields(_.uniqueId('uuid'))
      })

      after(function(){
        plugin.internals.getUUID.restore()
      })

      it('creates an id with the collection name ')
      it('pauses the feed')
      it('inserts into the db')
      it('logs on error')
      it('calls error with the error response')
      it('retries if the res didn\'t return `ok`')
      it('logs on success')
      it('calls success with the `_rev` and `_id`')
      it('resumes the feed after the stack has cleared')
    })
    describe('delete', function(){})
  })

  describe('#feedSetup', function(){})
  describe('#install', function(){})
  describe('#attach', function(){})
  describe('#init', function(){})
})
