
var assert = require('assert');
var invoker = require( 'futoin-invoker' );
var executor_module = require( '../lib/main' );
var async_steps = require( 'futoin-asyncsteps' );

var ccm;
var executor;
var as;
var reqinfo;

var impl = {
    normal_call : function( as, reqinfo )
    {
        reqinfo.result().n = reqinfo.params().n;
        as.success( { b : reqinfo.params().a } );
    },
    
    noResult : function( as, reqinfo )
    {
    }
};

describe( 'Executor', function(){
    var opts = {};
    opts[ invoker.AdvancedCCM.OPT_SPEC_DIRS ] = [
        __dirname + '/missing',
        __dirname + '/specs'
    ];

    before(function(){
        as = async_steps();
        ccm = new invoker.AdvancedCCM( opts );
        executor = new executor_module.Executor( ccm, opts );
    });
    
    describe('#ccm', function(){
        it( 'should equal c-tor passed ccm', function(){
            executor.ccm().should.equal( ccm );
        });
    });
    
    describe('#register', function(){
        beforeEach(function(){
            executor = new executor_module.Executor( ccm, opts );
        });
        after(function(){
            executor = new executor_module.Executor( ccm, opts );
        });

        it('should register base interface', function( done ){
            var opts = {};
            opts[ invoker.AdvancedCCM.OPT_SPEC_DIRS ] = __dirname + '/specs';
            executor = new executor_module.Executor( ccm, opts );

            as.add(
                function( as ){
                    executor.register( as, 'fileface.derived:2.3', impl );
                },
                function( as, err ){
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ){
                done();
            });
            as.execute();
        });
        
        it('should fail on ambigious base', function( done ){
            as.add(
                function( as ){
                    executor.register( as, 'fileface.derived:2.3', impl );
                    executor.register( as, 'fileface.another:1.0', impl );
                },
                function( as, err ){
                    err.should.equal( 'InternalError' );
                    as.state.error_info.should.equal( "Conflict with inherited interfaces" );
                    done();
                }
            ).add( function( as ){
                done( "Failed" );
            });
            as.execute();
        });
        
        it('should fail on duplicate major version', function( done ){
            as.add(
                function( as ){
                    executor.register( as, 'fileface.derived:2.3', impl );
                    executor.register( as, 'fileface.derived:2.4', impl );
                },
                function( as, err ){
                    err.should.equal( 'InternalError' );
                    as.state.error_info.should.equal( "Already registered" );
                    done();
                }
            ).add( function( as ){
                done( "Failed" );
            });
            as.execute();
        });
    });
    
    describe('#process', function(){
        beforeEach(function(){
            as = async_steps();
            executor = new executor_module.Executor( ccm, opts );
            as.add( function( as ){
                executor.register( as, 'fileface.derived:2.3', impl );
            } );
        });
        
        it('should process request', function( done ){
            reqinfo = new executor_module.RequestInfo( executor, {
                f : "fileface.derived:2.3:normal_call",
                p : {
                    "n" : 123
                }
            } );
            
            as.add(
                function( as ){
                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ){
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ){
                try
                {
                    var res = as.state.reqinfo.result();
                    res.b.should.equal( "PING" );
                    res.n.should.equal( 123 );
                    done();
                }
                catch ( e )
                {
                    done( e );
                }
            });
            as.execute();
        });
        
        it('should process with error', function( done ){
            reqinfo = new executor_module.RequestInfo( executor, {
                f : "fileface.derived:2.3:normal_call",
                p : {}
            } );
            
            as.add(
                function( as ){
                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ){
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ){
                try
                {
                    var rsp = as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ];
                    rsp.should.equal( '{"e":"InvalidRequest","edesc":"Missing parameter: n"}' );
                    done();
                }
                catch ( e )
                {
                    done( e );
                }
            });
            as.execute();
        });
        
        it('should correctly handle no result calls', function( done ){
            as.add(
                function( as ){
                    reqinfo = new executor_module.RequestInfo( executor, {
                        f : "fileface.derived:2.3:noResult",
                        p : {}
                    } );

                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ){
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ){
                try
                {
                    assert.strictEqual( null, as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ] );
                    done();
                }
                catch ( e )
                {
                    done( e );
                }
            });
            as.execute();
        });
        
        it('should correctly handle forcersp calls', function( done ){
            as.add(
                function( as ){
                    reqinfo = new executor_module.RequestInfo( executor, {
                        f : "fileface.derived:2.3:noResult",
                        p : {},
                        forcersp : true
                    } );

                    as.state.reqinfo = reqinfo;
                    executor.process( as );
                },
                function( as, err ){
                    done( new Error( err + ": " + as.state.error_info ) );
                }
            ).add( function( as ){
                try
                {
                    as.state.reqinfo.info()[ reqinfo.INFO_RAW_RESPONSE ].should.equal('{"r":{}}');
                    done();
                }
                catch ( e )
                {
                    done( e );
                }
            });
            as.execute();
        });
    });
});

describe( 'UserInfo', function(){
    it('should basically function', function(){
        var userinfo = new executor_module.UserInfo( null, 'LID123', 'GID123' );
        userinfo.localID().should.equal( 'LID123' );
        userinfo.globalID().should.equal( 'GID123' );
    });
});

describe( 'SourceAddress', function(){
    it('should basically function with IPv4', function(){
        var saddr = new executor_module.SourceAddress( null, '1.2.3.4', '345' );
        saddr.asString().should.be.equal( 'IPv4:1.2.3.4:345' );
    });
    it('should basically function with IPv6', function(){
        var saddr = new executor_module.SourceAddress( null, '2001:db8::ff00:42:8329', '345' );
        saddr.asString().should.be.equal( 'IPv6:[2001:db8::ff00:42:8329]:345' );
    });
    it('should basically function with LOCAL', function(){
        var saddr = new executor_module.SourceAddress( null, null, '/path/to.socket' );
        saddr.asString().should.be.equal( 'LOCAL:/path/to.socket' );
    });
});

describe( 'DerivedKey', function(){
    it('should basically function', function(){
        var userinfo = new executor_module.DerivedKey( null, 1234, 5678 );
        userinfo.baseID().should.equal( 1234 );
        userinfo.sequenceID().should.equal( 5678 );
    });
});

