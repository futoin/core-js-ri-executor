"use strict";

var assert = require('assert');
var executor_module = require( '../lib/main' );
var invoker_module = require( 'futoin-invoker' );
var async_steps = require( 'futoin-asyncsteps' );
var NodeExecutor = executor_module.NodeExecutor;


var model_as = async_steps();
model_as.add(
    function( as )
    {
        var opts = {};
        opts[invoker_module.OPT_CALL_TIMEOUT_MS] = 1e3;
        opts[NodeExecutor.OPT_SPEC_DIRS] = __dirname + '/specs';
        opts[NodeExecutor.OPT_HTTP_ADDR] = 'localhost';
        opts[NodeExecutor.OPT_HTTP_PORT] = '8080';
        opts[NodeExecutor.OPT_HTTP_PATH] = '/ftn';
        
        var ccm;
        
        as.add( function( as ){
            ccm = new as.state.CCMImpl( opts );
            var executor = new NodeExecutor( ccm, opts );
            
            as.setTimeout( opts[invoker_module.OPT_CALL_TIMEOUT_MS] );
            executor.on('ready', function(){
                as.success();
            });
            
            as.state.executor = executor;
        });
    },
    function( as, err )
    {
        as.success( new Error( "" + err + ": " + as.state.error_info + " @ " + as.state.step ) );
    }
).add(
    function( as, err )
    {
        as.setTimeout( 1e3 );
        as.state.executor._http_server.close(function(){
            as.state.done( err );
        });
    }
);

describe( 'Integration', function()
{
    it('should pass HTTP suit SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });
    
    it('should pass WS suit SimpleCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });
    
    it('should pass HTTP suit AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'http';
        as.execute();
    });
    
    it('should pass WS suit AdvancedCCM', function( done )
    {
        var as = async_steps();
        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'ws';
        as.execute();
    });
}
);
