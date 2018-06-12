'use strict';

require( './prepare' );

const is_browser = ( typeof window !== 'undefined' );

const executor_module = is_browser
    ? require( 'futoin-executor' )
    : module.require( '../lib/main' );

const invoker = require( 'futoin-invoker' );
const async_steps = require( 'futoin-asyncsteps' );

const chai = require( 'chai' );
const { expect, assert } = chai;

var ccm;
var executor;
var as;
var reqinfo;
var thisDir;

if ( typeof window !== 'undefined' ) {
    thisDir = '.';
} else {
    thisDir = __dirname;
}


var impl = {
    normalCall : function( as, reqinfo ) {
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
                        expect( as.state.error_info )
                            .equal( "Conflict with inherited interfaces: fileface.base:1.1" );
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
                        expect( as.state.error_info )
                            .equal( "Already registered: fileface.derived:2.4" );
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
                f : "fileface.derived:2.3:normalCall",
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
                f : "fileface.derived:2.3:normalCall",
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

                    expect( rsp ).eql( {
                        e:"InvalidRequest",
                        edesc: "Missing parameter: fileface.derived:2.3:normalCall(n)",
                    } );
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
        const LegacySecurityProvider = require( '../LegacySecurityProvider' );
        const PingService = require( '../PingService' );
        const PingFace = invoker.PingFace;

        as.add( ( as ) => {
            as.add( ( as ) => {
                const secprov = new LegacySecurityProvider( as, ccm );
                secprov.addUser( 'login', 'pass' );

                const executor = new executor_module.Executor( ccm, {
                    securityProvider : secprov,
                } );

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
