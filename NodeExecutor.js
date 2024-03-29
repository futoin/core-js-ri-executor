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

const _defaultsDeep = require( 'lodash/defaultsDeep' );
const WebSocket = require( 'ws' );
const http = require( 'http' );
const url = require( 'url' );
const async_steps = require( 'futoin-asyncsteps' );
const cookie = require( "cookie" );
const LRUCache = require( 'lru-cache' );

const { IPSet, Address4 } = require( 'futoin-ipset' );
const performance_now = require( "performance-now" );
const Limiter = async_steps.Limiter;
const {
    InvokerError,
    CommError,
} = async_steps.Errors;

const {
    MessageCoder,
    SpecTools,
} = require( 'futoin-invoker' );

const Executor = require( './Executor' );
const ChannelContext = require( './ChannelContext' );
const SourceAddress = require( './SourceAddress' );
const RequestInfo = require( './RequestInfo' );

const WS_SEND_OPTS = { binary: true, fin: true };
Object.freeze( WS_SEND_OPTS );

// ---
class HTTPChannelContext extends ChannelContext {
    constructor( executor, req, rsp ) {
        super( executor );
        this._http_req = req;
        this._http_rsp = rsp;
        this._cookies = null;
        this._is_secure_channel = false;
        Object.seal( this );
    }

    type() {
        return "HTTP";
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
            cookies = cookie.parse( this._http_req.headers.cookie || '' );
            this._cookies = cookies;
        }

        return cookies;
    }

    getCookie( name ) {
        const cookies = this._initCookies();

        return cookies[ name ];
    }

    setCookie( name, value, options={} ) {
        options = Object.assign( {}, options );
        options.maxAge = options.max_age || undefined;
        options.httpOnly = options.http_only || true;
        options.secure = options.secure || this._is_secure_channel;

        const to_set = cookie.serialize( name, value, options );

        const rsp = this._http_rsp;
        const cookies = rsp.getHeader['set-cookie'] || [];
        cookies.push( to_set );
        rsp.setHeader( 'set-cookie', cookies );
    }
}

// ---
class WSChannelContext extends ChannelContext {
    constructor( executor, conn ) {
        super( executor );
        this._ws_conn = conn;
        this._is_secure_channel = false;
        this._source_addr = null;
        this._srid = 1;
        this._srv_req_list = {};
        this._req_list = new Set();
        this._last_activity = process.hrtime();
        Object.seal( this );
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
                const rid = 'S' + this._srid++;

                ftnreq.rid = rid;

                //
                if ( ctx.expect_response ) {
                    const reqas = this._srv_req_list;

                    reqas[ rid ] = as;

                    as.setCancel( ( ) => {
                        delete reqas[ rid ];
                    } );
                }

                //
                const rawmsg = ctx.msg_coder.encode( ftnreq );
                const { max_req_size, max_rsp_size, options } = ctx;

                // dirty hack
                // ---
                const ws_receiver = ws_conn._receiver;

                if ( ws_receiver._maxPayload < max_rsp_size ) {
                    ws_receiver._maxPayload = max_rsp_size;
                }

                //---
                const msg_len = rawmsg.length;

                if ( msg_len > max_req_size ) {
                    as.error( InvokerError,
                        `Request message too long: ${rawmsg.length} > ${rawmsg.length}` );
                }


                // ---
                const buffer_max = options.commConcurrency * max_req_size;

                if ( ( ws_conn.bufferedAmount + msg_len ) > buffer_max ) {
                    as.error( CommError,
                        `Send buffer overflow: ${ws_conn.bufferedAmount}` );
                }

                ws_conn._sniffer( ws_conn._source_addr, rawmsg, false );
                ws_conn.send( rawmsg, WS_SEND_OPTS, ( err ) => {
                    if ( err ) {
                        ws_conn.terminate();
                    } else {
                        this._updateActivity();
                    }
                } );
            } );
        };
    }

    _updateActivity() {
        this._last_activity = process.hrtime();
    }

    _cleanup() {
        super._cleanup();

        const reqas = this._srv_req_list;

        for ( let srid in reqas ) {
            const as = reqas[srid];

            if ( as.state ) {
                as.error( CommError, 'Connection closed' );
            }
        }
    }
}

