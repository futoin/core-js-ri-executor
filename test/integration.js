"use strict";

var assert;

var executor_module = require( '../lib/main' );
var invoker_module = require( 'futoin-invoker' );
var async_steps = require( 'futoin-asyncsteps' );
var BasicAuthFace = require( '../BasicAuthFace' );
var BasicAuthService = require( '../BasicAuthService' );
var _ = require( 'lodash' );

var is_in_browser = ( 'BrowserExecutor' in executor_module );

var NodeExecutor;
var BrowserExecutor;
var ClientExecutor = executor_module.ClientExecutor;
var MemoryStream;
var thisDir;

if ( is_in_browser )
{
    assert = chai.assert;
    thisDir = '.';
    
    BrowserExecutor = executor_module.BrowserExecutor;
}
else
{
    thisDir = __dirname;

    NodeExecutor = executor_module.NodeExecutor;
    MemoryStream = module.require( 'memorystream' );
    
    var chai_module = module.require( 'chai' );
    chai_module.should();
    assert = chai_module.assert;

}

var integration_iface = require( './integration_iface' );
var test_if_anon = integration_iface.test_if_anon;
var test_if_anon_secure = integration_iface.test_if_anon_secure;
var test_if_anon_bidirect = integration_iface.test_if_anon_bidirect;
var interface_impl = integration_iface.interface_impl;

