"use strict";

var _ = require( 'lodash' );
var executor = require( './executor' );
var request = require( './request' );
var WebSocket = require( 'faye-websocket' );
var http = require( 'http' );
var events = require( 'events' );
var url = require( 'url' );
var async_steps = require( 'futoin-asyncsteps' );

// TODO: message size limit @security

// ---
var HTTPChannelContext = function( req, rsp )
{
    this._http_req = req;
    this._http_rsp = rsp;
};

var HTTPChannelContextProto = new request.ChannelContext();

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

HTTPChannelContextProto.openRawInput = function()
{
    return this._http_req;
};

HTTPChannelContextProto.openRawOutput = function()
{
    return this._http_rsp;
};

HTTPChannelContext.prototype = HTTPChannelContextProto;

// ---
var WSChannelContext = function( conn )
{
    this._ws_conn = conn;
};

var WSChannelContextProto = new request.ChannelContext();

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

WSChannelContext.prototype = WSChannelContextProto;

// ---
var NodeExecutorConst =
{
    OPT_HTTP_SERVER : 'http_server',
    OPT_HTTP_ADDR : 'http_addr',
    OPT_HTTP_PORT : 'http_port',
    OPT_HTTP_PATH : 'http_path',
    OPT_IS_SECURE_CHANNEL : 'secure_channel',
    OPT_TRUST_PROXY : "trust_proxy"
};

_.extend( NodeExecutorConst, executor.ExecutorConst );

var NodeExecutor = function( ccm, opts )
{
    events.EventEmitter.call( this );
    executor.Executor.call( this, ccm, opts );

    var _this = this;

    // ---
    if ( !opts[ this.OPT_HTTP_PATH ] )
    {
        console.log( '[Executor] Missing OPT_HTTP_PATH option' );
        throw Error( 'InternalError' );
    }

    // ---
    var http_path = opts[ this.OPT_HTTP_PATH ] || '/';

    if ( http_path[ http_path.length - 1 ] !== '/' )
    {
        http_path += '/';
    }

    this._http_path = http_path;

    // ---
    this._is_secure_channel = opts[ this.OPT_IS_SECURE_CHANNEL ] || false;
    this._trust_proxy = opts[ this.OPT_TRUST_PROXY ] || false;

    // ---
    var http_server;
    var managed_server = false;

    if ( opts[ this.OPT_HTTP_SERVER ] )
    {
        http_server = opts[ this.OPT_HTTP_SERVER ];
    }
    else if ( opts[ this.OPT_HTTP_ADDR ] && opts[ this.OPT_HTTP_PORT ] )
    {
        http_server = http.createServer();

        http_server.listen( opts[ this.OPT_HTTP_PORT ], opts[ this.OPT_HTTP_ADDR ] );

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
        console.log( '[Executor] Neither OPT_HTTP_SERVER nor OPT_HTTP_ADDR & OPT_HTTP_PORT set' );
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

_.extend( NodeExecutor, NodeExecutorConst );

var NodeExecutorProto = new executor.Executor();
_.extend( NodeExecutorProto, NodeExecutorConst );
_.extend( NodeExecutorProto, events.EventEmitter.prototype );
NodeExecutor.prototype = NodeExecutorProto;

NodeExecutorProto._http_server = null;
NodeExecutorProto._http_path = null;

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
                var reqinfo = new request.RequestInfo( _this, ftnreq );
                _this._handleHTTPRequestCommon( reqinfo, req, rsp, false );
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
        ftnreq.sec = pathname[3];
    }

    var reqinfo = new request.RequestInfo( _this, ftnreq );
    this._handleHTTPRequestCommon( reqinfo, req, rsp, ( req.method === 'POST' ) );
    return true;
};

NodeExecutorProto._handleHTTPRequestCommon = function( reqinfo, req, rsp, raw_upload )
{
    var _this = this;

    var source_address = req.connection.remoteAddress;

    if ( this._trust_proxy &&
            req.headers[ 'x-forwarded-for' ] )
    {
        source_address = req.headers[ 'x-forwarded-for' ];
    }

    source_address = new request.SourceAddress( null, source_address, req.connection.remotePort );

    // ---
    var reqinfo_info = reqinfo.info;
    reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] =
            new HTTPChannelContext( req, rsp );
    reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ] = source_address;
    reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] = this._is_secure_channel;
    reqinfo_info[ reqinfo.INFO_HAVE_RAW_UPLOAD ] = raw_upload;

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

        reqinfo.cancelAfter( 0 );
        reqinfo._as = null;
        req.removeListener( 'close', close_req );

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
            _this.process( as );
            as.setCancel( cancel_req );
        },
        function( as, err )
        {
            void err;
            _this.emit( 'error', reqinfo, 'Internal Server Error' );
        }
    ).add(
        function( as )
        {
            void as;
            var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];

            reqinfo.cancelAfter( 0 );
            reqinfo._as = null;
            req.removeListener( 'close', close_req );

            if ( ftnrsp !== null )
            {
                rsp.writeHead(
                    200,
                    {
                        'Content-Type' : 'application/futoin+json',
                        'Content-Length' : Buffer.byteLength( ftnrsp, 'utf8' )
                    }
                );
                rsp.end( ftnrsp, 'utf8' );
            }
            else
            {
                rsp.end();
            }
        }
    );

    as.execute();
};

NodeExecutorProto.handleWSConnection = function( ugrade_req, ws )
{
    // ---
    var _this = this;

    var source_addr = ugrade_req.connection.remoteAddress;

    if ( this._trust_proxy &&
        ugrade_req.headers[ 'x-forwarded-for' ] )
    {
        source_addr = ugrade_req.headers[ 'x-forwarded-for' ];
    }

    source_addr = new request.SourceAddress(
                null,
                source_addr,
                ugrade_req.connection.remotePort
    );

    var context = new WSChannelContext( ws );
    context._source_addr = source_addr;

    ws.on(
        'message',
        function( event )
        {
            _this._handleWSRequest( context, event.data );
        }
    );
};

NodeExecutorProto._handleWSRequest = function( context, ftnreq )
{
    var reqinfo = new request.RequestInfo( this, ftnreq );

    var reqinfo_info = reqinfo.info;
    reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] = context;
    reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ] = context._source_addr;
    reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] = this._is_secure_channel;

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

        reqinfo.cancelAfter( 0 );
        reqinfo._as = null;

        try
        {
            ws_conn.send( JSON.stringify( ftnrsp ) );
        }
        catch ( e )
        {}
    };

    as.add(
        function( as )
        {
            _this.process( as );
            as.setCancel( cancel_req );
        },
        function( as, err )
        {
            void err;
            context._ws_conn.ws_conn.removeListener( 'close', close_req );
            _this.emit( 'error', reqinfo, 'Internal Server Error' );
        }
    ).add(
        function( as )
        {
            void as;
            var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];
            var ws_conn = context._ws_conn;

            reqinfo.cancelAfter( 0 );
            reqinfo._as = null;
            ws_conn.removeListener( 'close', close_req );

            if ( ftnrsp !== null )
            {
                ws_conn.send( ftnrsp );
            }
        }
    ).execute();
};

NodeExecutorProto.close = function( close_cb )
{
    this._http_server.close( close_cb );
};

NodeExecutorProto._onNotExpected = function( as, err, error_info )
{
    void as;
    this.emit( 'notExpected', err, error_info );
};

exports = module.exports = NodeExecutor;
