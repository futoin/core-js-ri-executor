"use strict";

/**
 * @file
 *
 * Copyright 2014-2018 FutoIn Project (https://futoin.org)
 * Copyright 2014-2018 Andrey Galkin <andrey@futoin.org>
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
const invoker = require( 'futoin-invoker' );
const async_steps = require( 'futoin-asyncsteps' );
const $asyncevent = require( 'futoin-asyncevent' );

const ChannelContext = require( './ChannelContext' );
const SourceAddress = require( './SourceAddress' );
const RequestInfo = require( './RequestInfo' );
const UserInfo = require( './UserInfo' );

const SecurityProvider = require( './SecurityProvider' );

const {
    checkRequestMessage,
    checkResponseMessage,
    normalizeURLParams,
    STANDARD_ERRORS,
    _ifacever_pattern,
    loadIface,
    globalLoadCache,
} = invoker.SpecTools;

const {
    CommError,
    InternalError,
    NotImplemented,
    InvalidRequest,
    UnknownInterface,
    NotSupportedVersion,
    SecurityError,
    PleaseReauth,
} = async_steps.Errors;

// ---
const SECLVL_LIST = Object.freeze( {
    Anonymous : 1,
    Info : 2,
    SafeOps : 3,
    PrivilegedOps : 4,
    ExceptionalOps : 5,
    System : 6,
} );

// ---
class CallbackChannelContext extends ChannelContext {
    constructor( ...args ) {
        super( ...args );
        Object.seal( this );
    }

    type() {
        return "CALLBACK";
    }

    isStateful() {
        return true;
    }
}

// ---
class InternalChannelContext extends ChannelContext {
    constructor( executor, invoker_executor ) {
        super( executor );
        this._invoker_executor = invoker_executor;
        Object.seal( this );
    }

    type() {
        return "INTERNAL";
    }

    isStateful() {
        return true;
    }

    _getPerformRequest() {
        const invoker_executor = this._invoker_executor;

        if ( !invoker_executor ) {
            return this._commError;
        }

        return ( as, ctx, ftnreq ) => {
            invoker_executor.onInternalRequest( as, ctx.info, ftnreq );
        };
    }

    _commError( as ) {
        as.error( CommError, "No Invoker's Executor for internal call" );
    }

    onInvokerAbort( callable, user_data ) {
        this._invoker_executor.once(
            'close',
            () => callable( user_data )
        );
    }
}

/**
 * Pseudo-class for Executor options documentation
 * @class
 */
const ExecutorOptions =
{
    /**
     * Message sniffer callback( iface_info, msg, is_incomming ).
     * Useful for audit logging.
     * @default dummy
     */
    messageSniffer : () => {},

    /**
     * Search dirs for spec definition or spec instance directly. It can
     * be single value or array of values. Each value is either path/URL (string) or
     * iface spec instance (object).
     * @default
     */
    specDirs : [],

    /**
     * Production mode - disables some checks without compomising security
     * @default
     */
    prodMode : false,

    /**
     * Default request processing timeout
     * @default
     */
    reqTimeout : 5e3,

    /**
     * Default request processing timeout for functions
     * marked "heavy". See FTN3
     * @default
     */
    heavyReqTimeout : 60e3,

    /**
     * FTN8 security interface
     */
    securityProvider : null,
};
Object.freeze( ExecutorOptions );

/**
 * An abstract core implementing pure FTN6 Executor logic.
 * @param {AdvancedCCM} ccm - instance of AdvancedCCM
 * @param {objects} opts - see ExecutorOptions
 * @class
 */
class Executor {
    constructor( ccm, opts ) {
        $asyncevent( this, [
            'ready',
            'request',
            'response',
            'notExpected',
            'close',
            'clientError',
            'error',
        ] );

        this._ccm = ccm;
        this._ifaces = {};
        this._impls = {};

        opts = _defaults( {}, opts, ExecutorOptions );

        //
        let spec_dirs = opts.specDirs;

        if ( !( spec_dirs instanceof Array ) ) {
            spec_dirs = [ spec_dirs ];
        }

        this._specdirs = spec_dirs;

        //
        this._dev_checks = !opts.prodMode;
        this._msg_sniffer = opts.messageSniffer;

        //
        this._request_timeout = opts.reqTimeout;
        this._heavy_timeout = opts.heavyReqTimeout;

        //
        this._maxReqSize = this.SAFE_PAYLOAD_LIMIT;
        this._maxRspSize = this.SAFE_PAYLOAD_LIMIT;
        this._maxAnySize = this.SAFE_PAYLOAD_LIMIT;

        //
        this._secprov = opts.securityProvider || new SecurityProvider;

        // Ensure to close executor on CCM close
        const close_listener = () => this.close;
        ccm.once( 'close', close_listener );
        this.once( 'close', () => ccm.off( 'close', close_listener ) );
    }