// ---
class ExecutorLimiter extends Limiter {
    constructor( options, stale_ms ) {
        super( options );
        this._stale_ms = Math.max( ( options.period_ms || 1e3 ) * 3, stale_ms );
        this.touch();
    }

    touch() {
        this._last_used = performance_now();
    }

    isStale() {
        if ( ( this._last_used + this._stale_ms ) > performance_now() ) {
            return false;
        }

        // TODO: extend AsyncSteps API
        return ( !this._mutex._locked && !this._throttle._current );
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
     * If true, X-Real-IP and X-Forwarded-For will be used as Source Address, if present
     * @default
     */
    trustProxy : false,

    /**
     * If true, then request limiter is enabled by default
     * @default
     */
    enableLimiter : false,

    /**
     * Interval to run limiter cleanup task for better cache performance and
     * correct reflection of active memory usage.
     * @default
     */
    cleanupLimitsMS: 60e3,

    /**
     * Interval to run connection cleanup task for WebSockets.
     * If connection is idle for this period then ping is sent. If connection
     * is idle for twice of that period then connection is killed.
     * @default
     */
    cleanupConnMS: 60e3,

    /**
     * Auto-detected based posix.getrlimit('nofiles')
     * @default
     */
    limitCacheSize: null,

    /**
     * Startup configuration for NodeExecutor#limitConf().
     * Please mind it's per v4/v6 scope (prefix length).
     * @default
     */
    limitConf : {
        default: {
            concurrent: 8,
            max_queue: 32,
            rate: 10,
            period_ms: 1e3,
            burst: 8, // force to concurrent max
            v4scope: 24, // class C
            v6scope: 48, // End Site default
        },
    },

    /**
     * Startup configuration for NodeExecutor#addressLimitMap()
     * @default
     */
    addressLimitMap : {},

    /**
     * Controls if SpecTools.secureObjectPrototype() is called upon startup.
     * @default
     */
    secureObjectPrototype : true,
};
Object.freeze( NodeExecutorOptions.limitConf.default );
Object.freeze( NodeExecutorOptions.limitConf );
Object.freeze( NodeExecutorOptions.addressLimitMap );
Object.freeze( NodeExecutorOptions );

/**
 * Executor implementation for Node.js/io.js with HTTP and WebSockets transport
 * @class
 * @param {AdvancedCCM} ccm - CCM for internal requests
 * @param {NodeExecutorOptions} opts - executor options
 */
class NodeExecutor extends Executor {
    constructor( ccm, opts ) {
        super( ccm, opts );

        this._closing = false;
        this._ws_contexts = new Set();

        opts = _defaultsDeep( {}, opts, NodeExecutorOptions );
        this._initLimits( opts );

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

        // Ensure publicly exposed executor is secure
        if ( opts.secureObjectPrototype ) {
            SpecTools.secureObjectPrototype();
        }

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
        const wss = new WebSocket.Server( {
            noServer: true,
            // This limit may change at runtime, see below
            maxPayload: this._maxReqSize,
        } );
        http_server.on(
            'upgrade',
            ( req, sock, body ) => {
                const http_path = this._http_path;
                let req_url = req.url;

                req_url = ( req_url + '/' ).substr( 0, http_path.length );

                if ( req_url === http_path ) {
                    wss.handleUpgrade( req, sock, body, ( ws ) => {
                        wss.emit( 'connection', ws, req );
                        ws._receiver._maxPayload = this._maxReqSize;
                        this.handleWSConnection( req, ws );
                    } );
                } else if ( managed_server ) {
                    try {
                        req.socket.destroy();
                    } catch ( e ) {
                        // ignore
                    }
                }
            }
        );

        this._stale_conn = opts.cleanupConnMS * 1.5;
        this._check_conn = opts.cleanupConnMS;
        this._conn_timer = setInterval( () => this._cleanupConns(), opts.cleanupConnMS );

        this.once( 'close', () => {
            clearInterval( this._conn_timer );
            this._conn_timer = null;
        } );

        // ---

        Object.seal( this );
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
            () => this.emit( 'clientError', req )
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
                    let ftnreq = Buffer.concat( data );
                    const coder = MessageCoder.detect( ftnreq );

                    try {
                        ftnreq = coder.decode( ftnreq );
                    } catch ( e ) {
                        ftnreq = {};
                        // fail through standard path
                    }

                    this._handleHTTPRequestCommon( { ftnreq, req, rsp, coder } );
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
            ftnreq.sec = decodeURIComponent( pathname[ 3 ] );
        } else if ( 'authorization' in req.headers ) {
            const auth = req.headers.authorization.split( /\s+/ );

            if ( auth[ 0 ] === 'Basic' ) {
                ftnreq.sec = ( new Buffer( auth[ 1 ], 'base64' ) ).toString();
            }
        }

