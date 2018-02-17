'use strict';

require( './prepare' );

var invoker;
var async_steps;
var executor_module;
var assert;
var expect;

var ccm;
var executor;
var as;
var reqinfo;
var thisDir;

if ( typeof window !== 'undefined' ) {
    // Browser test
    assert = chai.assert;
    expect = chai.expect;
    executor_module = FutoInExecutor;
    invoker = FutoInInvoker;
    async_steps = $as;

    thisDir = '.';
} else {
    // Node test
    var chai_module = module.require( 'chai' );

    assert = chai_module.assert;
    expect = chai_module.expect;

    executor_module = module.require( '../lib/main' );
    invoker = module.require( 'futoin-invoker' );
    async_steps = module.require( 'futoin-asyncsteps' );

    thisDir = __dirname;
}


var impl = {
    normal_call : function( as, reqinfo ) {
        reqinfo.result().n = reqinfo.params().n;
        as.success( { b : reqinfo.params().a } );
    },

    noResult : function( as, reqinfo ) {
    },

    nullDefault: function( as, reqinfo ) {
        as.success( reqinfo.params() );
    },
};

describe( 'Executor', function() {
    var opts = {};

    opts.specDirs = [
        thisDir + '/missing',
        thisDir + '/specs',
    ];

    before( function() {
        as = async_steps();
        ccm = new invoker.AdvancedCCM( opts );
        executor = new executor_module.Executor( ccm, opts );
    } );

    describe( '#ccm', function() {
        it( 'should equal c-tor passed ccm', function() {
            expect( executor.ccm() ).equal( ccm );
        } );
    } );

    describe( '#register', function() {
        beforeEach( function() {
            executor = new executor_module.Executor( ccm, opts );
        } );
        after( function() {
            executor = new executor_module.Executor( ccm, opts );
        } );

        it( 'should register base interface', function( done ) {
            var opts = {};

            opts.specDirs = thisDir + '/specs';
            executor = new executor_module.Executor( ccm, opts );

            as.add(
                function( as ) {
                    executor.register( as, 'fileface.derived:2.3', impl );
                },
                function( as, err ) {
                    console.dir( as.state._orig_error.stack );
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                done();
            } );
            as.execute();
        } );

        it( 'should fail on ambigious base', function( done ) {
            as.add(
                function( as ) {
                    executor.register( as, 'fileface.derived:2.3', impl );
                    executor.register( as, 'fileface.another:1.0', impl );
                },
                function( as, err ) {
                    try {
                        expect( err ).equal( 'InternalError' );
                        expect( as.state.error_info ).equal( "Conflict with inherited interfaces" );
                        done();
                    } catch ( e ) {
                        done( e );
                    }
                }
            ).add( function( as ) {
                done( new Error( "Failed" ) );
            } );
            as.execute();
        } );

        it( 'should fail on duplicate major version', function( done ) {
            as.add(
                function( as ) {
                    executor.register( as, 'fileface.derived:2.3', impl );
                    as.add( function( as ) {
                        executor.register( as, 'fileface.derived:2.4', impl );
                    } );
                },
                function( as, err ) {
                    try {
                        expect( err ).equal( 'InternalError' );
                        expect( as.state.error_info ).equal( "Already registered" );
                        done();
                    } catch( e ) {
                        done( e );
                    }
                }
            ).add( function( as ) {
                done( "Failed" );
            } );
            as.execute();
        } );
    } );

    describe( '#process', function() {
        beforeEach( function() {
            as = async_steps();
            executor = new executor_module.Executor( ccm, opts );
            as.add( function( as ) {
                executor.register( as, 'fileface.derived:2.3', impl );
            } );
        } );

        afterEach( function( done ) {
            executor.close( done );
        } );

        it( 'should process request', function( done ) {
            reqinfo = new executor_module.RequestInfo( executor, {
                f : "fileface.derived:2.3:normal_call",
                p : {
                    n : 123,
                },
            } );

            as.add(
                function( as ) {
                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ) {
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                try {
                    var res = as.state.reqinfo.result();

                    expect( res.b ).equal( "PING" );
                    expect( res.n ).equal( 123 );
                    done();
                } catch ( e ) {
                    done( e );
                }
            } );
            as.execute();
        } );

        it( 'should process with error', function( done ) {
            reqinfo = new executor_module.RequestInfo( executor, {
                f : "fileface.derived:2.3:normal_call",
                p : {},
            } );

            as.add(
                function( as ) {
                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ) {
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                try {
                    var rsp = as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ];

                    expect( rsp ).eql( { e:"InvalidRequest",
                        edesc:"Missing parameter: n" } );
                    done();
                } catch ( e ) {
                    done( e );
                }
            } );
            as.execute();
        } );

        it( 'should correctly handle no result calls', function( done ) {
            as.add(
                function( as ) {
                    reqinfo = new executor_module.RequestInfo( executor, {
                        f : "fileface.derived:2.3:noResult",
                        p : {},
                    } );

                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ) {
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                try {
                    assert.strictEqual( null, as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ] );
                    done();
                } catch ( e ) {
                    done( e );
                }
            } );
            as.execute();
        } );

        it( 'should correctly handle forcersp calls', function( done ) {
            as.add(
                function( as ) {
                    reqinfo = new executor_module.RequestInfo( executor, {
                        f : "fileface.derived:2.3:noResult",
                        p : {},
                        forcersp : true,
                    } );

                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ) {
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                try {
                    expect( as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ] ).eql( { r:{} } );
                    done();
                } catch ( e ) {
                    done( e );
                }
            } );
            as.execute();
        } );

        it( 'should support "-internal" credentials', function( done ) {
            var ifacedef = {
                iface: 'internal.test',
                version: '1.0',
                ftn3rev: '1.7',
                funcs: {
                    f: {
                        result: 'integer',
                    },
                },
            };

            as.add(
                function( as ) {
                    var impl = {
                        f : function( as, reqinfo ) {
                            return 123;
                        },
                    };

                    executor.register( as, 'internal.test:1.0', impl, [ ifacedef ] );
                    ccm.register( as, 'inttest', 'internal.test:1.0',
                        executor, null,
                        { specDirs: [ ifacedef ] } );
                    as.add( function( as ) {
                        ccm.iface( 'inttest' ).f( as );
                    } );
                    as.add( function( as, res ) {
                        expect( res ).equal( 123 );
                    } );
                },
                function( as, err ) {
                    console.log( as.state.error_info );
                    done( as.state.last_exception );
                }
            );
            as.add( function( as ) {
                done();
            } );
            as.execute();
        } );

        it( 'should correctly handle "null" parameter default', function( done ) {
            as.add(
                function( as ) {
                    reqinfo = new executor_module.RequestInfo( executor, {
                        f : "fileface.derived:2.3:nullDefault",
                        p : {},
                        forcersp : true,
                    } );

                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ) {
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ) {
                try {
                    expect( as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ] ).eql( { r:{ arg: null } } );
                    done();
                } catch ( e ) {
                    done( e );
                }
            } );
            as.execute();
        } );
    } );
} );

