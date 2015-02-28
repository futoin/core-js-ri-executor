"use strict";

var _clone = require( 'lodash/lang/clone' );
var _defaults = require( 'lodash/object/defaults' );
var WebSocket = require( 'faye-websocket' );
var http = require( 'http' );
var url = require( 'url' );
var async_steps = require( 'futoin-asyncsteps' );
var Cookies = require( "cookies" );

var Executor = require( './Executor' );
var ChannelContext = require( './ChannelContext' );
var SourceAddress = require( './SourceAddress' );
var RequestInfo = require( './RequestInfo' );

// TODO: message size limit @security

// ---
var HTTPChannelContext = function( executor, req, rsp )
{
    ChannelContext.call( this, executor );
    this._http_req = req;
    this._http_rsp = rsp;
};

var HTTPChannelContextProto = _clone( ChannelContext.prototype );
HTTPChannelContext.prototype = HTTPChannelContextProto;

HTTPChannelContextProto._http_req = null;
HTTPChannelContextProto._http_rsp = null;
HTTPChannelContextProto._cookies = null;

HTTPChannelContextProto.type = function()
{
    return "HTTP";
};

HTTPChannelContextProto.onInvokerAbort = function( callable, user_data )
{
    this._http_req.on(
        'close',
        function()
        {
            callable( user_data );
        }
    );
};

HTTPChannelContextProto._openRawInput = function()
{
    return this._http_req;
};

HTTPChannelContextProto._openRawOutput = function()
{
    return this._http_rsp;
};

HTTPChannelContextProto.getRequestHeaders = function()
{
    return this._http_req.headers;
};

HTTPChannelContextProto.setResponseHeader = function( name, value, override )
{
    var rsp = this._http_rsp;

    if ( override === false )
    {
        var old = rsp.getHeader( name );

        if ( old )
        {
            value = [ value, old ];
        }
    }

    rsp.setHeader( name, value );
};

HTTPChannelContextProto.setStatusCode = function( code )
{
    this._http_rsp.statusCode = code;
};

HTTPChannelContextProto._initCookies = function()
{
    var cookies = this._cookies;

    if ( !cookies )
    {
        cookies = new Cookies( this._http_req, this._http_rsp );
        this._cookies = cookies;
    }

    return cookies;
};

HTTPChannelContextProto.getCookie = function( name )
{
    var cookies = this._initCookies();
    return cookies.get( name );
};

HTTPChannelContextProto.setCookie = function( name, value, options )
{
    var cookies = this._initCookies();

    options = options || {};
    options.maxAge = options.max_age || undefined;
    options.httpOnly = options.http_only || undefined;
    options.secure = options.secure || this._is_secure_channel;
    options.overwrite = true;

    return cookies.set( name, options );
};

// ---
var WSChannelContext = function( executor, conn )
{
    ChannelContext.call( this, executor );
    this._ws_conn = conn;
    conn._ftn_srid = 1;
    conn._ftn_reqas = {};
};

var WSChannelContextProto = _clone( ChannelContext.prototype );
WSChannelContext.prototype = WSChannelContextProto;

WSChannelContextProto._ws_conn = null;

WSChannelContextProto.type = function()
{
    return "WS";
};

WSChannelContextProto.isStateful = function()
{
    return true;
};

WSChannelContextProto.onInvokerAbort = function( callable, user_data )
{
    this._ws_conn.on(
        'close',
        function()
        {
            callable( user_data );
        }
    );
};

WSChannelContextProto._getPerformRequest = function()
{
    var ws_conn = this._ws_conn;

    return function( as, ctx, ftnreq )
    {
        as.add( function( as )
        {
            var rid = 'S' + ws_conn._ftn_srid++;
            ftnreq.rid = rid;

            //
            if ( ctx.expect_response )
            {
                var reqas = ws_conn._ftn_reqas;
                reqas[ rid ] = as;

                as.setCancel(
                    function( )
                    {
                        delete reqas[ rid ];
                    }
                );
            }

            //
            var rawmsg = JSON.stringify( ftnreq );
            ws_conn._sniffer( ws_conn._source_addr, rawmsg, false );
            ws_conn.send( rawmsg );
        } );
    };
};

/**
 * Pseudo-class for NodeExecutor options documentation
 * @class
 * @extends ExecutorOptions
 */
