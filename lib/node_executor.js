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
var HTTPChannelContext = function( executor, req, rsp )
{
    request.ChannelContext.call( this, executor );
    _.extend( this, HTTPChannelContextProto );
    this._http_req = req;
    this._http_rsp = rsp;
};

var HTTPChannelContextProto = {};

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

// ---
var WSChannelContext = function( executor, conn )
{
    request.ChannelContext.call( this, executor );
    _.extend( this, WSChannelContextProto );
    this._ws_conn = conn;
    conn._ftn_srid = 1;
    conn._ftn_reqas = {};
};

var WSChannelContextProto = {};

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
    _.extend( this, events.EventEmitter.prototype );
    events.EventEmitter.call( this );

    executor.Executor.call( this, ccm, opts );
    _.extend( this, NodeExecutorProto, NodeExecutorConst );

    opts = opts || {};
    this._msg_sniffer = opts[ this.OPT_MSG_SNIFFER ] || function()
            {};

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

var NodeExecutorProto = {};

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

    this._handleHTTPRequestCommon( ftnreq, req, rsp, ( req.method === 'POST' ) );
    return true;
};

NodeExecutorProto._handleHTTPRequestCommon = function( ftnreq, req, rsp, raw_upload )
{
    var _this = this;
    var reqinfo = new request.RequestInfo( this, ftnreq );

    // ---
    var source_address = req.connection.remoteAddress;

    if ( this._trust_proxy &&
            req.headers[ 'x-forwarded-for' ] )
    {
        source_address = req.headers[ 'x-forwarded-for' ];
    }

    source_address = new request.SourceAddress( null, source_address, req.connection.remotePort );

    // ---
    this._msg_sniffer( source_address, ftnreq, true );

    // ---
    var reqinfo_info = reqinfo.info;
    reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] =
            new HTTPChannelContext( this, req, rsp );
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
                var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];

                reqinfo.cancelAfter( 0 );
                reqinfo._as = null;
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
                    if ( reqinfo_info[ reqinfo.INFO_HAVE_RAW_RESULT ] )
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
                var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];
                var ws_conn = context._ws_conn;

                reqinfo.cancelAfter( 0 );
                reqinfo._as = null;
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

NodeExecutorProto._onNotExpected = function( as, err, error_info )
{
    void as;
    this.emit( 'notExpected', err, error_info );
};

exports = module.exports = NodeExecutor;
