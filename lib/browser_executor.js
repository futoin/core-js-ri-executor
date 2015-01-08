"use strict";

var _ = require( 'lodash' );
var executor = require( './executor' );
var request = require( './request' );
var async_steps = require( 'futoin-asyncsteps' );
var performance_now = require( "performance-now" );
var browser_window = window; // jshint ignore:line

// ---
var BrowserChannelContext = function( executor, event )
{
    request.ChannelContext.call( this, executor );
    this._event_origin = event.origin;
    this._event_source = event.source;
    this._last_used = performance_now();
    this._is_secure_channel = true;
};

var BrowserChannelContextProto = new request.ChannelContext();

BrowserChannelContextProto.type = function()
{
    return "BROWSER";
};

BrowserChannelContextProto.isStateful = function()
{
    return true;
};

BrowserChannelContext.prototype = BrowserChannelContextProto;

void executor;
void async_steps;

// ---
var BrowserExecutorConst =
{
    OPT_CONNECT_TIMEOUT : 'CONN_TIMEOUT'
};

_.extend( BrowserExecutorConst, executor.ExecutorConst );

var BrowserExecutor = function( ccm, opts )
{
    executor.Executor.call( this, ccm, opts );

    this.allowed_origins = {};

    opts = opts || {};
    this._contexts = [];

    var _this = this;

    // --
    var connection_timeout = opts[ this.OPT_CONNECT_TIMEOUT ] || 600;

    var connection_cleanup = function()
    {
        var ctx_list = _this._contexts;
        var remove_time = performance_now() - connection_timeout;

        for ( var i = ctx_list.length - 1; i >= 0; --i )
        {
            var ctx = ctx_list[ i ];

            if ( ctx._last_used < remove_time )
            {
                ctx_list.splice( i, 1 );
            }
        }

        setTimeout( connection_cleanup, connection_timeout * 1e3 );
    };

    connection_cleanup();

    // --
    this._event_listener = function( event )
    {
        _this.handleMessage( event );
    };

    browser_window.addEventListener( 'message', this._event_listener );
};

_.extend( BrowserExecutor, BrowserExecutorConst );

var BrowserExecutorProto = new executor.Executor();
_.extend( BrowserExecutorProto, BrowserExecutorConst );
BrowserExecutor.prototype = BrowserExecutorProto;

BrowserExecutorProto.allowed_origins = null;

BrowserExecutorProto.handleMessage = function( event )
{
    var ftnreq = event.data;
    var source = event.source;
    var origin = event.origin;

    if ( ( typeof ftnreq !== 'object' ) ||
         !( 'rid' in ftnreq ) ||
         ( ftnreq.rid.charAt( 0 ) !== 'C' ) ||
         !( origin in this.allowed_origins ) )
    {
        // ignore, not client request
        return;
    }

    // ---
    var context = null;
    var ctx_list = this._contexts;

    for ( var i = 0, c = ctx_list.length; i  < c; ++i )
    {
        var ctx = ctx_list[ i ];

        if ( ( ctx._event_source === source ) &&
             ( ctx._event_origin === origin ) )
        {
            context = ctx;
            break;
        }
    }

    if ( context )
    {
        context._last_used = performance_now();
    }
    else
    {
        context = new BrowserChannelContext( this, event );
        ctx_list.push( context );
    }

    // ---
    var source_addr = new request.SourceAddress(
                'LOCAL',
                source,
                origin
    );

    // ---
    var reqinfo = new request.RequestInfo( this, ftnreq );

    var reqinfo_info = reqinfo.info;
    reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] = context;
    reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ] = source_addr;
    reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] = this._is_secure_channel;

    var _this = this;

    var as = async_steps();
    as.state.reqinfo = reqinfo;

    reqinfo._as = as;

    var cancel_req = function( as )
    {
        void as;
        reqinfo.cancelAfter( 0 );
        reqinfo._as = null;

        context._event_source.postMessage(
            {
                e : 'InternalError',
                rid : ftnreq.rid
            },
            context._event_origin
        );
    };

    as.add(
        function( as )
        {
            _this.process( as );
            as.setCancel( cancel_req );
        }
    ).add(
        function( as )
        {
            void as;
            var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];

            reqinfo.cancelAfter( 0 );
            reqinfo._as = null;

            if ( ftnrsp !== null )
            {
                context._event_source.postMessage( ftnrsp, context._event_origin );
            }
        }
    ).execute();
};

BrowserExecutorProto.close = function( close_cb )
{
    browser_window.removeEventListener( 'message', this._event_listener );

    if ( close_cb )
    {
        close_cb();
    }
};

BrowserExecutorProto._onNotExpected = function( as, err, error_info )
{
    void as;
    console.log( 'Not Expected: ' + err + " - " + error_info );
};

exports = module.exports = BrowserExecutor;
