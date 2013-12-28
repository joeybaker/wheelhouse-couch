/*global describe, it, before, beforeEach, afterEach */
'use strict';

var chai = require('chai')
  // , expect = chai.expect
  , _ = require('lodash')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai')
  , plugin = require('../lib/db.js')
  , Backbone = require('backbone')

chai.use(sinonChai)
chai.should()

describe('db unit tests', function(){
  before(function(){
    // fake the log
    plugin.internals.log = {
      debug: function(){}
      , info: function(){}
      , warn: function(){}
      , error: function(){}
    }
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

  describe('#getUUID', function(){

  })
})