// ---
var model_as = async_steps();
model_as.add(
    function( as )
    {
        var opts = {};
        opts.callTimeoutMS = 1e3;
        opts.specDirs = [
            thisDir + '/specs',
            test_if_anon,
            test_if_anon_bidirect,
            test_if_anon_secure
        ];
        
        var internal_test = ( as.state.proto === 'internal' );
        var node_test = NodeExecutor && !internal_test;

        var end_point = '';
        
        if ( internal_test )
        {
            // configure later
        }
        else if ( node_test )
        {
            opts.httpAddr = 'localhost';
            opts.httpPort = '1080';
            opts.httpPath = '/ftn';

            var secopts = _.clone( opts );

            end_point = as.state.proto +
                "://" + opts.httpAddr +
                ":" + opts.httpPort +
                opts.httpPath;
                
            secopts.httpPort = '1081';
                
            var secend_point = "secure+" + as.state.proto +
                "://" + secopts.httpAddr +
                ":" + secopts.httpPort +
                secopts.httpPath;
        }
        else
        {
            end_point = "browser://server_frame";
            secend_point = end_point;
        }
        
        var state = as.state;
        state.ccm_msgs = [];
        state.exec_msgs = [];
        
        opts.messageSniffer = function( info, msg ){
            state.ccm_msgs.push( msg );
        };

        var ccm = new as.state.CCMImpl( opts );
        var executor_ccm = new invoker_module.AdvancedCCM( opts );
        var anon_iface;
        var bidirect_iface;
        var anonsec_iface;
        
        var is_bidirect = internal_test || ( end_point.match( /^(ws|browser)/ ) !== null );
        
        var execopts = _.clone( opts );
        execopts.messageSniffer = function( src, msg ){
            state.exec_msgs.push( msg );
        };
        
        if ( node_test )
        {
            secopts.messageSniffer = execopts.messageSniffer;
        }

        function set_step( s )
        {
            // console.log( 'Step: ' + s );
            as.state.step = s;
        }
        
        as.add( function( as ){
            if ( !node_test ) return;
               
            var executor = new NodeExecutor( executor_ccm, execopts );
            as.state.executor = executor;
            
            /*executor.on( 'notExpected', function( err, error_info ){
                console.log( "NotExpected: " + err + " " + error_info );
            });*/
            
            as.setTimeout( execopts.callTimeoutMS );
            executor.on('ready', function(){
                as.success();
            });
            executor.on('error', function(){
            });
        }).add( function( as ){
            if ( !node_test ) return;
               
            var secexecutor = new NodeExecutor( executor_ccm, secopts );
            as.state.secexecutor = secexecutor;
            
            /*secexecutor.on( 'notExpected', function( err, error_info ){
                console.log( "NotExpected: " + err + " " + error_info );
            });*/
 
            as.setTimeout( execopts.callTimeoutMS );
            secexecutor.on('ready', function(){
                as.success();
            });
            secexecutor.on('error', function(){
            });
        }).add( function( as ){
            if ( !internal_test ) return;
               
            var executor = new executor_module.Executor( executor_ccm, execopts );
            as.state.executor = executor;
            as.state.secexecutor = executor;
            end_point = executor;
            secend_point = executor;
        }).add( function( as ){
            var p = as.parallel();
            
            if ( node_test || internal_test )
            {
                p.add( function( as ){
                    as.state.executor.register( as, 'test.int.anon:1.0', interface_impl );
                } ).add( function( as ){
                    as.state.executor.register( as, 'test.int.bidirect:1.0', interface_impl );
                } ).add( function( as ){
                    as.state.secexecutor.register( as, 'test.int.anonsec:1.0', interface_impl );
                } );
            }
            
            var basicAuthExecutor = new executor_module.Executor( executor_ccm );
            var basic_auth_service = BasicAuthService.register( as, basicAuthExecutor );
            basic_auth_service.addUser( 'user', 'pass' );
            basic_auth_service.addUser( 'hmacuser', 'MyLongLongSecretKey' );
            basic_auth_service.addUser( 'system', 'pass', {}, true );
            
            var clientExecutor = new ClientExecutor( ccm, opts ); 
            as.state.clientExecutor = clientExecutor;
            clientExecutor.on( 'notExpected', function( err, error_info )
            {
                console.log( 'Not Expected: ' + err, error_info );
                console.log( state.last_exception.stack );
            } );
            
            p.add( function( as ){
                clientExecutor.register( as, 'test.int.bidirect:1.0', {
                    clientCallback : function( as, reqinfo ){
                        try
                        {
                            reqinfo.info.RAW_REQUEST.should.not.have.property( 'sec' );
                            return { a: 'ClientResult' };
                        }
                        catch ( e )
                        {
                            as.error( 'InternalError', e.message );
                        }
                    }
                } );
            } ).add( function( as ){
                ccm.register(
                        as,
                        'test_if_anon',
                        'test.int.anon:1.0',
                        end_point,
                        as.state.creds || 'user:pass',
                        { hmacKey: 'TXlMb25nTG9uZ1NlY3JldEtleQ==' }
                );
                executor_ccm.register(
                        as,
                        'subcall',
                        'test.int.anon:1.0',
                        end_point,
                        'system:pass'
                );
                BasicAuthFace.register( as, executor_ccm, basicAuthExecutor );
            } ).add( function( as ){
                as.add(
                    function( as ){
                        ccm.register(
                            as,
                            'test_if_bidirect',
                            'test.int.bidirect:1.0',
                            end_point,
                            null, {
                            executor : clientExecutor
                        } );
                        
                        as.add( function( as ){
                            if ( as.state.CCMImpl === invoker_module.AdvancedCCM )
                            {
                                is_bidirect.should.be.true;
                            }
                        });
                    },
                    function( as, err )
                    {
                        if ( !is_bidirect )
                        {
                            err.should.equal( 'InvokerError' );
                            as.state.error_info.should.equal( "BiDirectChannel is required" );
                            as.success();
                        }
                    }
                );
            } ).add( function( as ){
                if ( node_test )
                {
                    ccm.register( as, 'test_if_anonsec', 'test.int.anonsec:1.0', secend_point );
                }
                else
                {
                    ccm.register( as, 'test_if_anonsec', 'test.int.anonsec:1.0', secend_point, null, { targetOrigin: 'http://localhost:8000' } );
                }
            } );
        }).add( function( as ){
            anon_iface = ccm.iface( 'test_if_anon' );
            anonsec_iface = ccm.iface( 'test_if_anonsec' );
            
            if ( is_bidirect )
            {
                bidirect_iface = ccm.iface( 'test_if_bidirect' );
            }
    // ---
        }).add( function( as ){
            set_step( "regular" );
            anon_iface.call( as, 'regular', {
                b : true,
                s : 'Value',
                n : 123.456,
                i : 123456,
                m : { field : 'value' },
                a : [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ]
            } );
        }).add( function( as, res ){
            res.rb.should.be.true;
            res.rs.should.equal( 'Value' );
            res.rn.should.equal( 123.456 );
            res.ri.should.equal( 123456 );
            res.rm.should.eql( { field : 'value' } );
            res.ra.should.eql( [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ] );
    // ---
        }).add( function( as ){
            set_step( "noResult" );
            anon_iface.call( as, 'noResult', {
                a : "param"
            } );
        }).add( function( as, res ){
            if ( res !== undefined )
            {
                res.should.be.empty;
            }
   // ---
        }).add( function( as ){
            set_step( "customResult" );
            anon_iface.call( as, 'customResult');
        }).add( function( as, res ){
            res.should.be.true;
    // ---
        }).add( function( as ){
            set_step( "noParams" );
            anon_iface.call( as, 'noParams' );
        }).add( function( as, res ){
            res.a.should.equal( 'test' );
    // ---
        }).add( function( as ){
            if ( is_in_browser )
            {
                as.success( { a : 'test' } );
                return;
            }
            
            set_step( "testAuth" );
            anon_iface.call( as, 'testAuth' );
        }).add( function( as, res ){
            res.a.should.equal( 'test' );
    // ---            
        }).add( function( as ){
            set_step( "rawUpload" );
            
            if ( is_in_browser || internal_test )
            {
                as.success( { a: 'TestUpload' } );
                return;
            }
            
            anon_iface.call( as, 'rawUpload', null, 'TestUpload' );
        }).add( function( as, res ){
            res.a.should.equal( 'TestUpload' );
    // ---
        }).add( function( as ){
            set_step( "rawUpload + buffer" );
            
            if ( is_in_browser || internal_test )
            {
                as.success( { a: 'TestUploadBuffer' } );
                return;
            }

            var upload_data = new Buffer('TestUploadBuffer');
            anon_iface.call( as, 'rawUpload', null, upload_data );
        }).add( function( as, res ){
            res.a.should.equal( 'TestUploadBuffer' );
    // ---
        }).add( function( as ){
            set_step( "rawUpload + stream" );
            
            if ( is_in_browser || internal_test )
            {
                as.success( { a: 'TestUploadStreamЯ' } );
                return;
            }
            
            var upload_data = new MemoryStream();
            upload_data.lengthInBytes = Buffer.byteLength( 'TestUploadStreamЯ', 'utf8' );
            var orig_pipe = upload_data.pipe;
            upload_data.pipe = function( dst, opts )
            {
                orig_pipe.call( this, dst, opts );
                // a dirty hack
                this.write( 'TestUploadStreamЯ', 'utf8' );
                this.end();
            };
            
            anon_iface.call( as, 'rawUpload', null, upload_data );
        }).add( function( as, res ){
            res.a.should.equal( 'TestUploadStreamЯ' );
    // ---
        }).add( function( as ){
            set_step( "rawResult" );
            
            if ( is_in_browser|| internal_test ) return;

            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawResult', { a: 'TestDownloadЯ' }, null, as.state.membuf );
        }).add( function( as, res ){
            if ( is_in_browser|| internal_test ) return;
            as.state.membuf.toString().should.equal( 'TestDownloadЯ' );
    // ---
        }).add( function( as ){
            if ( is_in_browser || internal_test )
            {
                as.success( 'TestDownloadЯ' );
            }
            else if ( anon_iface._raw_info.funcs['rawResult'] ||
                 ( as.state.proto === 'http' ) ||
                 ( as.state.proto === 'https' ) )
            {
                set_step( "rawResult + stream" );
                anon_iface.call( as, 'rawResult', { a: 'TestDownloadЯ' } );
            }
            else
            {
                console.log( 'WARNING: known issue with SimpleCCM + raw result' );
                as.success( 'TestDownloadЯ' );
            }
        }).add( function( as, res ){
            res.should.equal( 'TestDownloadЯ' );
    // ---
        }).add( function( as ){
            set_step( "rawUploadResult" );
            
            if ( is_in_browser || internal_test ) return;

            var upload_data = new Buffer('TestUploadBuffer');
            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawUploadResult', null, upload_data, as.state.membuf );
        }).add( function( as ){
            if ( is_in_browser || internal_test ) return;

            as.state.membuf.toString().should.equal( 'TestUploadBuffer' );
    // ---
        }).add( function( as ){
            set_step( "rawUploadResultParams" );
            
            if ( is_in_browser || internal_test ) return;
            
            var upload_data = new Buffer('TestUploadBuffer');
            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call(
                as,
                'rawUploadResultParams',
                {
                    a : 'start{',
                    e : '}end',
                    c : 1,
                    o : { a : '123' }
                },
                upload_data,
                as.state.membuf
            );
        }).add( function( as ){
            if ( is_in_browser || internal_test ) return;
            as.state.membuf.toString().should.equal( 'start{TestUploadBuffer}end' );
    // ---
        }).add(
            function( as ){
                if ( !is_bidirect )
                {
                    as.success( { a : 'OK' } );
                    return;
                }
                
                set_step( "testBiDirect" );
                bidirect_iface.call( as, 'testBiDirect' );
            },
            function( as, err )
            {
                if ( as.state.proto === 'http' )
                {
                    err.should.equal( 'InvalidRequest' );
                    as.state.error_info.should.equal( "Bi-Direct Channel is required" );
                    as.success( { a: 'OK' } );
                }
            }
        ).add( function( as, res ){
            res.a.should.equal( 'OK' );
        // --
        }).add(
            function( as ){
                set_step( "cancelAfterTimeout" );
                anon_iface.call( as, 'cancelAfterTimeout' );
            },
            function( as, err )
            {
                err.should.equal( as.state.creds ? 'SecurityError' : 'InternalError' );
                as.success( 'OK' );
            }
        ).add( function( as, res ){
            res.should.equal( 'OK' );
        // --
        }).add(
            function( as ){
                if ( !is_bidirect )
                {
                    as.success( { a : 'ClientResult' } );
                    return;
                }
                
                set_step( "clientCallback" );
                bidirect_iface.call( as, 'clientCallback' );
            }
        ).add( function( as, res ){
            res.a.should.equal( 'ClientResult' );
        // --
        }).add(
            function( as ){
                set_step( 'testHTTPheader' );
                anon_iface.call( as, 'testHTTPheader' );
            }
        ).add(
            function( as, res ){
                res.r.should.equal( as.state.proto.match( /^http/ ) ? 'OK' : 'IGNORE' );
            }
        // --
        ).add(
            function( as ){
                set_step( 'testOnBehalfOf' );
                anon_iface.call( as, 'testOnBehalfOf' );
            }
        ).add(
            function( as, res ){
                res.r.should.equal( 'OK' );
            }
        // --
        ).add(
            function( as ){
                set_step( 'testSecLevel' );
                anon_iface.call( as, 'testSecLevel' );
            },
            function( as, err )
            {
                err.should.equal( 'PleaseReauth' );
                as.state.error_info.split( ' ' )[0].should.equal( 'ExceptionalOps' );
                as.success( 'ReauthOK' );
            }
        ).add(
            function( as, res ){
                res.should.equal( 'ReauthOK' );
            }
        // --
        ).add(
            function( as, ok ){
                set_step( 'clientTimeout' );
                anon_iface.call( as, 'clientTimeout', null, null, null, 1 );
            },
            function( as, err ){
                err.should.equal( 'Timeout' );
                assert.equal( undefined, as.state.error_info );
                as.success();
            }
        ).add(
            function( as ){
                set_step( 'serverError' );
                anon_iface.call( as, 'serverError', {
                    'a' : 'ValidError'
                } );
            },
            function( as, err ){
                err.should.equal( 'ValidError' );
                assert.equal( undefined, as.state.error_info );
                as.success();
            }
        ).add(
            function( as ){
                set_step( 'serverError - invalid' );
                anon_iface.call( as, 'serverError', {
                    'a' : 'InvalidError'
                } );
            },
            function( as, err ){
                err.should.equal( 'InternalError' );
                as.state.error_info.should.equal( 'Not expected error' );
                as.success();
            }
        ).add( function( as ){
            if ( node_test )
            {
                // console.dir(  as.state.ccm_msgs );
                // console.dir(  as.state.exec_msgs );
                
                var diff = as.state.exec_msgs.length - as.state.ccm_msgs.length;
                
                // One message difference for client timeout test is possible
                if ( diff < 0 || diff > 1 )
                {
                    as.state.ccm_msgs.length.should.equal( as.state.exec_msgs.length );
                }
            }
        });
    },
    function( as, err )
    {
        console.log( as.state.last_exception.stack );
        as.success( new Error( "" + err + ": " + as.state.error_info + " @ " + as.state.step ) );
    }
).add(
    function( as, err )
    {
        if ( as.state.executor )
        {
            as.state.executor.close();
            as.state.secexecutor.close();
        }

        as.state.done( err );
    },
    function( as, err )
    {
        console.log( as.state.last_exception.stack );
        as.state.done( new Error( "" + err + ": " + as.state.error_info + " @ shutdown" ) );
    }
);

// ---
describe( 'Integration', function()
{
if ( is_in_browser )
{
    it('should pass Browser suite SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'browser';
        as.execute();
    });

    it('should pass Browser suite AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'browser';
        as.execute();
    });
}
else
{
    it('should pass HTTP suite SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });

    it('should pass WS suite SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });

    it('should pass HTTP suite AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });

    it('should pass WS suite AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });

    it('should pass WS suite AdvancedCCM with HMAC', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.state.creds = '-hmac:hmacuser';
        as.execute();
    });
}

    it('should pass INTERNAL suite SimpleCCM', function( done )
    {
        this.timeout( 5e3 );
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.execute();
    });

    it('should pass INTERNAL suite AdvancedCCM', function( done )
    {
        this.timeout( 5e3 );
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.execute();
    });
});