var NodeExecutorOptions =
{
    /**
     * Provide a pre-configured HTTP server instance or
     * use httpAddr & httpPort options
     * @default
     */
    httpServer : null,

    /**
     * Bind address for internally created HTTP server
     * @default
     */
    httpAddr : null,

    /**
     * Bind port for internally created HTTP server
     * @default
     */
    httpPort : null,

    /**
     * Path to server FutoIn request on.
     *
     * NOTE: if httpServer is provided than all not related
     * requests are silently ignored. Otherwise, immediate
     * error is raised if request path does not match httpPath.
     * @default
     */
    httpPath : '/',

    /**
     * Option to configure internally created server backlog
     * @default
     */
    httpBacklog : null,

    /**
     * If true, if incoming transport as seen is 'SecureChannel', see FTN3.
     * Useful with reverse proxy and local connections.
     * @default
     */
    secureChannel : false,

    /**
     * If true, X-Forwarded-For will be used as Source Address, if present
     * @default
     */
    trustProxy : false,
};

/**
 * Executor implementation for Node.js/io.js with HTTP and WebSockets transport
 * @class
 */
var NodeExecutor = function( ccm, opts )
{
    Executor.call( this, ccm, opts );

    opts = opts || {};
    _defaults( opts, NodeExecutorOptions );

    this._msg_sniffer = opts.messageSniffer;

    var _this = this;

    // ---
    if ( !opts.httpPath )
    {
        console.log( '[Executor] Missing httpPath option' );
        throw Error( 'InternalError' );
    }

    // ---
    var http_path = opts.httpPath;

    if ( http_path[ http_path.length - 1 ] !== '/' )
    {
        http_path += '/';
    }

    this._http_path = http_path;

    // ---
    this._is_secure_channel = opts.secureChannel || false;
    this._trust_proxy = opts.trustProxy || false;

    // ---
    var http_server;
    var managed_server = false;

    if ( opts.httpServer )
    {
        http_server = opts.httpServer;
    }
    else if ( opts.httpAddr && opts.httpPort )
    {
        http_server = http.createServer();

        http_server.listen(
                opts.httpPort,
                opts.httpAddr,
                opts.httpBacklog );

        http_server.on(
            'listening',
            function()
            {
                _this.emit( 'ready' );
            }
        );

        managed_server = true;
    }
    else
    {
        console.log( '[Executor] Neither httpServer nor httpAddr & httpPort set' );
        throw Error( 'InternalError' );
    }

    this._http_server = http_server;

    // HTTP
    // ---
    http_server.on(
        'request',
        function( req, rsp )
        {
            if ( !_this.handleHTTPRequest( req, rsp ) &&
                 managed_server )
            {
                try
                {
                    req.socket.destroy();
                }
                catch ( e )
                {}
            }
        }
    );

    // WebSocket
    // ---
    http_server.on(
        'upgrade',
        function( req, sock, body )
        {
            var http_path = _this._http_path;
            var req_url = req.url;
            req_url = ( req_url + '/' ).substr( 0, http_path.length );

            if ( ( req_url === http_path ) &&
                 WebSocket.isWebSocket( req ) )
            {
                var ws = new WebSocket(
                        req,
                        sock,
                        body,
                        null,
                        {
                            maxLength : _this.SAFE_PAYLOAD_LIMIT
                        }
                );
                _this.handleWSConnection( req, ws );
            }
            else if ( managed_server )
            {
                try
                {
                    req.socket.destroy();
                }
                catch ( e )
                {}
            }
        }
    );
};

var NodeExecutorProto = _clone( Executor.prototype );
NodeExecutor.prototype = NodeExecutorProto;

NodeExecutorProto._msg_sniffer = null;
NodeExecutorProto._http_server = null;
NodeExecutorProto._http_path = null;
NodeExecutorProto._is_secure_channel = null;
NodeExecutorProto._trust_proxy = null;

/**
 * Entry point to process HTTP request
 * @param {http.IncomingMessage} req - incoming HTTP request
 * @param {http.ServerResponse} rsp - response object
 */
