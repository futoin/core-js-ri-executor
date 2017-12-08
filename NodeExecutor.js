"use strict";

/**
 * @file
 *
 * Copyright 2014-2017 FutoIn Project (https://futoin.org)
 * Copyright 2014-2017 Andrey Galkin <andrey@futoin.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const _defaults = require( 'lodash/defaults' );
const WebSocket = require( 'faye-websocket' );
const http = require( 'http' );
const url = require( 'url' );
const async_steps = require( 'futoin-asyncsteps' );
const Cookies = require( "cookies" );

const Executor = require( './Executor' );
const ChannelContext = require( './ChannelContext' );
const SourceAddress = require( './SourceAddress' );
const RequestInfo = require( './RequestInfo' );

// TODO: message size limit @security

// ---
class HTTPChannelContext extends ChannelContext {
    constructor( executor, req, rsp ) {
        super( executor );
        this._http_req = req;
        this._http_rsp = rsp;
        this._cookies = null;
    }

    type() {
        return "HTTP";
    }

    onInvokerAbort( callable, user_data ) {
        this._http_req.on(
            'close',
            () => callable( user_data )
        );
    }

    _openRawInput() {
        return this._http_req;
    }

    _openRawOutput() {
        return this._http_rsp;
    }

    getRequestHeaders() {
        return this._http_req.headers;
    }

    setResponseHeader( name, value, override ) {
        const rsp = this._http_rsp;

        if ( override === false ) {
            const old = rsp.getHeader( name );

            if ( old ) {
                value = [ value, old ];
            }
        }

        rsp.setHeader( name, value );
    }

    setStatusCode( code ) {
        this._http_rsp.statusCode = code;
    }

    _initCookies() {
        let cookies = this._cookies;

        if ( !cookies ) {
            cookies = new Cookies( this._http_req, this._http_rsp );
            this._cookies = cookies;
        }

        return cookies;
    }

    getCookie( name ) {
        const cookies = this._initCookies();

        return cookies.get( name );
    }

    setCookie( name, value, options ) {
        const cookies = this._initCookies();

        options = options || {};
        options.maxAge = options.max_age || undefined;
        options.httpOnly = options.http_only || undefined;
        options.secure = options.secure || this._is_secure_channel;
        options.overwrite = true;

        return cookies.set( name, value, options );
    }
}

// ---
class WSChannelContext extends ChannelContext {
    constructor( executor, conn ) {
        super( executor );
        this._ws_conn = conn;
        conn._ftn_srid = 1;
        conn._ftn_reqas = {};
    }

    type() {
        return "WS";
    }

    isStateful() {
        return true;
    }

    onInvokerAbort( callable, user_data ) {
        this._ws_conn.on(
            'close',
            () => callable( user_data )
        );
    }

    _getPerformRequest() {
        const ws_conn = this._ws_conn;

        return ( as, ctx, ftnreq ) => {
            as.add( ( as ) => {
                const rid = 'S' + ws_conn._ftn_srid++;

                ftnreq.rid = rid;

                //
                if ( ctx.expect_response ) {
                    const reqas = ws_conn._ftn_reqas;

                    reqas[ rid ] = as;

                    as.setCancel( ( ) => {
                        delete reqas[ rid ];
                    } );
                }

                // It seems, send is not affected by max length limit
                // in current websocket impl. Leaving for possible
                // issues in the future.
                // dirty hack
                // ws_conn._driver._maxLength = Math.max(
                //  ws_conn._driver._maxLength,
                //  ctx.max_rsp_size,
                //  ctx.max_req_size
                // );

                //
                const rawmsg = JSON.stringify( ftnreq );

                ws_conn._sniffer( ws_conn._source_addr, rawmsg, false );
                ws_conn.send( rawmsg );
            } );
        };
    }
}

/**
 * Pseudo-class for NodeExecutor options documentation
 * @class
 * @extends ExecutorOptions
 */