        this._handleHTTPRequestCommon( {
            ftnreq, req, rsp,
            coder: MessageCoder.get( 'JSON' ),
            raw_upload: ( req.method === 'POST' ),
            from_query: true,
        } );
        return true;
    }

    _clientAddress( req ) {
        if ( this._trust_proxy ) {
            // ---
            const real_ip = req.headers[ 'x-real-ip' ];

            if ( real_ip ) {
                return real_ip;
            }

            // ---
            const forwarded_for = req.headers[ 'x-forwarded-for' ];

            if ( forwarded_for ) {
                return forwarded_for.split( ',' )[0];
            }
        }

        return req.connection.remoteAddress;
    }

    _isSecureChannel( req ) {
        return (
            this._is_secure_channel ||
            ( this._trust_proxy && ( req.headers['x-forwarded-proto'] === 'https' ) )
        );
    }

    _handleHTTPRequestCommon( { ftnreq, req, rsp, coder, raw_upload=false, from_query=false } ) {
        const reqinfo = new RequestInfo( this, ftnreq );

        // ---
        const context = new HTTPChannelContext( this, req, rsp );

        const is_secure_channel = this._isSecureChannel( req );
        context._is_secure_channel = is_secure_channel;

        // ---
        const source_host = this._clientAddress( req );
        const source_address = new SourceAddress( null, source_host, req.connection.remotePort );

        // ---
        this._msg_sniffer( source_address, ftnreq, true );

        // ---
        const reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_address;
        reqinfo_info.SECURE_CHANNEL = is_secure_channel;
        reqinfo_info.HAVE_RAW_UPLOAD = raw_upload;
        reqinfo_info._from_query_string = from_query;

        const as = async_steps();

        as.state.reqinfo = reqinfo;

        const close_req = () => as.cancel();

        rsp.once( 'close', close_req );

        reqinfo._as = as;

        const cancel_req = ( as ) => {
            const ftnrsp = Buffer.from( '{"e":"InternalError"}' );

            reqinfo._cleanup();
            rsp.removeListener( 'close', close_req );

            this._msg_sniffer( source_address, ftnrsp, false );

            rsp.writeHead(
                200,
                {
                    'Content-Type' : 'application/futoin+json',
                    'Content-Length' : ftnrsp.length,
                }
            );
            rsp.end( ftnrsp );
        };

        as.sync(
            this._fake_limiter || this._addressToLimiter( source_address.host ),
            ( as ) => {
                as.setCancel( cancel_req );

                this.process( as );

                as.add( ( as ) => {
                    const ftnrsp = reqinfo_info.RAW_RESPONSE;

                    reqinfo._cleanup();
                    rsp.removeListener( 'close', close_req );

                    as.waitExternal();
                    rsp.on( 'finish', () => {
                        const root = as._root;

                        if ( root ) {
                            root._burst_success();
                        }
                    } );

                    if ( ftnrsp !== null ) {
                        const rawmsg = this.packPayload( coder, ftnrsp );

                        this._msg_sniffer( source_address, rawmsg, false );

                        rsp.writeHead(
                            200,
                            {
                                'Content-Type' : coder.contentType(),
                                'Content-Length' : rawmsg.length,
                            }
                        );
                        rsp.end( rawmsg );
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
        const source_host = this._clientAddress( upgrade_req );
        const source_addr = new SourceAddress(
            null,
            source_host,
            upgrade_req.connection.remotePort
        );

        const context = new WSChannelContext( this, ws );

        context._source_addr = source_addr;
        context._is_secure_channel = this._isSecureChannel( upgrade_req );
        ws._source_addr = source_addr;
        ws._sniffer = this._msg_sniffer;

        ws.on(
            'close',
            ( ) => {
                this._ws_contexts.delete( context );
                context._cleanup();
            }
        );

        this._ws_contexts.add( context );

        ws.on( 'pong', () => context._updateActivity() );

        ws.on(
            'message',
            ( ftnreq ) => {
                this._msg_sniffer( source_addr, ftnreq, true );

                const coder = MessageCoder.detect( ftnreq );

                try {
                    ftnreq = coder.decode( ftnreq );
                } catch ( e ) {
                    return; // ignore
                }

                // Handle response to server-initiated request
                const rid = ftnreq.rid;

                if ( rid.charAt( 0 ) === 'S' ) {
                    const reqas = context._srv_req_list[ rid ];

                    if ( reqas ) {
                        reqas.success( ftnreq, true );
                        delete context._srv_req_list[ rid ];
                    }

                    return;
                }

                if ( this._closing ) {
                    // ignore
                    return;
                }

                this._handleWSRequest( context, ftnreq, coder );
            }
        );
    }

    _handleWSRequest( context, ftnreq, coder ) {
        const reqinfo = new RequestInfo( this, ftnreq );

        const reqinfo_info = reqinfo.info;
        const source_addr = context._source_addr;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_addr;
        reqinfo_info.SECURE_CHANNEL = context._is_secure_channel;

        const as = async_steps();

        as.state.reqinfo = reqinfo;

        context._updateActivity();

        const req_list = context._req_list;
        req_list.add( as );

        const ws_conn = context._ws_conn;

        reqinfo._as = as;

        const generic_cleanup = () => {
            reqinfo._cleanup();
            req_list.delete( as );

            if ( ( req_list.size === 0 ) && this._closing ) {
                ws_conn.terminate();
            }
        };

        const on_send_err = ( err ) => {
            if ( err ) {
                ws_conn.terminate();
            } else {
                context._updateActivity();
            }
        };

        const cancel_req = ( as ) => {
            const ftnrsp = {
                rid : reqinfo._rawreq.rid,
                e : "InternalError",
            };

            generic_cleanup();

            try {
                const rawmsg = coder.encode( ftnrsp );

                this._msg_sniffer( source_addr, rawmsg, false );
                ws_conn.send( rawmsg, WS_SEND_OPTS, on_send_err );
            } catch ( e ) {
                // ignore
            }
        };

        as.sync(
            this._fake_limiter || this._addressToLimiter( source_addr.host ),
            ( as ) => {
                as.setCancel( cancel_req );

                this.process( as );

                as.add( ( as ) => {
                    const ftnrsp = reqinfo_info.RAW_RESPONSE;

                    generic_cleanup();

                    if ( ftnrsp !== null ) {
                        const rawmsg = this.packPayload( coder, ftnrsp );

                        this._msg_sniffer( context._source_addr, rawmsg, false );

                        as.waitExternal();
                        ws_conn.send( rawmsg, WS_SEND_OPTS, ( err ) => {
                            if ( err ) {
                                ws_conn.terminate();
                            } else {
                                context._updateActivity();
                            }

                            const root = as._root;

                            if ( root ) {
                                root._burst_success();
                            }
                        } );
                    }
                } );
            },
            ( as, err ) => {
                this.emit( 'error', reqinfo, 'Internal Server Error' );
            }
        );
        as.execute();
    }

    _cleanupConns() {
        this._ws_contexts.forEach( ( c ) => {
            if ( c._req_list.size === 0 ) {
                const diff = process.hrtime( c._last_activity );
                const diff_ms = ( diff[0] * 1e3 ) + ( diff[0] / 1e6 );

                if ( diff_ms > this._stale_conn ) {
                    c._ws_conn.terminate();
                } else if ( diff_ms > this._check_conn ) {
                    c._ws_conn.ping();
                }
            }
        } );
    }

    close( close_cb ) {
        this._closing = true;

        this._ws_contexts.forEach( ( c ) => {
            if ( c._req_list.size === 0 ) {
                c._ws_conn.terminate();
            }
        } );

        const close_common = () => super.close( close_cb );

        if ( this._http_server ) {
            this._http_server.close( close_common );

            if ( this._http_server.closeIdleConnections ) {
                this._http_server.closeIdleConnections();
            }
        } else {
            close_common();
        }
    }


    //=================================
    // Limits processing
    //=================================

    _initLimits( opts ) {
        this._limit_conf = {};
        this._limit_cache_size = opts.limitCacheSize;

        if ( opts.enableLimiter ) {
            this._fake_limiter = null;

            for ( let k in opts.limitConf ) {
                this.limitConf( k, opts.limitConf[k] );
            }

            this.addressLimitMap( opts.addressLimitMap );

            if ( this._limit_timer ) {
                // just in case of double invocation
                clearInterval( this._limit_timer );
            }

            this._stale_limit = opts.cleanupLimitsMS * 1.5;
            this._limit_timer = setInterval( () => this._cleanupLimits(), opts.cleanupLimitsMS );

            this.once( 'close', () => {
                clearInterval( this._limit_timer );
                this._limit_timer = null;
            } );
        } else {
            this._fake_limiter = {
                sync : ( as, a, b ) => {
                    as.add( a, b );
                },
            };
        }
    }

    /**
     * Configure named limits to be used for client's request limiting.
     * @param {string} name - name of limit configuration
     * @param {object} options - see AsyncSteps Limiter class
     */
    limitConf( name, options ) {
        options = _defaultsDeep( options, NodeExecutorOptions.limitConf.default );
        options.burst = options.concurrent; // just force it
        this._limit_conf[name] = options;
    }

    /**
     * Configure static address to limit name map
     * @param {object} map - limit-name => list of CIDR addresses pairs
     */
    addressLimitMap( map ) {
        const address_limit_map = new IPSet();
        this._address_limit_map = address_limit_map;

        for ( let k in map ) {
            map[k].forEach( ( v ) => address_limit_map.add( v, k ) );
        }

        // also reset current limits
        const max = this._limitCacheMax();
        this._host2lim = new LRUCache( { max } );
        this._scope2lim = new LRUCache( { max } );
    }

    /**
     * Access address-limit name ipset for efficient dynamic manipulation
     * @return {IPSet} - ref to static address to limit mapping
     */
    get limitsIPSet() {
        return this._address_limit_map;
    }

    _limitCacheMax() {
        {
            const conf_limit = this._limit_cache_size;

            if ( conf_limit ) {
                return conf_limit;
            }
        }

        try {
            const posix = require( 'posix' );
            return posix.getrlimit( 'nofile' ).soft;
        } catch ( _ ) {
            const default_lim = 10240; // more or less safe default
            // eslint-disable-next-line no-console
            console.warn( `Fallback to default cache size: ${default_lim}` );
            return default_lim;
        }
    }

    _addressToLimiter( host ) {
        // Fast path
        // ---
        const host2lim = this._host2lim;
        let lim = host2lim.get( host );

        if ( lim ) {
            lim.touch();
            return lim;
        }

        // Slow path
        // ---
        const addr2lim_name = this._address_limit_map;
        const conf_name = addr2lim_name.match( host ) || 'default';
        const scope2lim = this._scope2lim;

        const conf = this._limit_conf[ conf_name ];

        if ( !conf ) {
            throw new Error( `Unknown limit ${conf_name}` );
        }

        let scope_key = null;

        {
            const host_addr = addr2lim_name.convertAddress( host, true );
            const addr_type = ( host_addr instanceof Address4 ) ? 'v4scope' : 'v6scope';
            const scope_prefix_len = conf[ addr_type ];

            if ( scope_prefix_len ) {
                host_addr.subnetMask = scope_prefix_len;
                scope_key = host_addr.startAddress().correctForm();
            }

            if ( scope_key && ( conf_name !== 'default' ) ) {
                scope_key = `${scope_key}:${conf_name}`;
            }
        }

        if ( scope_key ) {
            lim = scope2lim.get( scope_key );
        }

        if ( lim ) {
            lim.touch();
        } else {
            lim = new ExecutorLimiter( conf, this._stale_limit );

            if ( scope_key ) {
                scope2lim.set( scope_key, lim );
            }
        }

        host2lim.set( host, lim );
        return lim;
    }

    _cleanupLimits() {
        // NOTE: we can not use LRU TTL as:
        //       a) the same limiter object is accessed through two different caches/keys
        //       b) each limiter has own period -> TTL varies
        for ( let cache of [ this._host2lim, this._scope2lim ] ) {
            cache.forEach( ( v, k ) => {
                if ( v.isStale() ) {
                    cache.delete( k );
                }
            } );
        }
    }
    //=================================
}

module.exports = NodeExecutor;