NodeExecutorProto.handleHTTPRequest = function( req, rsp )
{
    var _this = this;

    // ---
    var http_path = this._http_path;
    var req_url = req.url;

    if ( ( req_url + '/' ).substr( 0, http_path.length ) !== http_path )
    {
        return false;
    }

    // ---
    req.on(
        'error',
        function()
        {
            _this.emit( 'requestError', req );
        }
    );

    if ( ( req_url === http_path ) ||
            ( req_url + '/' === http_path ) )
    {
        if ( req.method !== 'POST' )
        {
            rsp.writeHead( 400, 'Invalid Request' );
            rsp.end();
            return true;
        }

        var data = [];
        var len = 0;

        req.on(
            'data',
            function( chunk )
            {
                len += chunk.length;

                if ( len > _this.SAFE_PAYLOAD_LIMIT )
                {
                    this.emit( 'clientError', req, 'Request size has exceeded safety limit' );
                    try
                    {
                        req.socket.destroy();
                    }
                    catch ( e )
                    {}
                    return;
                }

                data.push( chunk );
            }
        );

        req.on(
            'end',
            function()
            {
                var ftnreq = data.join( '' );
                _this._handleHTTPRequestCommon( ftnreq, req, rsp, false );
            }
        );
        return true;
    }

    // ---
    var parsed_url = url.parse( req_url, true );
    var pathname = parsed_url.pathname
        .substr( http_path.length )
        .split( '/' );

    var ftnreq =
    {
        f : pathname.slice( 0, 3 ).join( ':' ),
        p : parsed_url.query
    };

    if ( pathname.length > 3 )
    {
        ftnreq.sec = pathname[ 3 ];
    }
    else if ( 'authorization' in req.headers )
    {
        var auth = req.headers.authorization.split( /\s+/ );

        if ( auth[ 0 ] === 'Basic' )
        {
            ftnreq.sec = ( new Buffer( auth[ 1 ], 'base64' ) ).toString();
        }
    }

    this._handleHTTPRequestCommon( ftnreq, req, rsp, ( req.method === 'POST' ), true );
    return true;
};

NodeExecutorProto._handleHTTPRequestCommon = function( ftnreq, req, rsp, raw_upload, from_query )
{
    var _this = this;
    var reqinfo = new RequestInfo( this, ftnreq );

    // ---
    var context = new HTTPChannelContext( this, req, rsp );
    context._is_secure_channel = this._is_secure_channel;

    // ---
    var source_address = req.connection.remoteAddress;

    if ( this._trust_proxy &&
            req.headers[ 'x-forwarded-for' ] )
    {
        source_address = req.headers[ 'x-forwarded-for' ];
    }

    source_address = new SourceAddress( null, source_address, req.connection.remotePort );

    // ---
    this._msg_sniffer( source_address, ftnreq, true );

    // ---
    var reqinfo_info = reqinfo.info;
    reqinfo_info.CHANNEL_CONTEXT = context;
    reqinfo_info.CLIENT_ADDR = source_address;
    reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;
    reqinfo_info.HAVE_RAW_UPLOAD = raw_upload;
    reqinfo_info._from_query_string = from_query;

    var as = async_steps();
    as.state.reqinfo = reqinfo;

    var close_req = function()
    {
        as.cancel();
    };

    req.once( 'close', close_req );

    reqinfo._as = as;

    var cancel_req = function( as )
    {
        void as;
        var ftnrsp = '{"e":"InternalError"}';

        reqinfo._cleanup();
        req.removeListener( 'close', close_req );

        _this._msg_sniffer( source_address, ftnrsp, false );

        rsp.writeHead(
            200,
            {
                'Content-Type' : 'application/futoin+json',
                'Content-Length' : Buffer.byteLength( ftnrsp, 'utf8' )
            }
        );
        rsp.end( ftnrsp, 'utf8' );
    };

    as.add(
        function( as )
        {
            as.setCancel( cancel_req );

            _this.process( as );

            as.add( function( as )
            {
                void as;
                var ftnrsp = reqinfo_info.RAW_RESPONSE;

                reqinfo._cleanup();
                req.removeListener( 'close', close_req );

                if ( ftnrsp !== null )
                {
                    var rawmsg = _this.packPayloadJSON( ftnrsp );

                    _this._msg_sniffer( source_address, rawmsg, false );

                    rsp.writeHead(
                        200,
                        {
                            'Content-Type' : 'application/futoin+json',
                            'Content-Length' : Buffer.byteLength( rawmsg, 'utf8' )
                        }
                    );
                    rsp.end( rawmsg, 'utf8' );
                }
                else
                {
                    if ( reqinfo_info.HAVE_RAW_RESULT )
                    {
                        _this._msg_sniffer( source_address, '%DATA%', false );
                    }

                    rsp.end();
                }
            } );
        },
        function( as, err )
        {
            void err;
            _this.emit( 'error', reqinfo, 'Internal Server Error' );
        }
    ).execute();
};