const NodeExecutorOptions =
{
    /**
     * Provide a pre-configured HTTP server instance or
     * use httpPort [& httpAddr] options
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
 * @param {AdvancedCCM} ccm - CCM for internal requests
 * @param {NodeExecutorOptions} opts - executor options
 */
class NodeExecutor extends Executor {
    constructor( ccm, opts ) {
        super( ccm, opts );

        opts = opts || {};
        _defaults( opts, NodeExecutorOptions );

        this._msg_sniffer = opts.messageSniffer;

        // ---
        if ( !opts.httpPath ) {
            /* eslint-disable no-console */
            console.log( '[Executor] Missing httpPath option' );
            /* eslint-enable no-console */
            throw Error( 'InternalError' );
        }

        // ---
        let http_path = opts.httpPath;

        if ( http_path[ http_path.length - 1 ] !== '/' ) {
            http_path += '/';
        }

        this._http_path = http_path;

        // ---
        this._is_secure_channel = opts.secureChannel || false;
        this._trust_proxy = opts.trustProxy || false;

        // ---
        let http_server;
        let managed_server = false;

        if ( opts.httpServer ) {
            http_server = opts.httpServer;
        } else if ( opts.httpPort ) {
            http_server = http.createServer();

            http_server.listen(
                opts.httpPort,
                opts.httpAddr,
                opts.httpBacklog );

            http_server.on(
                'listening',
                () => this.emit( 'ready' )
            );

            managed_server = true;
        } else {
            /* eslint-disable no-console */
            console.log( '[Executor] Neither httpServer nor httpAddr & httpPort set' );
            /* eslint-enable no-console */
            throw Error( 'InternalError' );
        }

        this._http_server = http_server;

        // HTTP
        // ---
        http_server.on(
            'request',
            ( req, rsp ) => {
                if ( !this.handleHTTPRequest( req, rsp ) &&
                    managed_server ) {
                    try {
                        req.socket.destroy();
                    } catch ( e ) {
                        // ignore
                    }
                }
            }
        );

        // WebSocket
        // ---
        http_server.on(
            'upgrade',
            ( req, sock, body ) => {
                const http_path = this._http_path;
                let req_url = req.url;

                req_url = ( req_url + '/' ).substr( 0, http_path.length );

                if ( ( req_url === http_path ) &&
                    WebSocket.isWebSocket( req ) ) {
                    const ws = new WebSocket(
                        req,
                        sock,
                        body,
                        null,
                        { maxLength : this._maxReqSize }
                    );

                    this.handleWSConnection( req, ws );
                } else if ( managed_server ) {
                    try {
                        req.socket.destroy();
                    } catch ( e ) {
                        // ignore
                    }
                }
            }
        );
    }

    /**
    * Entry point to process HTTP request
    * @param {http.IncomingMessage} req - incoming HTTP request
    * @param {http.ServerResponse} rsp - response object
    * @returns {Boolean} true on success
    */
    handleHTTPRequest( req, rsp ) {
        // ---
        const http_path = this._http_path;
        const req_url = req.url;

        if ( ( req_url + '/' ).substr( 0, http_path.length ) !== http_path ) {
            return false;
        }

        // ---
        req.on(
            'error',
            () => this.emit( 'requestError', req )
        );

        if ( ( req_url === http_path ) ||
                ( req_url + '/' === http_path ) ) {
            if ( req.method !== 'POST' ) {
                rsp.writeHead( 400, 'Invalid Request' );
                rsp.end();
                return true;
            }

            const data = [];
            let len = 0;

            req.on(
                'data',
                ( chunk ) => {
                    len += chunk.length;

                    if ( len > this._maxReqSize ) {
                        this.emit( 'clientError', req, 'Request size has exceeded safety limit' );

                        try {
                            req.socket.destroy();
                        } catch ( e ) {
                            // ignore
                        }

                        return;
                    }

                    data.push( chunk );
                }
            );

            req.on(
                'end',
                () => {
                    let ftnreq = data.join( '' );

                    try {
                        ftnreq = JSON.parse( ftnreq );
                    } catch ( e ) {
                        ftnreq = {};
                        // fail through standard path
                    }

                    this._handleHTTPRequestCommon( ftnreq, req, rsp, false );
                }
            );
            return true;
        }

        // ---
        const parsed_url = url.parse( req_url, true );
        const pathname = parsed_url.pathname
            .substr( http_path.length )
            .split( '/' );

        const ftnreq =
        {
            f : pathname.slice( 0, 3 ).join( ':' ),
            p : parsed_url.query,
        };

        if ( pathname.length > 3 ) {
            ftnreq.sec = pathname[ 3 ];
        } else if ( 'authorization' in req.headers ) {
            const auth = req.headers.authorization.split( /\s+/ );

            if ( auth[ 0 ] === 'Basic' ) {
                ftnreq.sec = ( new Buffer( auth[ 1 ], 'base64' ) ).toString();
            }
        }

        this._handleHTTPRequestCommon( ftnreq, req, rsp, ( req.method === 'POST' ), true );
        return true;
    }

    _handleHTTPRequestCommon( ftnreq, req, rsp, raw_upload, from_query ) {
        const reqinfo = new RequestInfo( this, ftnreq );

        // ---
        const context = new HTTPChannelContext( this, req, rsp );

        context._is_secure_channel = this._is_secure_channel;

        // ---
        let source_address = req.connection.remoteAddress;

        if ( this._trust_proxy &&
                req.headers[ 'x-forwarded-for' ] ) {
            source_address = req.headers[ 'x-forwarded-for' ];
        }

        source_address = new SourceAddress( null, source_address, req.connection.remotePort );

        // ---
        this._msg_sniffer( source_address, ftnreq, true );

        // ---
        const reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_address;
        reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;
        reqinfo_info.HAVE_RAW_UPLOAD = raw_upload;
        reqinfo_info._from_query_string = from_query;

        const as = async_steps();

        as.state.reqinfo = reqinfo;

        const close_req = () => as.cancel();

        req.once( 'close', close_req );

        reqinfo._as = as;

        const cancel_req = ( as ) => {
            const ftnrsp = '{"e":"InternalError"}';

            reqinfo._cleanup();
            req.removeListener( 'close', close_req );

            this._msg_sniffer( source_address, ftnrsp, false );

            rsp.writeHead(
                200,
                {
                    'Content-Type' : 'application/futoin+json',
                    'Content-Length' : Buffer.byteLength( ftnrsp, 'utf8' ),
                }
            );
            rsp.end( ftnrsp, 'utf8' );
        };

        as.add(
            ( as ) => {
                as.setCancel( cancel_req );

                this.process( as );

                as.add( ( as ) => {
                    const ftnrsp = reqinfo_info.RAW_RESPONSE;

                    reqinfo._cleanup();
                    req.removeListener( 'close', close_req );

                    if ( ftnrsp !== null ) {
                        const rawmsg = this.packPayloadJSON( ftnrsp );

                        this._msg_sniffer( source_address, rawmsg, false );

                        rsp.writeHead(
                            200,
                            {
                                'Content-Type' : 'application/futoin+json',
                                'Content-Length' : Buffer.byteLength( rawmsg, 'utf8' ),
                            }
                        );
                        rsp.end( rawmsg, 'utf8' );
                    } else {
                        if ( reqinfo_info.HAVE_RAW_RESULT ) {
                            this._msg_sniffer( source_address, '%DATA%', false );
                        }

                        rsp.end();
                    }
                } );
            },
            ( as, err ) => {
                this.emit( 'error', reqinfo, 'Internal Server Error' );
            }
        ).execute();
    }

    /**
    * Entry point to process HTTP upgrade request with WebSocket
    * @param {http.IncomingMessage} upgrade_req - original HTTP upgrade request
    * @param {WebSocket} ws - WebSockets connection object
    */
    handleWSConnection( upgrade_req, ws ) {
        // ---
        let source_addr = upgrade_req.connection.remoteAddress;

        if ( this._trust_proxy &&
            upgrade_req.headers[ 'x-forwarded-for' ] ) {
            source_addr = upgrade_req.headers[ 'x-forwarded-for' ];
        }

        source_addr = new SourceAddress(
            null,
            source_addr,
            upgrade_req.connection.remotePort
        );

        const context = new WSChannelContext( this, ws );

        context._source_addr = source_addr;
        ws._source_addr = source_addr;
        ws._sniffer = this._msg_sniffer;

        ws.on(
            'close',
            ( ) => context._cleanup()
        );

        ws.on(
            'message',
            ( event ) => {
                this._msg_sniffer( source_addr, event.data, true );

                let ftnreq;

                try {
                    ftnreq = JSON.parse( event.data );
                } catch ( e ) {
                    return; // ignore
                }

                // Handle response to server-initiated request
                const rid = ftnreq.rid;

                if ( rid.charAt( 0 ) === 'S' ) {
                    const reqas = ws._ftn_reqas[ rid ];

                    if ( reqas ) {
                        reqas.success( ftnreq, 'application/futoin+json' );
                        delete ws._ftn_reqas[ rid ];
                    }

                    return;
                }

                this._handleWSRequest( context, ftnreq );
            }
        );
    }

    _handleWSRequest( context, ftnreq ) {
        const reqinfo = new RequestInfo( this, ftnreq );

        const reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = context._source_addr;
        reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;

        const as = async_steps();

        as.state.reqinfo = reqinfo;

        const close_req = () => as.cancel();

        context._message_count = context._message_count || 10;
        context._message_count += 1;

        context._ws_conn.setMaxListeners( context._message_count << 1 );
        context._ws_conn.once( 'close', close_req );

        reqinfo._as = as;

        const cancel_req = ( as ) => {
            const ws_conn = context._ws_conn;
            const ftnrsp = {
                rid : reqinfo._rawreq.rid,
                e : "InternalError",
            };

            reqinfo._cleanup();

            try {
                const rawmsg = JSON.stringify( ftnrsp );

                this._msg_sniffer( context._source_addr, rawmsg, false );
                ws_conn.send( rawmsg );
            } catch ( e ) {
                // ignore
            }
        };

        as.add(
            ( as ) => {
                as.setCancel( cancel_req );

                this.process( as );

                as.add( ( as ) => {
                    const ftnrsp = reqinfo_info.RAW_RESPONSE;
                    const ws_conn = context._ws_conn;

                    reqinfo._cleanup();
                    ws_conn.removeListener( 'close', close_req );
                    context._message_count -= 1;

                    if ( ftnrsp !== null ) {
                        const rawmsg = this.packPayloadJSON( ftnrsp );

                        this._msg_sniffer( context._source_addr, rawmsg, false );
                        ws_conn.send( rawmsg );
                    }
                } );
            },
            ( as, err ) => {
                context._ws_conn.removeListener( 'close', close_req );
                context._message_count -= 1;
                this.emit( 'error', reqinfo, 'Internal Server Error' );
            }
        );
        as.execute();
    }

    close( close_cb ) {
        Executor.prototype.close.apply( this, [] );
        this._http_server.close( close_cb );
    }
}

module.exports = NodeExecutor;