    get SAFE_PAYLOAD_LIMIT() {
        return 65536;
    }

    /**
     * Get reference to associated AdvancedCCM instance
     * @alias Executor#ccm
     * @returns {AdvancedCCM} CCM ref
     */
    ccm() {
        return this._ccm;
    }

    /**
     * Register implementation of specific interface
     * @param {AsyncSteps} as - steps interface
     * @param {string} ifacever - standard iface:version notation of interface
     *        to be implemented.
     * @param {object|Function} impl - either iface implementation or func( impl, executor )
     * @param {object|array=} specdirs - NOT STANDARD. Useful for direct passing
     * of hardcoded spec definition.
     * @alias Executor#register
     */
    register( as, ifacever, impl, specdirs ) {
        const m = ifacever.match( _ifacever_pattern );

        if ( m === null ) {
            as.error( InternalError,
                `Invalid ifacever: ${ifacever}` );
        }

        const iface = m[ 1 ];
        const mjrmnr = m[ 4 ];
        const mjr = m[ 5 ];
        const mnr = m[ 6 ];

        const ifaces = this._ifaces;

        if ( ( iface in ifaces ) &&
             ( mjr in ifaces[ iface ] ) ) {
            as.error( InternalError,
                `Already registered: ${ifacever}` );
        }
        // ---

        const info =
        {
            iface : iface,
            version : mjrmnr,
            mjrver : mjr,
            mnrver : mnr,
            derived : undefined,
        };

        loadIface( as, info, specdirs || this._specdirs, globalLoadCache() );

        const impls = this._impls;

        as.add( ( as ) => {
            if ( !( iface in ifaces ) ) {
                ifaces[ iface ] = {};
                impls[ iface ] = {};
            }

            ifaces[ iface ][ mjr ] = info;
            impls[ iface ][ mjr ] = impl;

            const inherits = info.inherits;

            for ( let i = inherits.length - 1; i >=0 ; --i ) {
                const supm = inherits[ i ].match( _ifacever_pattern );
                const supiface = supm[ 1 ];
                const supmjrmnr = supm[ 4 ];
                const supmjr = supm[ 5 ];
                const supmnr = supm[ 6 ];

                const supinfo =
                {
                    iface : supiface,
                    version : supmjrmnr,
                    mjrver : supmjr,
                    mnrver : supmnr,
                    derived : info,
                };

                if ( ( supiface in ifaces ) &&
                    ( supmjr in ifaces[ supiface ] ) ) {
                    delete ifaces[ iface ][ mjr ];
                    as.error( InternalError,
                        `Conflict with inherited interfaces: ${supm[0]}` );
                }

                if ( !( supiface in ifaces ) ) {
                    ifaces[ supiface ] = {};
                }

                ifaces[ supiface ][ supmjr ] = supinfo;
            }

            //---
            let max_req_size = this._maxReqSize;
            let max_rsp_size = this._maxRspSize;

            for ( let f in info.funcs ) {
                f = info.funcs[ f ];
                max_req_size = Math.max( max_req_size, f._max_req_size );
                max_rsp_size = Math.max( max_rsp_size, f._max_rsp_size );
            }

            this._maxReqSize = max_req_size;
            this._maxRspSize = max_rsp_size;
            this._maxAnySize = Math.max( max_req_size, max_rsp_size );
        } );
    }

