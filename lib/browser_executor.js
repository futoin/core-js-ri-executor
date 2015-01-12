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
    this._reverse_requests = {
        evt_origin : event.origin,
        evt_source : event.source,
        rid : 1,
        reqas : {}
    };
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

BrowserChannelContextProto._getPerformRequest = function()
{
    var revreq = this._reverse_requests;

    return function( as, ctx, ftnreq )
    {
        as.add( function( as )
        {
            var rid = 'S' + revreq.rid++;
            ftnreq.rid = rid;

            //
            if ( ctx.expect_response )
            {
                var reqas = revreq.reqas;
                reqas[rid] = as;

                as.setCancel(
                    function( )
                    {
                        delete reqas[rid];
                    }
                );
            }

            //
            revreq.evt_source.postMessage( ftnreq, revreq.evt_origin );
        } );
    };
};

BrowserChannelContext.prototype = BrowserChannelContextProto;

// ---
var BrowserExecutorConst =
{
    OPT_CONNECT_TIMEOUT : 'CONN_TIMEOUT',
    OPT_ALLOWED_ORIGINS : 'ALLOWED_ORIGINS'
};

_.extend( BrowserExecutorConst, executor.ExecutorConst );

var BrowserExecutor = function( ccm, opts )
{
    executor.Executor.call( this, ccm, opts );

    opts = opts || {};
    this._contexts = [];

    var _this = this;

    // --
    var allowed_origins = opts[ this.OPT_ALLOWED_ORIGINS ] || {};

    if ( allowed_origins instanceof Array )
    {
        allowed_origins = _.object( allowed_origins, allowed_origins );
    }

    this.allowed_origins = allowed_origins;

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
                ctx._cleanup();
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

    // Not valid request
    // ---
    if ( ( typeof ftnreq !== 'object' ) ||
         !( 'rid' in ftnreq ) ||
         !( origin in this.allowed_origins ) )
    {
        return;
    }

    var rid = ftnreq.rid;

    // Handle response to server-initiated request
    // ---
    if ( !( 'f' in ftnreq ) &&
         ( rid.charAt( 0 ) === 'S' ) )
    {
        var revreq = this._reverse_requests;
        var reqas = revreq.reqas[ rid ];

        if ( reqas )
        {
            reqas.success( ftnreq, 'application/futoin+json' );
            delete revreq.reqas[ rid ];
        }

        if ( event.stopPropagation )
        {
            event.stopPropagation();
        }
        return;
    }

    // ---
    if ( !( 'f' in ftnreq ) ||
         ( rid.charAt( 0 ) !== 'C' ) )
    {
        // ignore, not client request
        return;
    }

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
                rid : rid
            },
            context._event_origin
        );
    };

    as.add(
        function( as )
        {
            as.setCancel( cancel_req );
            _this.process( as );

            as.add(
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
            );
        }
    ).execute();

    if ( event.stopPropagation )
    {
        event.stopPropagation();
    }
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
