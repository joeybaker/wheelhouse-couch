'use strict';
module.exports = function(grunt){
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json')
    , meta: {
      version: '<%= pkg.version %>'
      , banner: '/*! <%= pkg.name %> - v<%= meta.version %> - ' +
        '<%= grunt.template.today("yyyy-mm-dd") %>\n'
    }
    , jshint: {
      all: [
        'Gruntfile.js'
        , 'index.js'
        , 'lib/**/*.js'
        , 'test/**/*.js'
      ]
      , options: {
        jshintrc: '.jshintrc'
      }
    }
    , bump: {
      patch: {
        options: {
          part: 'patch'
        }
        , src: [
          'package.json'
        ]
      }
      , minor: {
        options: {
          part: 'minor'
        }
        , src: '<%= bump.patch.src %>'
      }
      , major: {
        options: {
          part: 'major'
        }
        , src: '<%= bump.patch.src %>'
      }
    }
    , simplemocha: {
      options: {
        timeout: 2000
        , ignoreLeaks: true
        // , globals: ['chai']
        , ui: 'bdd'
        // , reporter: 'min'
      }
      , all: {
        src: ['test/specs/**/*.js']
      }
    }
  })

  grunt.loadNpmTasks('grunt-contrib-jshint')
  grunt.loadNpmTasks('grunt-simple-mocha')
  grunt.loadNpmTasks('grunt-notify')
  grunt.loadNpmTasks('grunt-bumpx')

  grunt.registerTask('test', ['simplemocha'])
  grunt.registerTask('publish', ['simplemocha', 'bump:patch'])
}
