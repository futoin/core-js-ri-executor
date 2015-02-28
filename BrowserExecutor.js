"use strict";

var _clone = require( 'lodash/lang/clone' );
var _zipObject = require( 'lodash/array/zipObject' );
var _defaults = require( 'lodash/object/defaults' );
var async_steps = require( 'futoin-asyncsteps' );
var performance_now = require( "performance-now" );
var browser_window = window; // jshint ignore:line

var Executor = require( './Executor' );
var ChannelContext = require( './ChannelContext' );
var SourceAddress = require( './SourceAddress' );
var RequestInfo = require( './RequestInfo' );

/**
 * Browser Channel Context
 * @ignore
 */
var BrowserChannelContext = function( executor, event )
{
    ChannelContext.call( this, executor );

    this._event_origin = event.origin;
    this._event_source = event.source;
    this._last_used = performance_now();
    this._is_secure_channel = true;
};

var BrowserChannelContextProto = _clone( ChannelContext.prototype );
BrowserChannelContext.prototype = BrowserChannelContextProto;

BrowserChannelContextProto._event_origin = null;
BrowserChannelContextProto._event_source = null;

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
    var evt_origin = this._event_origin;
    var evt_source = this._event_source;
    var revreq = this._executor._reverse_requests;
    var sniffer = this._executor._msg_sniffer;

    return function( as, ctx, ftnreq )
    {
        as.add( function( as )
        {
            var rid = 'S' + revreq.rid++;
            ftnreq.rid = rid;

            //
            if ( ctx.expect_response )
            {
                var sentreqs = revreq.sentreqs;
                sentreqs[ rid ] = {
                    reqas : as,
                    evt_origin : evt_origin,
                    evt_source : evt_source
                };

                as.setCancel(
                    function( )
                    {
                        delete sentreqs[ rid ];
                    }
                );
            }

            //
            sniffer( evt_origin, ftnreq, false );
            evt_source.postMessage( ftnreq, evt_origin );
        } );
    };
};

/**
 * Pseudo-class for BrowserExecutor options documentation
 * @class
 * @extends ExecutorOptions
 */
var BrowserExecutorOptions =
{
    /**
     * Client timeout MS
     * @default
     */
    clientTimeoutMS : 600,

    /**
     * List of allowed page origins for incoming connections.
     * It is MANDATORY for security reasons.
     *
     * Example:
     * * 'http://localhost:8000'
     * * 'http://example.com'
     * @default
     */
    allowedOrigins : [],
};

/**
 * Browser Executor with HTML5 Web Messaging as incoming transport.
 *
 * It allows communication across open pages (frames/tabs/windows) inside client browser.
 * @param {AdvancedCCM} ccm
 * @param {object} opts - see BrowserExecutorOptions
 * @class
 */
var BrowserExecutor = function( ccm, opts )
{
    Executor.call( this, ccm, opts );

    opts = opts || {};
    _defaults( opts, BrowserExecutorOptions );

    this._msg_sniffer = opts.messageSniffer;
    this._contexts = [];
    this._reverse_requests = {
        rid : 1,
        sentreqs : {}
    };

    var _this = this;

    // --
    var allowed_origins = opts.allowedOrigins || {};

    if ( allowed_origins instanceof Array )
    {
        allowed_origins = _zipObject( allowed_origins, allowed_origins );
    }

    this.allowed_origins = allowed_origins;

    // --
    var client_timeout = opts.clientTimeoutMS;

    var connection_cleanup = function()
    {
        var ctx_list = _this._contexts;
        var remove_time = performance_now() - client_timeout;

        for ( var i = ctx_list.length - 1; i >= 0; --i )
        {
            var ctx = ctx_list[ i ];

            if ( ctx._last_used < remove_time )
            {
                ctx._cleanup();
                ctx_list.splice( i, 1 );
            }
        }

        setTimeout( connection_cleanup, client_timeout * 1e3 );
    };

    connection_cleanup();

    // --
    this._event_listener = function( event )
    {
        _this.handleMessage( event );
    };

    browser_window.addEventListener( 'message', this._event_listener );
};

var BrowserExecutorProto = _clone( Executor.prototype );
BrowserExecutor.prototype = BrowserExecutorProto;

/**
 * Current list of allowed origins for modifications. Please note that
 * it is an object, where field is actual origin and value must evaluate
 * to true.
 * @alias BrowserExecutor.allowed_origins
 */
BrowserExecutorProto.allowed_origins = null;

BrowserExecutorProto.handleMessage = function( event )
{
    this._msg_sniffer( event, event.data, true );

    var ftnreq = event.data;
    var source = event.source;
    var origin = event.origin;

    // Not valid request
    // ---
    if ( ( typeof ftnreq !== 'object' ) ||
         !( 'rid' in ftnreq ) )
    {
        return;
    }

    var rid = ftnreq.rid;

    // Handle response to server-initiated request
    // ---
    if ( !( 'f' in ftnreq ) &&
         ( rid.charAt( 0 ) === 'S' ) )
    {
        var sentreqs = this._reverse_requests.sentreqs;
        var sreq = sentreqs[ rid ];

        if ( sreq &&
             ( source === sreq.evt_source ) &&
             ( origin === sreq.evt_origin ) )
        {
            sreq.reqas.success( ftnreq, 'application/futoin+json' );
            delete sentreqs[ rid ];
        }

        if ( event.stopPropagation )
        {
            event.stopPropagation();
        }
        return;
    }

    // ---
    if ( !( 'f' in ftnreq ) ||
         ( rid.charAt( 0 ) !== 'C' ) ||
         !( origin in this.allowed_origins ) )
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
    var source_addr = new SourceAddress(
                'LOCAL',
                source,
                origin
    );

    // ---
    var reqinfo = new RequestInfo( this, ftnreq );

    var reqinfo_info = reqinfo.info;
    reqinfo_info.CHANNEL_CONTEXT = context;
    reqinfo_info.CLIENT_ADDR = source_addr;
    reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;

    var _this = this;

    var as = async_steps();
    as.state.reqinfo = reqinfo;

    reqinfo._as = as;

    var cancel_req = function( as )
    {
        void as;
        reqinfo._cleanup();

        var ftnrsp = {
            e : 'InternalError',
            rid : rid
        };

        _this._msg_sniffer( event, ftnrsp, false );
        context._event_source.postMessage( ftnrsp, context._event_origin );
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
                    var ftnrsp = reqinfo_info.RAW_RESPONSE;

                    reqinfo._cleanup();

                    if ( ftnrsp !== null )
                    {
                        _this._msg_sniffer( event, ftnrsp, false );
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

module.exports = BrowserExecutor;
