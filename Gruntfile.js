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
        webpack: {
            dist: require( './webpack.dist' ),
            test: require( './webpack.test' ),
        },
        babel: {
            options: {
                sourceMap: true,
                presets: [ '@babel/preset-env' ],
                plugins: [ "@babel/transform-object-assign" ],
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
        nyc: {
            cover: {
                options: {
                    cwd: '.',
                    exclude: [
                        'coverage/**',
                        'dist/**',
                        'es5/**',
                        'examples/**',
                        'test/**',
                        '.eslintrc.js',
                        'Gruntfile.js',
                        'webpack.*.js',
                    ],
                    reporter: [ 'lcov', 'text-summary' ],
                    reportDir: 'coverage',
                    all: true,
                },
                cmd: false,
                args: [ 'mocha', 'test/*test.js' ],
            },
            report: {
                options: {
                    reporter: 'text-summary',
                },
            },
        },
        karma: {
            test: {
                browsers: [ 'FirefoxHeadless' ],
                customLaunchers: {
                    FirefoxHeadless: {
                        base: 'Firefox',
                        flags: [
                            '-headless',
                        ],
                        prefs: {
                            'browser.cache.disk.enable': false,
                        },
                    },
                },
                frameworks: [ 'mocha' ],
                reporters: [ 'mocha' ],
                singleRun: true,
                listenAddress: '127.0.0.1',
                port: '8000',
                files: [
                    { src: [ 'test/iframe_include.dom' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-asyncsteps/dist/polyfill-asyncsteps.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-asyncsteps/dist/futoin-asyncsteps.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-asyncevent/dist/polyfill-asyncevent.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-asyncevent/dist/futoin-asyncevent.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/msgpack-lite/dist/msgpack.min.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-invoker/dist/polyfill-invoker.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'node_modules/futoin-invoker/dist/futoin-invoker.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'dist/polyfill-executor.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'dist/futoin-executor.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'dist/*test.js' ],
                        served: true, included: true, nocache: true },
                    { src: [ 'dist/integration_iface.js' ],
                        served: true, included: false, nocache: true },
                    { src: [ 'dist/iframe.js' ],
                        served: true, included: false, nocache: true },
                    { src: [ 'node_modules/chai/chai.js' ],
                        served: true, included: false, nocache: true },
                    { src: [ 'test/iframe.html' ],
                        served: true, included: false, nocache: false },
                    { src: [ 'test/**/*.json' ],
                        served: true, included: false, nocache: false },
                ],
                proxies: {
                    // NOTE: it seems Karma does not handle /base internally in proxies.
                    '/test/': 'http://localhost:8000/base/test/',
                    '/dist/': 'http://localhost:8000/base/dist/',
                },
                //logLevel: 'DEBUG',
            },
        },
    } );

    grunt.loadNpmTasks( 'grunt-eslint' );
    grunt.loadNpmTasks( 'grunt-babel' );
    grunt.loadNpmTasks( 'grunt-webpack' );
    grunt.loadNpmTasks( 'grunt-karma' );
    grunt.loadNpmTasks( 'grunt-simple-nyc' );

    grunt.registerTask( 'check', [ 'eslint' ] );

    grunt.registerTask( 'build-browser', [ 'babel', 'webpack:dist' ] );
    grunt.registerTask( 'test-browser', [ 'webpack:test', 'karma' ] );

    grunt.registerTask( 'node', [ 'nyc' ] );
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
