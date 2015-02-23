/* jshint ignore:start */

module.exports = function (grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON( 'package.json' ),
        bower: grunt.file.readJSON( 'bower.json' ),
                     
        pure_cjs: {
            dist: {
                files: {
                    'dist/<%= pkg.name %>.js' : 'lib/browser.js'
                },
                options: {
                    map : true,
                    exports: 'FutoInExecutor',
                    external : {
                        'futoin-asyncsteps' : {
                            'global' : '$as',
                            'amd' : 'futoin-asyncsteps'
                        },
                        'futoin-invoker' : {
                            'global' : 'FutoInInvoker',
                            'amd' : 'futoin-invoker'
                        }
                    }
                }
            },
            unittest: {
                files: {
                    'dist/unittest.js' : 'test/unittest.js',
                    'dist/integration_test.js' : 'test/integration.js'
                },
                options: {
                    map : true,
                    exports: 'unittest',
                    external : {
                        'chai' : true,
                        'futoin-asyncsteps' : {
                            'global' : '$as',
                            'amd' : 'futoin-asyncsteps'
                        },
                        'futoin-invoker' : {
                            'global' : 'FutoInInvoker',
                            'amd' : 'futoin-invoker'
                        }
                    }
                }
            }
        },
        uglify: {
            dist: {
                files: {
                    'dist/futoin-executor.min.js' : [ 'dist/futoin-executor.js' ]
                }
            }
        },
        connect: {
            server: {
                options: {
                    port: 8000,
                    base: '.',
                }
            }
        },
        external_daemon: {
            unittest: {
                cmd:  'node',
                args: ['test/node_server.js'],
                options: {
                    startCheck: function(stdout, stderr) {
                        return /LISTENING/.test(stdout);
                    }
                }
            }
        },
        mocha_phantomjs: {
            all: {
                options: {
                    urls: [
                        'http://localhost:8000/test/unittest.html'
                    ]
                }
            }
        },
        npm: {
            test: {
                args: ["test"]
            }
        },
        release: {
            options: {
                additionalFiles: [
                    'bower.json'
                ],
                commitFiles: [
                    'package.json',
                    'bower.json'
                ],
                tagName: "v<%= version %>",
                commitMessage: 'Updated for release v<%= version %>',
                tagMessage: 'Release v<%= version %>',
                npm: false
            }
        },
        sync: {
            all: {
                options: {
                    sync: ['name', 'version','description','license','keywords','homepage','repository'],
                    overrides: {
                        main: "dist/futoin-executor.js"
                    },
                    from: 'package.json',
                    to: 'bower.json'
                }
            }
        },
        jsdoc2md: {
            README: {
                src: "lib/*.js",
                dest: "README.md",
                options: {
                    template: 'misc/README.hbs',
                    private: false
                }
            }
        },
        replace: {
            README: {
                src: "README.md",
                overwrite: true,
                replacements: [{
                    from: "$$pkg.version$$",
                    to: "<%= pkg.version %>"
                }]
            }
        }
    });
    
    grunt.loadNpmTasks( 'grunt-pure-cjs' );
    grunt.loadNpmTasks( 'grunt-contrib-uglify' );
    grunt.loadNpmTasks( 'grunt-contrib-connect' );
    grunt.loadNpmTasks( 'grunt-external-daemon' );
    grunt.loadNpmTasks( 'grunt-mocha-phantomjs' );
    grunt.loadNpmTasks( 'grunt-npm-helper' );
    grunt.loadNpmTasks( 'grunt-release' );
    grunt.loadNpmTasks( 'grunt-npm2bower-sync' );
    grunt.loadNpmTasks( 'grunt-jsdoc-to-markdown' );
    grunt.loadNpmTasks( 'grunt-text-replace' );

    grunt.registerTask( 'build-browser', ['pure_cjs','uglify'] );
    grunt.registerTask( 'test-browser', ['connect', 'mocha_phantomjs'] );
    
    grunt.registerTask( 'node', [ 'npm:test' ] );
    grunt.registerTask( 'browser', ['build-browser','test-browser'] );
    
    grunt.registerTask( 'doc', [ 'jsdoc2md', 'replace:README' ] );

    grunt.registerTask( 'default', ['sync','node','browser','doc'] );
};