    /**
     * Entry point for Server-originated requests when acting as ClientExecutor
     * @param {object} info - raw Invoker interface info
     * @param {object} ftnreq - FutoIn request object
     * @param {Function} send_executor_rsp - callback( ftnrsp )
     * @fires Executor#notExpected
     * @fires Executor#request
     * @fires Executor#response
     */
    onEndpointRequest( info, ftnreq, send_executor_rsp ) {
        let context = info._callback_context;

        if ( !context ) {
            context = new CallbackChannelContext( this );
            info._callback_context = context;
        }

        const reqinfo = new RequestInfo( this, ftnreq );
        const source_addr = new SourceAddress( context.type(), null, info.regname );

        const ri_info = reqinfo.info;

        ri_info.CHANNEL_CONTEXT = context;
        ri_info.CLIENT_ADDR = source_addr;
        ri_info.SECURE_CHANNEL = info.secure_channel;

        const as = async_steps();

        reqinfo._as = as;

        as.add(
            ( as ) => {
                as.setCancel( ( as ) => {
                    const ftnrsp = {
                        rid : reqinfo._rawreq.rid,
                        e : "InternalError",
                    };

                    reqinfo._cleanup();
                    send_executor_rsp( ftnrsp );
                } );

                as.state.reqinfo = reqinfo;
                this.process( as );

                as.add( ( as ) => {
                    const ftnrsp = ri_info.RAW_RESPONSE;

                    reqinfo._cleanup();

                    if ( ftnrsp !== null ) {
                        send_executor_rsp( ftnrsp );
                    }
                } );
            },
            ( as, err ) => {
                const { error_info, last_exception, async_stack } = as.state;
                this.emit( 'notExpected', err, error_info, last_exception, async_stack );
                reqinfo._cleanup();
            }
        ).execute();
    }

    /**
     * Entry point for in-program originated requests. Process with maximum efficiency (not yet ;)
     * @param {AsyncSteps} as - steps interface
     * @param {object} info - raw Invoker interface info
     * @param {object} ftnreq - FutoIn request object
     * @param {object=} upload_data - upload stream, if any
     * @param {object=} download_stream - download stream, if any
     * @note AS result: ftnrsp, content-type
     * @fires Executor#notExpected
     * @fires Executor#request
     * @fires Executor#response
     */
    onInternalRequest( as, info, ftnreq, upload_data, download_stream ) {
        let context = info._server_executor_context;

        if ( !context ) {
            context = new InternalChannelContext( this, info.options.executor );
            info._server_executor_context = context;
        }

        const reqinfo = new RequestInfo( this, ftnreq );
        const source_addr = new SourceAddress( context.type(), null, null );

        const ri_info = reqinfo.info;

        ri_info.CHANNEL_CONTEXT = context;
        ri_info.CLIENT_ADDR = source_addr;
        ri_info.SECURE_CHANNEL = true;

        if ( upload_data ) {
            ri_info.HAVE_RAW_UPLOAD = true;
            reqinfo._rawinp = upload_data;
        }

        if ( download_stream ) {
            reqinfo._rawout = download_stream;
        }

        as.add( ( orig_as ) => {
            // Make sure we have a clean AsyncSteps
            const inner_as = async_steps();

            reqinfo._as = inner_as;

            inner_as.add(
                ( as ) => {
                    as.setCancel( ( as ) => {
                        reqinfo._cleanup();

                        if ( !as.state._orig_as_cancel ) {
                            try {
                                orig_as.error( InternalError, "Executor canceled" );
                            } catch ( e ) {
                                // ignore
                            }
                        }
                    } );

                    as.state.reqinfo = reqinfo;
                    this.process( as );

                    as.add( ( as ) => {
                        const ftnrsp = ri_info.RAW_RESPONSE;

                        reqinfo._cleanup();

                        if ( ftnrsp !== null ) {
                            orig_as.success( ftnrsp, true );
                        } else {
                            orig_as.success();
                        }
                    } );
                },
                ( as, err ) => {
                    const { error_info, last_exception, async_stack } = as.state;
                    this.emit( 'notExpected', err, error_info, last_exception, async_stack );
                    reqinfo._cleanup();
                }
            ).execute();

            orig_as.setCancel( ( as ) => {
                inner_as.state._orig_as_cancel = true;
                inner_as.cancel();
            } );
        } );
    }