describe( 'RequestInfo', function() {
    it( 'should support replace of result()', function() {
        var reqinfo = new executor_module.RequestInfo( null, {} );

        reqinfo.result().a = 1;
        reqinfo.result( 'Yeah' );
        expect( reqinfo.result() ).equal( 'Yeah' );
    } );
} );

describe( 'UserInfo', function() {
    it( 'should basically function', function() {
        var userinfo = new executor_module.UserInfo( null, 'LID123', 'GID123' );

        expect( userinfo.localID() ).equal( 'LID123' );
        expect( userinfo.globalID() ).equal( 'GID123' );
    } );
} );

describe( 'SourceAddress', function() {
    it( 'should basically function with IPv4', function() {
        var saddr = new executor_module.SourceAddress( null, '1.2.3.4', '345' );

        expect( saddr.asString() ).be.equal( 'IPv4:1.2.3.4:345' );
    } );
    it( 'should basically function with IPv6', function() {
        var saddr = new executor_module.SourceAddress( null, '2001:db8::ff00:42:8329', '345' );

        expect( saddr.asString() ).be.equal( 'IPv6:[2001:db8::ff00:42:8329]:345' );
    } );
    it( 'should basically function with LOCAL', function() {
        var saddr = new executor_module.SourceAddress( null, null, '/path/to.socket' );

        expect( saddr.asString() ).be.equal( 'LOCAL:/path/to.socket' );
    } );
} );

describe( 'DerivedKey', function() {
    it( 'should basically function', function() {
        var userinfo = new executor_module.DerivedKey( null, 1234, 5678 );

        expect( userinfo.baseID() ).equal( 1234 );
        expect( userinfo.sequenceID() ).equal( 5678 );
    } );
} );

describe( 'PingService', function() {
    it( 'should work', function( done ) {
        const as = async_steps();
        const ccm = new invoker.AdvancedCCM();
        const executor = new executor_module.Executor( ccm );
        const BasicAuthFace = require( '../BasicAuthFace' );
        const BasicAuthService = require( '../BasicAuthService' );
        const PingFace = require( 'futoin-invoker/PingFace' );
        const PingService = require( '../PingService' );

        as.add( ( as ) => {
            as.add( ( as ) => {
                const auth_svc = BasicAuthService.register( as, executor );
                auth_svc.addUser( 'login', 'pass' );
                BasicAuthFace.register( as, ccm, executor );

                PingService.register( as, executor );
                PingFace.register( as, ccm, '#ping', executor, 'login:pass' );
            } )
                .add( ( as ) => {
                    ccm.iface( '#ping' ).ping( as, 123 );
                    as.add( ( as, res ) => {
                        expect( res ).equal( 123 );
                        done();
                    } );
                } );
        }, ( as, err ) => {
            console.log( err );
            done( as.state.last_exception );
        } ).execute();
    } );
} );
