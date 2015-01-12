"use strict";

var assert;

var executor_module = require( '../lib/main' );
var invoker_module = require( 'futoin-invoker' );
var async_steps = require( 'futoin-asyncsteps' );
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
    var hidreq = require;
    NodeExecutor = executor_module.NodeExecutor;
    MemoryStream = hidreq( 'memorystream' );
    
    var chai_module = hidreq( 'chai' );
    chai_module.should();
    assert = chai_module.assert;

}

var integration_iface = require( './integration_iface' );
var test_int_anon = integration_iface.test_int_anon;
var test_int_anon_secure = integration_iface.test_int_anon_secure;
var test_int_anon_bidirect = integration_iface.test_int_anon_bidirect;
var interface_impl = integration_iface.interface_impl;

// ---
var model_as = async_steps();
model_as.add(
    function( as )
    {
        var opts = {};
        opts[invoker_module.OPT_CALL_TIMEOUT_MS] = 1e3;
        opts[executor_module.Executor.OPT_SPEC_DIRS] = [
            thisDir + '/specs',
            test_int_anon,
            test_int_anon_bidirect,
            test_int_anon_secure
        ];
        
        if ( NodeExecutor )
        {
            opts[NodeExecutor.OPT_HTTP_ADDR] = 'localhost';
            opts[NodeExecutor.OPT_HTTP_PORT] = '1080';
            opts[NodeExecutor.OPT_HTTP_PATH] = '/ftn';

            var secopts = _.clone( opts );

            var end_point = as.state.proto +
                "://" + opts[NodeExecutor.OPT_HTTP_ADDR] +
                ":" + opts[NodeExecutor.OPT_HTTP_PORT] +
                opts[NodeExecutor.OPT_HTTP_PATH];
                
            secopts[NodeExecutor.OPT_HTTP_PORT] = '1081';
                
            var secend_point = "secure+" + as.state.proto +
                "://" + secopts[NodeExecutor.OPT_HTTP_ADDR] +
                ":" + secopts[NodeExecutor.OPT_HTTP_PORT] +
                secopts[NodeExecutor.OPT_HTTP_PATH];
        }
        else
        {
            end_point = "browser://server_frame";
            secend_point = end_point;
        }

        var ccm = new as.state.CCMImpl( opts );
        var executor_ccm = new invoker_module.AdvancedCCM( opts );
        var anon_iface;
        var bidirect_iface;
        var anonsec_iface;
        
        var is_bidirect = end_point.match( /^(ws|browser)/ ) !== null;
        
        as.add( function( as ){
            if ( !NodeExecutor ) return;
               
            var executor = new NodeExecutor( executor_ccm, opts );
            as.state.executor = executor;
            
            /*executor.on( 'notExpected', function( err, error_info ){
                console.log( "NotExpected: " + err + " " + error_info );
            });*/
            
            as.setTimeout( opts[invoker_module.OPT_CALL_TIMEOUT_MS] );
            executor.on('ready', function(){
                as.success();
            });
            executor.on('error', function(){
            });
        }).add( function( as ){
            if ( !NodeExecutor ) return;
               
            var secexecutor = new NodeExecutor( executor_ccm, secopts );
            as.state.secexecutor = secexecutor;
            
            /*secexecutor.on( 'notExpected', function( err, error_info ){
                console.log( "NotExpected: " + err + " " + error_info );
            });*/
 
            as.setTimeout( opts[invoker_module.OPT_CALL_TIMEOUT_MS] );
            secexecutor.on('ready', function(){
                as.success();
            });
            secexecutor.on('error', function(){
            });
        }).add( function( as ){
            var p = as.parallel();
            
            if ( NodeExecutor )
            {
                p.add( function( as ){
                    as.state.executor.register( as, 'test.int.anon:1.0', interface_impl );
                } ).add( function( as ){
                    as.state.executor.register( as, 'test.int.bidirect:1.0', interface_impl );
                } ).add( function( as ){
                    as.state.secexecutor.register( as, 'test.int.anonsec:1.0', interface_impl );
                } );
            }
            
            var clientExecutor = new ClientExecutor( executor_ccm, opts ); 
            as.state.clientExecutor = clientExecutor;
            clientExecutor._onNotExpected = function( as, err, error_info )
            {
                console.log( 'Not Expected: ' + err, error_info );
                console.log( as.state.last_exception.stack );
            };
            
            p.add( function( as ){
                clientExecutor.register( as, 'test.int.bidirect:1.0', {
                    clientCallback : function( as, reqinfo ){
                        return { a: 'ClientResult' };
                    }
                } );
            } ).add( function( as ){
                ccm.register( as, 'test_int_anon', 'test.int.anon:1.0', end_point );
            } ).add( function( as ){
                as.add(
                    function( as ){
                        ccm.register( as, 'test_int_bidirect', 'test.int.bidirect:1.0', end_point, null, {
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
                if ( NodeExecutor )
                {
                    ccm.register( as, 'test_int_anonsec', 'test.int.anonsec:1.0', secend_point );
                }
                else
                {
                    ccm.register( as, 'test_int_anonsec', 'test.int.anonsec:1.0', secend_point, null, { targetOrigin: 'http://localhost:8000' } );
                }
            } );
        }).add( function( as ){
            anon_iface = ccm.iface( 'test_int_anon' );
            anonsec_iface = ccm.iface( 'test_int_anonsec' );
            
            if ( is_bidirect )
            {
                bidirect_iface = ccm.iface( 'test_int_bidirect' );
            }
    // ---
        }).add( function( as ){
            as.state.step = "regular";
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
            as.state.step = "noResult";
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
            as.state.step = "noParams";
            anon_iface.call( as, 'noParams' );
        }).add( function( as, res ){
            res.a.should.equal( 'test' );
    // ---
        }).add( function( as ){
            as.state.step = "rawUpload";
            
            if ( is_in_browser )
            {
                as.success( { a: 'TestUpload' } );
                return;
            }
            
            anon_iface.call( as, 'rawUpload', null, 'TestUpload' );
        }).add( function( as, res ){
            res.a.should.equal( 'TestUpload' );
    // ---
        }).add( function( as ){
            as.state.step = "rawUpload + buffer";
            
            if ( is_in_browser )
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
            as.state.step = "rawUpload + stream";
            
            if ( is_in_browser )
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
            as.state.step = "rawResult";
            
            if ( is_in_browser ) return;

            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawResult', { a: 'TestDownloadЯ' }, null, as.state.membuf );
        }).add( function( as, res ){
            if ( is_in_browser ) return;
            as.state.membuf.toString().should.equal( 'TestDownloadЯ' );
    // ---
        }).add( function( as ){
            if ( is_in_browser )
            {
                as.success( 'TestDownloadЯ' );
            }
            else if ( anon_iface._raw_info.funcs['rawResult'] ||
                 ( as.state.proto === 'http' ) ||
                 ( as.state.proto === 'https' ) )
            {
                as.state.step = "rawResult + stream";
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
            as.state.step = "rawUploadResult";
            
            if ( is_in_browser ) return;

            var upload_data = new Buffer('TestUploadBuffer');
            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawUploadResult', null, upload_data, as.state.membuf );
        }).add( function( as ){
            if ( is_in_browser ) return;

            as.state.membuf.toString().should.equal( 'TestUploadBuffer' );
    // ---
        }).add( function( as ){
            as.state.step = "rawUploadResultParams";
            
            if ( is_in_browser ) return;
            
            var upload_data = new Buffer('TestUploadBuffer');
            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call(
                as,
                'rawUploadResultParams',
                {
                    a : 'start{',
                    c : '}end'
                },
                upload_data,
                as.state.membuf
            );
        }).add( function( as ){
            if ( is_in_browser ) return;
            as.state.membuf.toString().should.equal( 'start{TestUploadBuffer}end' );
    // ---
        }).add(
            function( as ){
                if ( !is_bidirect )
                {
                    as.success( { a : 'OK' } );
                    return;
                }
                
                as.state.step = "testBiDirect";
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
                as.state.step = "cancelAfterTimeout";
                anon_iface.call( as, 'cancelAfterTimeout' );
            },
            function( as, err )
            {
                err.should.equal( 'InternalError' );
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
                
                as.state.step = "clientCallback";
                bidirect_iface.call( as, 'clientCallback' );
            }
        ).add( function( as, res ){
            res.a.should.equal( 'ClientResult' );
        // --
        }).add(
            function( as, ok ){
                as.state.step = 'clientTimeout';
                anon_iface.call( as, 'clientTimeout', null, null, null, 1 );
            },
            function( as, err ){
                err.should.equal( 'Timeout' );
                assert.equal( undefined, as.state.error_info );
                as.success();
            }
        ).add(
            function( as ){
                as.state.step = 'serverError';
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
                as.state.step = 'serverError - invalid';
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
        if ( !is_in_browser )
        {
            as.state.executor.close();
            as.state.secexecutor.close();
        }
        as.state.done( err );
    },
    function( as, err )
    {
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
}
});