    /**
     * Standard entry point used by subclasses.
     * Do full cycle of request processing, including all security checks
     *
     * NOTE: as.state.reqinfo must point to valid instance of RequestInfo
     * @param {AsyncSteps} as - steps interface
     * @fires Executor#notExpected
     * @fires Executor#request
     * @fires Executor#response
     */
    process( as ) {
        const reqinfo = as.state.reqinfo;
        const ri_info = reqinfo.info;

        if ( !reqinfo || ( '_func_info' in ri_info ) ) {
            as.error( InternalError, "Invalid process() invocation" );
        }

        as.add(
            ( as ) => {
                const rawreq = ri_info.RAW_REQUEST;

                this.emit( 'request', reqinfo, rawreq );

                // Step 0. Initial timeout
                // ---
                reqinfo.cancelAfter( this._request_timeout );

                // Step 1. Security
                // ---
                let sec = rawreq.sec;

                if ( typeof sec === 'string' ) {
                    sec = sec.split( ':' );

                    // reserved user name
                    if ( sec[ 0 ] === '-internal' ) {
                        this._checkInternalAuth( as, reqinfo, sec );
                    } else {
                        this._secprov.checkAuth( as, reqinfo, rawreq, sec );
                    }
                }

                // ---
                as.add( ( as ) => {
                    // Step 2. Parsing interface and function info
                    // ---
                    this._getInfo( as, reqinfo );

                    // Step 3. Check constraints
                    // ---
                    this._checkConstraints( as, reqinfo );

                    // Step 4.1 Check params
                    // ---
                    this._checkParams( as, reqinfo );

                    // Step 4.2. Check implementation
                    // ---
                    const func = ri_info._func;
                    const impl = this._getImpl( as, reqinfo );

                    if ( !( func in impl ) ) {
                        as.error( InternalError, "Missing function implementation" );
                    }

                    // Step 4.3. Update timeout for heavy requests
                    // ---
                    if ( ri_info._func_info.heavy ) {
                        reqinfo.cancelAfter( this._heavy_timeout );
                    }

                    // Step 4.4. Invoke implementation
                    // ---
                    const result = impl[ func ]( as, reqinfo );

                    // Step 4.5. Handle direct result
                    // ---
                    if ( typeof result !== 'undefined' ) {
                        ri_info.RAW_RESPONSE.r = result;
                    }
                } );

                // Step 5. Gather result and sign succeeded response
                // ---
                as.add( ( as, result ) => {
                    if ( result ) {
                        if ( typeof result === 'object' ) {
                            Object.assign(
                                ri_info.RAW_RESPONSE.r,
                                result
                            );
                        } else {
                            ri_info.RAW_RESPONSE.r = result;
                        }
                    }

                    this._checkResponse( as, reqinfo );
                    as.success( reqinfo );
                } );
            },
            ( as, err ) => {
                const { state } = as;
                const reqinfo = state.reqinfo;
                let error_info = state.error_info;

                if ( !( err in STANDARD_ERRORS ) &&
                      ( !ri_info._func_info ||
                        !( err in ri_info._func_info.throws ) )
                ) {
                    this.emit(
                        'notExpected', err, error_info,
                        state.last_exception, state.async_stack );
                    err = InternalError;
                    error_info = 'Not expected error';
                }

                const rawrsp = ri_info.RAW_RESPONSE;

                rawrsp.e = err;
                delete rawrsp.r;

                if ( error_info ) {
                    rawrsp.edesc = error_info;
                }

                // Even though request itself fails, send response
                as.success( reqinfo );
            }
        );
        as.add(
            ( as, reqinfo ) => this._signResponse( as, reqinfo ),
            ( as, err ) => {
                const { state } = as;
                this.emit(
                    'notExpected',
                    err,
                    state.aserror_info,
                    state.last_exception,
                    state.async_stack );
            }
        );
    }

    /**
     * Shortcut to check access through #acl interface.
     *
     * NOTE: as.state.reqinfo must point to valid instance of RequestInfo
     * @param {AsyncSteps} as - steps interface
     * @param {string} acd - access control descriptor
     */
    checkAccess( as, acd ) {
        this._secprov.checkAccess( as, as.state.reqinfo, acd );
    }

    /**
     * NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
     * from spec.
     * @param {AsyncSteps} as - steps interface
     */
    initFromCache( as ) {
        as.error( NotImplemented, "Caching is not supported yet" );
    }

    /**
     * NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
     * from spec.
     * @param {AsyncSteps} as - steps interface
     */
    cacheInit( as ) {
        as.error( NotImplemented, "Caching is not supported yet" );
    }

