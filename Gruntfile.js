'use strict';

var fs = require( 'fs' );

module.exports = function( grunt ) {
    grunt.initConfig( {
        pkg: grunt.file.readJSON( 'package.json' ),

        eslint: {
            options: { fix: true,
                ignore: false },
            target: [ '*.js', 'lib/**/*.js', 'test/**/*.js' ],
        },
        mocha_istanbul: {
            coverage: {
                src: [
                    'test/integration.js',
                    'test/unittest.js',
                    'test/limittest.js',
                ],
            },
            options: {
                mochaOptions: [ '--exit' ],
            },
        },
        istanbul_check_coverage: {},
        webpack: {
            dist: require( './webpack.dist' ),
            test: require( './webpack.test' ),
        },
        babel: {
            options: {
                sourceMap: true,
                presets: [ 'env' ],
                plugins: [ "transform-object-assign" ],
            },
            es5: {
                expand: true,
                src: [
                    "lib/**/*.js",
                    "test/*.js",
                    "BasicAuthFace.js",
                    "BasicAuthService.js",
                    "BrowserExecutor.js",
                    "ChannelContext.js",
                    "DerivedKey.js",
                    "Executor.js",
                    "LegacySecurityProvider.js",
                    "NodeExecutor.js",
                    "PingService.js",
                    "RequestInfo.js",
                    "SecurityProvider.js",
                    "SourceAddress.js",
                    "UserInfo.js",
                ],
                dest: 'es5/',
            },
        },
        connect: {
            server: {
                options: {
                    port: 8000,
                    base: '.',
                    useAvailablePort: true,
                },
            },
        },
        mocha_phantomjs: {
            all: {
                options: {
                    urls: [
                        //'--ignore-resource-errors',
                        'http://localhost:8000/test/unittest.html',
                    ],
                },
            },
        },
        jsdoc2md: {
            README: {
                src: [ '*.js', 'lib/**/*.js' ],
                dest: "README.md",
                options: { template: fs.readFileSync( 'misc/README.hbs', 'utf8' ) },
            },
        },
        replace: {
            README: {
                src: "README.md",
                overwrite: true,
                replacements: [
                    {
                        from: "$$pkg.version$$",
                        to: "<%= pkg.version %>",
                    },
                ],
            },
        },
    } );

    grunt.loadNpmTasks( 'grunt-eslint' );
    grunt.loadNpmTasks( 'grunt-babel' );
    grunt.loadNpmTasks( 'grunt-webpack' );
    grunt.loadNpmTasks( 'grunt-contrib-connect' );
    grunt.loadNpmTasks( 'grunt-mocha-phantomjs' );
    grunt.loadNpmTasks( 'grunt-mocha-istanbul' );

    grunt.registerTask( 'check', [ 'eslint' ] );

    grunt.registerTask( 'build-browser', [ 'babel', 'webpack:dist' ] );
    grunt.registerTask( 'test-browser', [ 'webpack:test', 'connect', 'mocha_phantomjs' ] );

    grunt.registerTask( 'node', [ 'mocha_istanbul' ] );
    grunt.registerTask( 'browser', [ 'build-browser', 'test-browser' ] );
    grunt.registerTask( 'test', [
        'check',
        'node',
        'browser',
        'doc',
    ] );

    grunt.loadNpmTasks( 'grunt-jsdoc-to-markdown' );
    grunt.loadNpmTasks( 'grunt-text-replace' );
    grunt.registerTask( 'doc', [ 'jsdoc2md:README', 'replace:README' ] );

    grunt.registerTask( 'dist', [ 'build-browser' ] );

    grunt.registerTask( 'default', [ 'check', 'dist' ] );
};
