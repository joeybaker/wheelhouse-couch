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
    , shell: {
      gitTag: {
        command: 'git tag v<%= grunt.file.readJSON("package.json").version %>'
        , options: {
          stderr: true
          , stdout: true
          , failOnError: true
        }
      }
      , gitCommitPackage: {
        command: 'git commit --amend -i package.json --reuse-message HEAD'
        , options: {
          stderr: true
          , stdout: true
          , failOnError: true
        }
      }
      , gitPush: {
        command: 'git push origin master --tags'
        , options: {
          stderr: true
          , stdout: true
          , failOnError: true
        }
      }
      , npmPublish: {
        command: 'npm publish'
        , options: {
          stderr: true
          , stdout: true
          , failOnError: true
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-contrib-jshint')
  grunt.loadNpmTasks('grunt-simple-mocha')
  grunt.loadNpmTasks('grunt-notify')
  grunt.loadNpmTasks('grunt-shell')
  grunt.loadNpmTasks('grunt-bumpx')

  grunt.registerTask('test', ['simplemocha'])
  grunt.registerTask('publish', ['simplemocha', 'bump:patch', 'shell:gitCommitPackage', 'shell:gitTag', 'shell:gitPush', 'shell:npmPublish'])
}