    _getInfo( as, reqinfo ) {
        const ri_info = reqinfo.info;

        if ( ri_info._iface_info ) {
            return;
        }

        let f = ri_info.RAW_REQUEST.f;

        if ( typeof f !== "string" ) {
            as.error( InvalidRequest, "Missing req.f" );
        }

        //
        f = f.split( ':' );

        if ( f.length !== 3 ) {
            as.error( InvalidRequest, "Invalid req.f" );
        }

        const iface = f[ 0 ];
        const func = f[ 2 ];

        //
        var v = f[ 1 ].split( '.' );

        if ( v.length !== 2 ) {
            as.error( InvalidRequest, "Invalid req.f (version)" );
        }

        const iface_info_map = this._ifaces[iface];

        if ( !iface_info_map ) {
            as.error( UnknownInterface,
                `Unknown interface: ${iface}` );
        }

        let iface_info;

        try {
            const vmjr = v[ 0 ];
            const vmnr = v[ 1 ];
            iface_info = iface_info_map[ vmjr ];

            if ( !iface_info ) {
                as.error( NotSupportedVersion,
                    `Different major version: ${iface}:${vmjr}` );
            }

            if ( iface_info.mnrver < vmnr ) {
                as.error( NotSupportedVersion,
                    `Iface version is too old: ${iface}:${vmjr}.${vmnr}` );
            }

            // Jump to actual implementation
            const derived = iface_info.derived;

            if ( derived ) {
                iface_info = derived;
            }

            const finfo = iface_info.funcs[ func ];

            if ( !finfo ) {
                as.error( InvalidRequest,
                    `Unknown interface function: ${func}` );
            }

            ri_info._iface_info = iface_info;
            ri_info._func = func;
            ri_info._func_info = finfo;

            if ( finfo.rawresult ) {
                ri_info.HAVE_RAW_RESULT = true;
            }
        } catch ( e ) {
            if ( !ri_info.USER_INFO &&
                ( !iface_info || !( 'AllowAnonymous' in iface_info.constraints ) )
            ) {
                // Make it more problematic to bruteforce interfaces
                as.error( UnknownInterface,
                    `Unknown interface: ${iface}` );
            } else {
                throw e;
            }
        }
    }