/**
 * Entry point to process HTTP upgrade request with WebSocket
 * @param {http.IncomingMessage} upgrade_req - original HTTP upgrade request
 * @param {WebSocket} ws - WebSockets connection object
 */
NodeExecutorProto.handleWSConnection = function( upgrade_req, ws )
{
    // ---
    var _this = this;

    var source_addr = upgrade_req.connection.remoteAddress;

    if ( this._trust_proxy &&
        upgrade_req.headers[ 'x-forwarded-for' ] )
    {
        source_addr = upgrade_req.headers[ 'x-forwarded-for' ];
    }

    source_addr = new SourceAddress(
                null,
                source_addr,
                upgrade_req.connection.remotePort
    );

    var context = new WSChannelContext( this, ws );
    context._source_addr = source_addr;
    ws._source_addr = source_addr;
    ws._sniffer = this._msg_sniffer;

    ws.on(
        'close',
        function( )
        {
            context._cleanup();
        }
    );

    ws.on(
        'message',
        function( event )
        {
            _this._msg_sniffer( source_addr, event.data, true );

            var ftnreq;

            try
            {
                ftnreq = JSON.parse( event.data );
            }
            catch ( e )
            {
                return; // ignore
            }

            // Handle response to server-initiated request
            var rid = ftnreq.rid;

            if ( rid.charAt( 0 ) === 'S' )
            {
                var reqas = ws._ftn_reqas[ rid ];

                if ( reqas )
                {
                    reqas.success( ftnreq, 'application/futoin+json' );
                    delete ws._ftn_reqas[ rid ];
                }

                return;
            }

            _this._handleWSRequest( context, ftnreq );
        }
    );
};

NodeExecutorProto._handleWSRequest = function( context, ftnreq )
{
    var reqinfo = new RequestInfo( this, ftnreq );

    var reqinfo_info = reqinfo.info;
    reqinfo_info.CHANNEL_CONTEXT = context;
    reqinfo_info.CLIENT_ADDR = context._source_addr;
    reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;

    var _this = this;

    var as = async_steps();
    as.state.reqinfo = reqinfo;

    var close_req = function()
    {
        as.cancel();
    };

    context._ws_conn.once( 'close', close_req );

    reqinfo._as = as;

    var cancel_req = function( as )
    {
        void as;
        var ws_conn = context._ws_conn;
        var ftnrsp = {
            rid : reqinfo._rawreq.rid,
            e : "InternalError"
        };

        reqinfo._cleanup();

        try
        {
            var rawmsg = JSON.stringify( ftnrsp );
            _this._msg_sniffer( context._source_addr, rawmsg, false );
            ws_conn.send( rawmsg );
        }
        catch ( e )
        {}
    };

    as.add(
        function( as )
        {
            as.setCancel( cancel_req );

            _this.process( as );

            as.add( function( as )
            {
                void as;
                var ftnrsp = reqinfo_info.RAW_RESPONSE;
                var ws_conn = context._ws_conn;

                reqinfo._cleanup();
                ws_conn.removeListener( 'close', close_req );

                if ( ftnrsp !== null )
                {
                    var rawmsg = _this.packPayloadJSON( ftnrsp );
                    _this._msg_sniffer( context._source_addr, rawmsg, false );
                    ws_conn.send( rawmsg );
                }
            } );
        },
        function( as, err )
        {
            void err;
            context._ws_conn.ws_conn.removeListener( 'close', close_req );
            _this.emit( 'error', reqinfo, 'Internal Server Error' );
        }
    ).execute();
};

NodeExecutorProto.close = function( close_cb )
{
    this._http_server.close( close_cb );
};

module.exports = NodeExecutor;
