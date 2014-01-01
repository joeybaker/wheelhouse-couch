/*global describe, it, before, after, beforeEach, afterEach */
'use strict';

var chai = require('chai')
  // , expect = chai.expect
  , should = chai.should()
  , _ = require('lodash')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai')
  , plugin = require('../lib/db.js')
  , Backbone = require('backbone')
  , app = {}

chai.use(sinonChai)

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

      plugin.internals.feed = {
        resume: sinon.stub()
        , pause: sinon.stub()
      }
    })

    afterEach(function(done){
      // enusre the call stack is clear
      // we have tests that will do async operations that we don't need to wait for to complete the test, but they'll run anyway, so we'll just ensure we're in an isoated environment for all tests
      setTimeout(done, 4)
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

    describe('create', function(){
      beforeEach(function(){
        sinon.stub(plugin.internals, 'getUUID')
          .yields('uuid')
        sinon.stub(plugin.internals.db, 'save')
      })

      afterEach(function(){
        plugin.internals.getUUID.restore()
        plugin.internals.db.save.restore()
      })

      it('creates an id with the collection name', function(){
        fn('create', model)
        plugin.internals.db.save.should.have.been.calledWith('model/uuid')
      })

      it('pauses the feed', function(){
        fn('create', model)
        plugin.internals.feed.pause.should.have.been.calledOnce
      })

      it('inserts into the db', function(){
        plugin.internals.db.save.yields(null, {ok: true})
        fn('create', model)
        plugin.internals.db.save.should.have.been.calledOnce
        plugin.internals.db.save.should.have.been.calledWith('model/uuid', model.toJSON())
      })

      it('logs on error', function(){
        var error = {error: 'error', reason: 'reason'}
        plugin.internals.db.save.yields(error)
        fn('create', model)
        app.log.error.should.have.been.calledOnce
      })

      it('calls error with the error response', function(){
        var options = {
            error: sinon.stub()
          }
          , error = {error: 'error', reason: 'reason'}

        plugin.internals.db.save.yields(error)
        fn('create', model, options)
        options.error.should.have.been.calledOnce
        options.error.should.have.been.calledWith(error)
      })

      it('retries if the res didn\'t return `ok`', function(done){
        var options = {
            success: function(){
              plugin.internals.db.save.should.have.been.calledOnce
              done()
            }
          }

        plugin.internals.db.save.yieldsAsync(null, {ok: false})
        fn('create', model, options)

        plugin.internals.db.save.should.have.been.calledOnce

        plugin.internals.db.save.restore()
        sinon.stub(plugin.internals.db, 'save')
          .yieldsAsync(null, {ok: true})
      })

      it('logs on success', function(){
        plugin.internals.db.save.yields(null, {ok: true})

        fn('create', model)
        app.log.info.should.have.been.calledOnce
      })

      it('calls success with the `_rev` and `_id`', function(){
        var options = {
          success: sinon.spy()
        }

        plugin.internals.db.save.yields(null, {ok: true, rev: 1, id: 'id'})

        fn('create', model, options)

        options.success.should.have.been.calledWith({_rev: 1, _id: 'id'})
      })

      it('resumes the feed after the stack has cleared', function(done){
        plugin.internals.db.save.yields(null, {ok: true, rev: 1, id: 'id'})

        fn('create', model)

        setImmediate(function(){
          plugin.internals.feed.resume.should.have.been.calledOnce
          done()
        })
      })
    })

    describe('update', function(){
      var model
        , defaults

      beforeEach(function(){
        defaults = {
          value: true
          , value2: 'testing'
          , _id: _.uniqueId('syncUpdate')
          , _rev: 1
        }

        model = new (Backbone.Model.extend({
          idAttribute: '_id'
          , urlRoot: '/model'
          , defaults: defaults
        }))()

        sinon.stub(plugin.internals.db, 'get')
        sinon.stub(plugin.internals.db, 'save')
      })

      afterEach(function(){
        plugin.internals.db.get.restore()
        plugin.internals.db.save.restore()
      })

      it('gets the model from the db', function(){
        fn('update', model)
        plugin.internals.db.get.should.have.been.calledOnce
      })

      it('logs on a get error', function(){
        plugin.internals.db.get.yields({error: 'error', reason: 'reason'})
        fn('update', model)
        app.log.error.should.have.been.calledOnce
      })

      it('calls the error callback with the error on a get error', function(){
        var options = {
          error: sinon.stub()
        }
        plugin.internals.db.get.yields({error: 'error', reason: 'reason'})
        fn('update', model, options)
        options.error.should.have.been.calledOnce
      })

      it('pauses the feed', function(){
        plugin.internals.db.get.yields(null, {})
        fn('update', model)
        plugin.internals.feed.pause.should.have.been.calledOnce
      })

      it('inserts into the db with merged attributes', function(){
        var newModel

        plugin.internals.db.get.yields(null, defaults)
        model.set({value: false})
        fn('update', model)

        newModel = _.extend({}, defaults, model.toJSON(), {_rev: defaults._rev})
        plugin.internals.db.save.should.have.been.calledWith(model.id, defaults._rev, newModel)
      })

      it('inserts into the db with the most recent `_rev`', function(){
        var newModel

        defaults._rev = 10

        plugin.internals.db.get.yields(null, defaults)
        model.set({value: false})
        fn('update', model)

        newModel = _.extend({}, defaults, model.toJSON(), {_rev: defaults._rev})
        newModel._rev.should.equal(defaults._rev)
        plugin.internals.db.save.should.have.been.calledWith(model.id, defaults._rev, newModel)
      })

      it('retries on a conflict error', function(done){
        var options = {
          success: function(){
            options.success.should.have.been.calledOnce
            options.success.should.have.been.calledWith({_rev: 2})
            done()
          }
          , error: function(err){
            should.not.exist(err)
            done()
          }
        }
        sinon.spy(options, 'success')
        model.set({value: false})

        plugin.internals.db.get.yields(null, defaults)
        // the inital save will throw an error
        plugin.internals.db.save.yieldsAsync({error: 'conflict'})

        fn('update', model, options)

        // our next attemp to save will suceeed
        plugin.internals.db.save.restore()
        sinon.stub(plugin.internals.db, 'save')
          .yieldsAsync(null, {
            doc: _.extend(defaults, model.toJSON, {_rev: 2})
            , rev: 2
            , ok: true
            , id: model.id
          })
      })

      it('calls the error callback with the error on a insert error', function(){
        var err = {error: 'err', reason: 'reason'}
          , options = {
            error: sinon.stub()
          }

        plugin.internals.db.get.yields(null, defaults)
        plugin.internals.db.save.yields(err)
        fn('update', model, options)
        options.error.should.have.been.calledOnce
        options.error.should.have.been.calledWith(err)
      })

      it('retries on a null response', function(done){
        plugin.internals.db.get.yields(null, defaults)
        plugin.internals.db.save.yieldsAsync(null, {})
        fn('update', model, {
          success: function(){
            done()
          }
        })
        plugin.internals.feed.pause.should.have.been.called.twice

        plugin.internals.db.save.restore()
        sinon.stub(plugin.internals.db, 'save').yieldsAsync(null, {ok: true, rev: 2, id: defaults.id})
      })

      it('logs a success', function(){
        plugin.internals.db.get.yields(null, defaults)
        plugin.internals.db.save.yields(null, {ok: true, rev: 2, id: defaults.id})

        fn('update', model)

        app.log.info.should.have.been.calledOnce
      })

      it('calls the success callback with the new `_rev`', function(){
        plugin.internals.db.get.yields(null, defaults)
        plugin.internals.db.save.yields(null, {ok: true, rev: 2, id: defaults.id})

        fn('update', model, {
          success: function(res){
            res._rev.should.equal(2)
          }
        })
      })

      it('resumes the feed after the stack has cleared', function(done){
        plugin.internals.db.get.yields(null, defaults)
        plugin.internals.db.save.yields(null, {ok: true, rev: 2, id: defaults.id})
        fn('update', model)

        setImmediate(function(){
          plugin.internals.feed.resume.should.have.been.calledOnce
          done()
        })
      })
    })

    describe('delete', function(){
      beforeEach(function(){
        sinon.stub(plugin.internals.db, 'save')
        sinon.spy(plugin.internals, 'sync')
      })

      afterEach(function(){
        plugin.internals.db.save.restore()
        plugin.internals.sync.restore()
      })

      it('updates the model with the `isDeleted` attribute', function(){
        fn('delete', model)
        model.toJSON().should.include.keys('isDeleted')
        model.get('isDeleted').should.be.true
      })

      it('calls sync as an update with updated model', function(){
        fn('delete', model)
        plugin.internals.sync.should.have.been.called.twice
        model.attributes.isDeleted = true
        plugin.internals.sync.should.have.been.calledWith('update', model)
      })
    })
  })

  describe('#feedSetup', function(){
    var fn = plugin.internals.feedSetup
      , Events = require('events').EventEmitter
      , change

    before(function(){
      // call attach so that app is avaliable in the plugin
      plugin.attach.call(app)
    })

    beforeEach(function(){
      plugin.internals.db = {
        changes: sinon.stub().returns(new Events())
      }

      change = {
        doc: {
          _id: ''
        }
      }
    })

    afterEach(function(){
      delete plugin.internals.db
      delete plugin.internals.feed
    })

    it('creates a follow instance on `internals.feed`', function(){
      fn()
      plugin.internals.db.changes.should.have.been.calledOnce
      should.exist(plugin.internals.feed)
    })

    describe('on update', function(){
      beforeEach(function(){
        fn()
      })

      afterEach(function(){
        delete plugin.internals.feed
        delete app.collections
      })

      describe('no collection found', function(){
        it('bails with no `app.collections`', function(){
          plugin.internals.feed.emit('change', change)
          app.log.debug.should.have.been.calledOnce
          app.log.debug.should.have.been.calledWith('db: changes: ignoring: no collection found')
        })

        it('bails if the collection can\'t be found', function(){
          app.collections = {}
          plugin.internals.feed.emit('change', change)
          app.log.debug.should.have.been.calledOnce
          app.log.debug.should.have.been.calledWith('db: changes: ignoring: no collection found')
        })
      })

      describe('collection found', function(){
        var id = 'feed/uuid'

        beforeEach(function(){
          app.collections = {}
          app.collections.feed = new (Backbone.Collection.extend({
            model: Backbone.Model.extend({
              idAttribute: '_id'
            })
          }))()
          change.doc._id = id
        })

        afterEach(function(){
          delete app.collections
        })

        it('removes from the collection on a delete', function(done){
          change.deleted = true
          app.collections.feed.add({_id: id, _rev: '2'})
          sinon.spy(app.collections.feed, 'remove')

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            app.collections.feed.remove.should.have.been.calledOnce
            done()
          })
        })

        it('removes from the collection on a faux delete', function(done){
          change.doc.isDeleted = true
          app.collections.feed.add({_id: id, _rev: '2'})
          sinon.spy(app.collections.feed, 'remove')

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            app.collections.feed.remove.should.have.been.calledOnce
            done()
          })
        })

        it('adds when this is the first _rev', function(done){
          change.doc._rev = '1'

          sinon.spy(app.collections.feed, 'add')

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            app.collections.feed.add.should.have.been.calledOnce
            done()
          })
        })

        it('updates when the _rev doesn\'t match', function(done){
          change.doc._rev = '3'

          app.collections.feed.add({_id: id, _rev: '2'})
          sinon.spy(app.collections.feed.first(), 'set')

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            // once to clear, and once to set the new attributes
            app.collections.feed.first().set.should.have.been.called.twice
            done()
          })
        })

        it('removes attributes from the model that were removed from the doc', function(done){
          change.doc._rev = '3'

          app.collections.feed.add({_id: id, _rev: '2', value: true})

          sinon.spy(app.collections.feed.first(), 'set')
          sinon.spy(app.collections.feed.first(), 'clear')

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            // once to clear, and once to set the new attributes
            app.collections.feed.first().clear.should.have.been.called.twice
            app.collections.feed.first().set.should.have.been.called.twice
            should.not.exist(app.collections.feed.first().get('value'))
            done()
          })
        })

        it('ignores in all other cases', function(done){
          change.doc._rev = '2'

          app.collections.feed.add({_id: id, _rev: '2'})

          plugin.internals.feed.emit('change', change)

          process.nextTick(function(){
            app.log.debug.should.have.been.calledOnce
            app.log.debug.should.have.been.calledWith('db: changes: ignoring:')
            done()
          })
        })
      })
    })

    describe('on error', function(){
      beforeEach(function(){
        fn()
      })

      afterEach(function(){
        delete plugin.internals.feed
      })

      it('logs on error', function(){
        plugin.internals.feed.emit('error')
        app.log.error.should.have.been.calledOnce
      })
    })
  })

  describe('#install', function(){
    it('creates the db')
    it('logs on create error')
    it('saves the view')
    it('logs on save error')
    it('listens to the changes feed')
    it('sets that the db exists')
  })

  describe('#attach', function(){})
  describe('#init', function(){})
})