    _checkInternalAuth( as, reqinfo ) {
        const ri_info = reqinfo.info;

        if ( ri_info.CHANNEL_CONTEXT.type() !== 'INTERNAL' ) {
            as.error( SecurityError, "Not internal channel" );
        }

        const obf = ri_info.RAW_REQUEST.obf;

        if ( obf ) {
            ri_info.SECURITY_LEVEL = obf.slvl;
            ri_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                null );
        } else {
            ri_info.SECURITY_LEVEL = RequestInfo.SL_SYSTEM;
            ri_info.USER_INFO = new UserInfo(
                this._ccm,
                '-internal',
                '-internal',
                null );
        }
    }

    _checkConstraints( as, reqinfo ) {
        const ri_info = reqinfo.info;
        const constraints = ri_info._iface_info.constraints;
        const finfo = ri_info._func_info;
        const context = ri_info.CHANNEL_CONTEXT;


        if ( ( 'SecureChannel' in constraints ) &&
             !ri_info.SECURE_CHANNEL ) {
            as.error( SecurityError, "Insecure channel" );
        }

        if ( ( 'MessageSignature' in constraints ) &&
             !this._secprov.isSigned( reqinfo ) &&
             ( context.type() !== 'INTERNAL' )
        ) {
            as.error( SecurityError, "Message Signature is required" );
        }

        if ( !( 'AllowAnonymous' in constraints ) &&
             !ri_info.USER_INFO ) {
            as.error( SecurityError, "Anonymous not allowed" );
        }

        if ( ( 'BiDirectChannel' in constraints ) &&
             ( !context || !context.isStateful() )
        ) {
            as.error( InvalidRequest, "Bi-Direct Channel is required" );
        }

        if ( finfo.seclvl ) {
            const finfo_index = SECLVL_LIST[ finfo.seclvl ];
            const current_index = SECLVL_LIST[ ri_info.SECURITY_LEVEL ];

            if ( !finfo_index || ( current_index < finfo_index ) ) {
                as.error( PleaseReauth, finfo.seclvl );
            }
        }
    }

    _checkParams( as, reqinfo ) {
        const ri_info = reqinfo.info;
        const rawreq = ri_info.RAW_REQUEST;
        const finfo = ri_info._func_info;

        if ( reqinfo.HAVE_RAW_UPLOAD &&
             !finfo.rawupload
        ) {
            as.error( InvalidRequest,
                `Raw upload is not allowed: ${ri_info._func}` );
        }

        const iface_info = ri_info._iface_info;
        const func = ri_info._func;

        if ( ri_info._from_query_string ) {
            normalizeURLParams( iface_info, func, rawreq );
            ri_info._from_query_string = false;
        }

        checkRequestMessage( as, iface_info, func, rawreq );
    }

    _getImpl( as, reqinfo ) {
        const ri_info = reqinfo.info;
        const iface_info = ri_info._iface_info;

        const iname = iface_info.iface;
        const imjr = iface_info.mjrver;
        let impl = this._impls[ iname ][ imjr ];

        if ( typeof impl !== "object" ) {
            if ( typeof impl === "function" ) {
                impl = impl( impl, this );
            } else {
                as.error( InternalError,
                    `Invalid implementation type: ${ri_info._func}()` );
            }

            if ( typeof impl !== "object" ) {
                as.error( InternalError,
                    'Implementation does not implement ' +
                          `InterfaceImplementation: ${iname}:${imjr}` );
            }

            this._impls[ iname ][ imjr ] = impl;
        }

        return impl;
    }

    _checkResponse( as, reqinfo ) {
        const ri_info = reqinfo.info;
        const rsp = ri_info.RAW_RESPONSE;
        const finfo = ri_info._func_info;

        // Check raw result
        if ( finfo.rawresult ) {
            ri_info.RAW_RESPONSE = null;

            if ( typeof rsp.r !== 'object' ||
                 Object.keys( rsp.r ).length > 0 ) {
                as.error( InternalError,
                    `Raw result is expected: ${ri_info._func}()` );
            }

            return;
        }

        // Check if response is needed at all
        if ( !finfo.expect_result &&
            ( ri_info.RAW_REQUEST.forcersp !== true )
        ) {
            ri_info.RAW_RESPONSE = null;
            return;
        }

        if ( this._dev_checks ) {
            checkResponseMessage( as, ri_info._iface_info, ri_info._func, rsp );
        }
    }

    _signResponse( as, reqinfo ) {
        const rawrsp = reqinfo.info.RAW_RESPONSE;

        if ( rawrsp && this._secprov.signAuto( as, reqinfo, rawrsp ) ) {
            as.add( ( as ) => {
                this.emit( 'response', reqinfo, rawrsp );
            } );
        } else {
            this.emit( 'response', reqinfo, rawrsp );
        }
    }

    /**
     * Shutdown Executor and stop whole processing
     * @param {callable} [close_cb=null] - callback to execute after Executor shutdown
     * @fires Executor#close
     */
    close( close_cb ) {
        if ( close_cb ) {
            this.once( 'close', close_cb );
        }

        this.emit( 'close' );
    }

    /**
     * Not standard. Pack message object into JSON representation.
     * If safe limit of 64K is exceeded  then error is raised.
     *
     * @param {MessageCoder} coder - message coder instance
     * @param {object} msg - message to encode into JSON
     * @returns {string} string representation of the message
     * @fires Executor#notExpected
     */
    packPayload( coder, msg ) {
        let rawmsg = coder.encode( msg );

        if ( typeof rawmsg === 'string' ) {
            rawmsg = Buffer.from( rawmsg );
        }

        if ( rawmsg.length > this.SAFE_PAYLOAD_LIMIT ) {
            this.emit( 'notExpected', InternalError,
                "Response size has exceeded safety limit",
                null, null );
            throw new Error( InternalError );
        }

        return rawmsg;
    }
}

module.exports = Executor;

/**
 * May be fired in derived Executors to signal readiness
 * ()
 * @event Executor#ready
 */

/**
 * Fired when request processing is started.
 * ( reqinfo, rawreq )
 * @event Executor#request
 */

/**
 * Fired when request processing is started.
 * ( reqinfo, rawreq )
 * @event Executor#response
 */

/**
 * Fired when not expected error occurs
 * ( errmsg, error_info, last_exception, async_stack )
 * @event Executor#notExpected
 */

/**
 * Fired when Executor is shutting down.
 * ()
 * @event Executor#close
 */
