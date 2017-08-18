"use strict";

var _extend = require( 'lodash/extend' );
var _defaults = require( 'lodash/defaults' );
var invoker = require( 'futoin-invoker' );
var FutoInError = invoker.FutoInError;
var async_steps = require( 'futoin-asyncsteps' );
var ee = require( 'event-emitter' );
var _clone = require( 'lodash/clone' );

var ChannelContext = require( './ChannelContext' );
var SourceAddress = require( './SourceAddress' );
var RequestInfo = require( './RequestInfo' );
var UserInfo = require( './UserInfo' );

// ---
var CallbackChannelContext = function( executor )
{
    ChannelContext.call( this, executor );
};

var CallbackChannelContextProto = _clone( ChannelContext.prototype );

CallbackChannelContext.prototype = CallbackChannelContextProto;

CallbackChannelContextProto.type = function()
{
    return "CALLBACK";
};

CallbackChannelContextProto.isStateful = function()
{
    return true;
};

// ---
var InternalChannelContext = function( executor, invoker_executor )
{
    ChannelContext.call( this, executor );
    this._invoker_executor = invoker_executor;
};

var InternalChannelContextProto = _clone( ChannelContext.prototype );

InternalChannelContext.prototype = InternalChannelContextProto;

InternalChannelContextProto._invoker_executor = null;

InternalChannelContextProto.type = function()
{
    return "INTERNAL";
};

InternalChannelContextProto.isStateful = function()
{
    return true;
};

InternalChannelContextProto._getPerformRequest = function()
{
    var invoker_executor = this._invoker_executor;

    if ( !invoker_executor )
    {
        return this._commError;
    }

    return function( as, ctx, ftnreq )
    {
        invoker_executor.onInternalRequest( as, ctx.info, ftnreq );
    };
};

InternalChannelContextProto._commError = function( as )
{
    as.error( FutoInError.CommError, "No Invoker's Executor for internal call" );
};

/**
 * Pseudo-class for Executor options documentation
 * @class
 */
var ExecutorOptions =
{
    /**
     * Message sniffer callback( iface_info, msg, is_incomming ).
     * Useful for audit logging.
     * @default dummy
     */
    messageSniffer : function()
    {},

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
};

/**
 * An abstract core implementing pure FTN6 Executor logic.
 * @param {AdvancedCCM} ccm - instance of AdvancedCCM
 * @param {objects} opts - see ExecutorOptions
 * @class
 */
var Executor = function( ccm, opts )
{
    ee( this );

    this._ccm = ccm;
    this._ifaces = {};
    this._impls = {};

    opts = opts || {};
    _defaults( opts, ExecutorOptions );

    //
    var spec_dirs = opts.specDirs;

    if ( !( spec_dirs instanceof Array ) )
    {
        spec_dirs = [ spec_dirs ];
    }

    this._specdirs = spec_dirs;

    //
    this._dev_checks = !opts.prodMode;

    //
    this._request_timeout = opts.reqTimeout;
    this._heavy_timeout = opts.heavyReqTimeout;

    //
    if ( typeof Buffer !== 'undefined' && Buffer.byteLength )
    {
        this._byteLength = Buffer.byteLength;
    }
    else
    {
        this._byteLength = function( data )
        {
            return data.length; // Yes, it does not work for multi-byte correctly
        };
    }
};

var ExecutorProto =
{
    SAFE_PAYLOAD_LIMIT : 65536,

    _ccm : null,
    _ifaces : null,
    _impls : null,

    _specdirs : null,
    _dev_checks : false,

    _request_timeout : null,
    _heavy_timeout : null,

    _byteLength : null,

    /**
     * Get reference to associated AdvancedCCM instance
     * @alias Executor#ccm
     * @returns {AdvancedCCM} CCM ref
     */
    ccm : function()
    {
        return this._ccm;
    },

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
    register : function( as, ifacever, impl, specdirs )
    {
        var m = ifacever.match( invoker.SpecTools._ifacever_pattern );

        if ( m === null )
        {
            as.error( FutoInError.InternalError, "Invalid ifacever" );
        }

        var iface = m[ 1 ];
        var mjrmnr = m[ 4 ];
        var mjr = m[ 5 ];
        var mnr = m[ 6 ];

        var ifaces = this._ifaces;

        if ( ( iface in ifaces ) &&
             ( mjr in ifaces[ iface ] ) )
        {
            as.error( FutoInError.InternalError, "Already registered" );
        }
        // ---

        var info =
        {
            iface : iface,
            version : mjrmnr,
            mjrver : mjr,
            mnrver : mnr,
        };

        invoker.SpecTools.loadIface( as, info, specdirs || this._specdirs );

        var _this = this;

        as.add( function( as )
        {
            if ( !( iface in ifaces ) )
            {
                ifaces[ iface ] = {};
                _this._impls[ iface ] = {};
            }

            ifaces[ iface ][ mjr ] = info;
            _this._impls[ iface ][ mjr ] = impl;

            for ( var i = 0; i < info.inherits.length; ++i )
            {
                var supm = info.inherits[ i ].match( invoker.SpecTools._ifacever_pattern );
                var supiface = supm[ 1 ];
                var supmjrmnr = supm[ 4 ];
                var supmjr = supm[ 5 ];
                var supmnr = supm[ 6 ];

                var supinfo =
                {
                    iface : supiface,
                    version : supmjrmnr,
                    mjrver : supmjr,
                    mnrver : supmnr,
                    derived : info,
                };

                if ( ( supiface in ifaces ) &&
                    ( supmjr in ifaces[ supiface ] ) )
                {
                    delete ifaces[ iface ][ mjr ];
                    as.error( FutoInError.InternalError, "Conflict with inherited interfaces" );
                }

                if ( !( supiface in ifaces ) )
                {
                    ifaces[ supiface ] = {};
                }

                ifaces[ supiface ][ supmjr ] = supinfo;
            }
        } );
    },

    /**
     * Entry point for Server-originated requests when acting as ClientExecutor
     * @param {object} info - raw Invoker interface info
     * @param {object} ftnreq - FutoIn request object
     * @param {Function} send_executor_rsp - callback( ftnrsp )
     * @fires Executor#notExpected
     * @fires Executor#request
     * @fires Executor#response
     */
    onEndpointRequest : function( info, ftnreq, send_executor_rsp )
    {
        var _this = this;
        var reqinfo = new RequestInfo( this, ftnreq );

        var context = new CallbackChannelContext( this );
        var source_addr = new SourceAddress( context.type(), null, info.regname );

        var reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_addr;
        reqinfo_info.SECURE_CHANNEL = info.secure_channel;

        var as = async_steps();

        reqinfo._as = as;

        as.add(
            function( as )
            {
                as.setCancel( function( as )
                {
                    void as;
                    var ftnrsp = {
                        rid : reqinfo._rawreq.rid,
                        e : "InternalError",
                    };

                    reqinfo._cleanup();
                    send_executor_rsp( ftnrsp );
                } );

                as.state.reqinfo = reqinfo;
                _this.process( as );

                as.add( function( as )
                {
                    void as;
                    var ftnrsp = reqinfo_info.RAW_RESPONSE;

                    reqinfo._cleanup();

                    if ( ftnrsp !== null )
                    {
                        send_executor_rsp( ftnrsp );
                    }
                } );
            },
            function( as, err )
            {
                _this.emit( 'notExpected', err, as.state.error_info, as.state.last_exception );
                reqinfo._cleanup();
            }
        ).execute();
    },

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
    onInternalRequest : function( as, info, ftnreq, upload_data, download_stream )
    {
        var context = info._server_executor_context;

        if ( !context )
        {
            context = new InternalChannelContext( this, info.options.executor );
            info._server_executor_context = context;
        }

        var _this = this;
        var reqinfo = new RequestInfo( this, ftnreq );
        var source_addr = new SourceAddress( context.type(), null, null );

        var reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_addr;
        reqinfo_info.SECURE_CHANNEL = true;

        if ( upload_data )
        {
            reqinfo_info.HAVE_RAW_UPLOAD = true;
            reqinfo._rawinp = upload_data;
        }

        if ( download_stream )
        {
            reqinfo._rawout = download_stream;
        }

        as.add( function( orig_as )
        {
            // Make sure we have a clean AsyncSteps
            var inner_as = async_steps();

            reqinfo._as = inner_as;

            inner_as.add(
                function( as )
                {
                    as.setCancel( function( as )
                    {
                        void as;
                        reqinfo._cleanup();

                        if ( !as.state._orig_as_cancel )
                        {
                            try
                            {
                                orig_as.error( FutoInError.InternalError, "Executor canceled" );
                            }
                            catch ( e )
                            {
                                // ignore
                            }
                        }
                    } );

                    as.state.reqinfo = reqinfo;
                    _this.process( as );

                    as.add( function( as )
                    {
                        void as;
                        var ftnrsp = reqinfo_info.RAW_RESPONSE;

                        reqinfo._cleanup();

                        if ( ftnrsp !== null )
                        {
                            orig_as.success( ftnrsp, invoker.SimpleCCM.FUTOIN_CONTENT_TYPE );
                        }
                        else
                        {
                            orig_as.success();
                        }
                    } );
                },
                function( as, err )
                {
                    _this.emit( 'notExpected', err, as.state.error_info, as.state.last_exception );
                    reqinfo._cleanup();
                }
            ).execute();

            orig_as.setCancel( function( as )
            {
                void as;
                inner_as.state._orig_as_cancel = true;
                inner_as.cancel();
            } );
        } );
    },

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
    process : function( as )
    {
        var reqinfo = as.state.reqinfo;

        if ( !reqinfo ||
              ( '_func_info' in reqinfo.info ) )
        {
            as.error( FutoInError.InternalError, "Invalid process() invocation" );
        }

        var _this = this;

        as.add(
            function( as )
            {
                var reqinfo_info = reqinfo.info;
                var rawreq = reqinfo_info.RAW_REQUEST;

                _this.emit( 'request', reqinfo, rawreq );

                // Step 1. Parsing interface and function info
                // ---
                _this._getInfo( as, reqinfo );

                if ( reqinfo_info._func_info.heavy )
                {
                    reqinfo.cancelAfter( _this._heavy_timeout );
                }
                else
                {
                    reqinfo.cancelAfter( _this._request_timeout );
                }

                // Step 2. Check params
                // ---
                _this._checkParams( as, reqinfo );

                // Step 3. Security
                // ---
                var sec = rawreq.sec;

                if ( sec )
                {
                    sec = sec.split( ':' );

                    // reserved user name
                    if ( sec[ 0 ] === '-internal' )
                    {
                        _this._checkInternalAuth( as, reqinfo, sec );
                    }
                    else if ( sec[ 0 ] === '-hmac' )
                    {
                        _this._checkAuthHMAC( as, reqinfo, sec[1], sec[2], sec[3] );
                    }
                    else
                    {
                        _this._checkBasicAuth( as, reqinfo, sec );
                    }
                }

                // Step 4.
                // ---
                as.add( function( as )
                {
                    // Step 4.1. Check constraints
                    // ---
                    _this._checkConstraints( as, reqinfo );

                    // Step 4.2. Invoke implementation
                    // ---
                    var func = reqinfo_info._func;
                    var impl = _this._getImpl( as, reqinfo );

                    if ( !( func in impl ) )
                    {
                        as.error( FutoInError.InternalError, "Missing function implementation" );
                    }

                    var result = impl[ func ]( as, reqinfo );

                    if ( typeof result !== 'undefined' )
                    {
                        as.success( result );
                    }
                } );

                // Step 5. Gather result and sign succeeded response
                // ---
                as.add( function( as, result )
                {
                    if ( typeof result === 'undefined' )
                    {
                        // pass
                    }
                    else if ( typeof result === 'object' )
                    {
                        _extend( reqinfo.result(), result );
                    }
                    else
                    {
                        reqinfo.info.RAW_RESPONSE.r = result;
                    }

                    _this._checkResponse( as, reqinfo );
                    as.success( reqinfo );
                } );
            },
            function( as, err )
            {
                var reqinfo = as.state.reqinfo;
                var reqinfo_info = reqinfo.info;
                var error_info = as.state.error_info;

                if ( !( err in invoker.SpecTools.standard_errors ) &&
                      ( !reqinfo_info._func_info ||
                        !( err in reqinfo_info._func_info.throws ) ) )
                {
                    _this.emit( 'notExpected', err, error_info, as.state.last_exception );
                    err = FutoInError.InternalError;
                    error_info = 'Not expected error';
                }

                var rawrsp = reqinfo.info.RAW_RESPONSE;

                rawrsp.e = err;
                delete rawrsp.r;

                if ( error_info )
                {
                    rawrsp.edesc = error_info;
                }

                // Even though request itself fails, send response
                as.success( reqinfo );
            }
        )
            .add( function( as, reqinfo )
            {
                _this._signResponse( as, reqinfo );
            } );
    },

    /**
     * Shortcut to check access through #acl interface.
     *
     * NOTE: as.state.reqinfo must point to valid instance of RequestInfo
     * @param {AsyncSteps} as - steps interface
     * @param {string} acd - access control descriptor
     */
    checkAccess : function( as, acd )
    {
        void acd;
        as.error( FutoInError.NotImplemented, "Access Control is not supported yet" );
    },

    /**
     * NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
     * from spec.
     * @param {AsyncSteps} as - steps interface
     */
    initFromCache : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    },

    /**
     * NOT IMPLEMENTED, DO NOT USE. Just a compliance with the Executor interface
     * from spec.
     * @param {AsyncSteps} as - steps interface
     */
    cacheInit : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    },

    _getInfo : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var f = reqinfo_info.RAW_REQUEST.f;

        if ( typeof f !== "string" )
        {
            as.error( FutoInError.InvalidRequest, "Missing req.f" );
        }

        //
        f = f.split( ':' );

        if ( f.length !== 3 )
        {
            as.error( FutoInError.InvalidRequest, "Invalid req.f" );
        }

        var iface = f[ 0 ];
        var func = f[ 2 ];

        //
        var v = f[ 1 ].split( '.' );

        if ( v.length !== 2 )
        {
            as.error( FutoInError.InvalidRequest, "Invalid req.f (version)" );
        }

        //
        if ( !( iface in this._ifaces ) )
        {
            as.error( FutoInError.UnknownInterface, "Unknown Interface" );
        }

        var vmjr = v[ 0 ];
        var vmnr = v[ 1 ];

        if ( !( vmjr in this._ifaces[ iface ] ) )
        {
            as.error( FutoInError.NotSupportedVersion, "Different major version" );
        }

        var iface_info = this._ifaces[ iface ][ vmjr ];

        if ( iface_info.mnrver < vmnr )
        {
            as.error( FutoInError.NotSupportedVersion, "Iface version is too old" );
        }

        // Jump to actual implementation
        if ( 'derived' in iface_info )
        {
            iface_info = iface_info.derived;
        }

        if ( !( func in iface_info.funcs ) )
        {
            as.error( FutoInError.InvalidRequest, "Not defined interface function" );
        }

        var finfo = iface_info.funcs[ func ];

        reqinfo_info._iface_info = iface_info;
        reqinfo_info._func = func;
        reqinfo_info._func_info = finfo;

        if ( finfo.rawresult )
        {
            reqinfo_info.HAVE_RAW_RESULT = true;
        }
    },

    _stepReqinfoUser : function( as, reqinfo_info, authrsp )
    {
        var obf = reqinfo_info.RAW_REQUEST.obf;

        if ( obf &&
             ( authrsp.seclvl === RequestInfo.SL_SYSTEM ) )
        {
            reqinfo_info.SECURITY_LEVEL = obf.slvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                null );
        }
        else
        {
            reqinfo_info.SECURITY_LEVEL = authrsp.seclvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                authrsp.local_id,
                authrsp.global_id,
                authrsp.details );
        }
    },

    _checkBasicAuth : function( as, reqinfo, sec )
    {
        // TODO: check for credentials auth
        // Temporary use of "basicauth" service
        var _this = this;

        as.add(
            function( as )
            {
                var basicauth = _this._ccm.iface( '#basicauth' );
                var reqinfo_info = reqinfo.info;

                if ( reqinfo_info.RAW_REQUEST.obf &&
                     ( reqinfo.info.CHANNEL_CONTEXT.type() === 'INTERNAL' ) )
                {
                    _this._stepReqinfoUser( as, reqinfo_info, { seclvl : RequestInfo.SL_SYSTEM } );
                }
                else
                {
                    basicauth.call( as, 'auth',
                        {
                            user : sec[ 0 ],
                            pwd : sec[ 1 ],
                            client_addr : reqinfo_info.CLIENT_ADDR.asString(),
                            is_secure : reqinfo_info.SECURE_CHANNEL,
                        } );

                    as.add( function( as, rsp )
                    {
                        _this._stepReqinfoUser( as, reqinfo_info, rsp );
                    } );
                }
            },
            function( as, err )
            {
                void err;
                // console.log( err, as.state.error_info );
                // console.log( as.state.last_exception.stack );
                as.success(); // check in constraints
            }
        );
    },

    _checkAuthHMAC : function( as, reqinfo, user, algo, sig )
    {
        // TODO: check "sec" for HMAC . MasterService

        // Temporary use of "basicauth" service
        var _this = this;

        as.add(
            function( as )
            {
                var basicauth = _this._ccm.iface( '#basicauth' );
                var reqinfo_info = reqinfo.info;
                var req = _clone( reqinfo.info.RAW_REQUEST );

                delete req.sec;

                basicauth.call( as, 'checkHMAC',
                    {
                        msg : req,
                        user : user,
                        algo : algo,
                        sig : sig,
                        client_addr : reqinfo_info.CLIENT_ADDR.asString(),
                        is_secure : reqinfo_info.SECURE_CHANNEL,
                    } );

                as.add( function( as, rsp )
                {
                    _this._stepReqinfoUser( as, reqinfo_info, rsp );
                    reqinfo_info._hmac_algo = algo;
                    reqinfo_info._hmac_user = user;
                } );
            },
            function( as, err )
            {
                void err;
                // console.log( err, as.state.error_info );
                // console.log( as.state.last_exception.stack );
                as.error( FutoInError.SecurityError, "Signature Verification Failed" );
            }
        );
    },

    _checkInternalAuth : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;

        if ( reqinfo.info.CHANNEL_CONTEXT.type() !== 'INTERNAL' )
        {
            as.error( FutoInError.SecurityError, "Not internal channel" );
        }

        var obf = reqinfo_info.RAW_REQUEST.obf;

        if ( obf )
        {
            reqinfo_info.SECURITY_LEVEL = obf.slvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                null );
        }
        else
        {
            reqinfo_info.SECURITY_LEVEL = RequestInfo.SL_SYSTEM;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                '-internal',
                '-internal',
                null );
        }
    },

    _seclvl_list : [ "Anonymous", "Info", "SafeOps", "PrivilegedOps", "ExceptionalOps", "ExceptionalOps", "System" ],

    _checkConstraints : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var constraints = reqinfo_info._iface_info.constraints;
        var finfo = reqinfo_info._func_info;

        if ( ( 'SecureChannel' in constraints ) &&
             !reqinfo_info.SECURE_CHANNEL )
        {
            as.error( FutoInError.SecurityError, "Insecure channel" );
        }

        if ( ( 'MessageSignature' in constraints ) &&
             !reqinfo_info.DERIVED_KEY &&
             !reqinfo_info._hmac_user )
        {
            as.error( FutoInError.SecurityError, "Message Signature is required" );
        }

        if ( !( 'AllowAnonymous' in constraints ) &&
             !reqinfo_info.USER_INFO )
        {
            as.error( FutoInError.SecurityError, "Anonymous not allowed" );
        }

        var context = reqinfo_info.CHANNEL_CONTEXT;

        if ( ( 'BiDirectChannel' in constraints ) &&
             ( !context ||
               !context.isStateful() ) )
        {
            as.error( FutoInError.InvalidRequest, "Bi-Direct Channel is required" );
        }

        if ( finfo.seclvl )
        {
            var finfo_index = this._seclvl_list.indexOf( finfo.seclvl );
            var current_index = this._seclvl_list.indexOf( reqinfo_info.SECURITY_LEVEL );

            if ( ( finfo_index < 0 ) ||
                 ( current_index < finfo_index ) )
            {
                as.error( FutoInError.PleaseReauth, finfo.seclvl );
            }
        }
    },

    _checkParams : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var rawreq = reqinfo_info.RAW_REQUEST;
        var finfo = reqinfo_info._func_info;

        if ( reqinfo.HAVE_RAW_UPLOAD &&
             !finfo.rawupload )
        {
            as.error( FutoInError.InvalidRequest, "Raw upload is not allowed" );
        }

        if ( 'p' in rawreq )
        {
            var reqparams = rawreq.p;
            var k;

            // Check params
            for ( k in reqparams )
            {
                if ( !( k in finfo.params ) )
                {
                    as.error( FutoInError.InvalidRequest, "Unknown parameter" );
                }

                var check_res = invoker.SpecTools.checkParameterType(
                    reqinfo_info._iface_info,
                    reqinfo_info._func,
                    k,
                    reqparams[ k ]
                );

                if ( check_res )
                {
                    continue;
                }

                // Workaround FTN5 v1.2 Query String parameter coding rules
                if ( reqinfo_info._from_query_string )
                {
                    try
                    {
                        // try dummy decode
                        reqparams[ k ] = JSON.parse( reqparams[ k ] );

                        check_res = invoker.SpecTools.checkParameterType(
                            reqinfo_info._iface_info,
                            reqinfo_info._func,
                            k,
                            reqparams[ k ]
                        );

                        if ( check_res )
                        {
                            continue;
                        }
                    }
                    catch ( e )
                    {
                        // ignore
                    }
                }

                as.error( FutoInError.InvalidRequest, "Type mismatch for parameter: " + k );
            }

            // Check missing params
            for ( k in finfo.params )
            {
                if ( !( k in reqparams ) )
                {
                    var pinfo = finfo.params[ k ];

                    if ( 'default' in pinfo )
                    {
                        reqparams[ k ] = pinfo.default;
                    }
                    else
                    {
                        as.error( FutoInError.InvalidRequest, "Missing parameter: " + k );
                    }
                }
            }
        }
        else if ( Object.keys( finfo.params ).length > 0 )
        {
            as.error( FutoInError.InvalidRequest, "Missing parameter (any)" );
        }
    },

    _getImpl : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var iface_info = reqinfo_info._iface_info;

        var iname = iface_info.iface;
        var imjr = iface_info.mjrver;
        var impl = this._impls[ iname ][ imjr ];

        if ( typeof impl !== "object" )
        {
            if ( typeof impl === "function" )
            {
                impl = impl( impl, this );
            }
            else
            {
                as.error( FutoInError.InternalError, "Invalid implementation type" );
            }

            if ( typeof impl !== "object" )
            {
                as.error( FutoInError.InternalError, "Implementation does not implement InterfaceImplementation" );
            }

            this._impls[ iname ][ imjr ] = impl;
        }

        return impl;
    },

    _checkResponse : function( as, reqinfo )
    {
        if ( !this._dev_checks )
        {
            return;
        }

        var reqinfo_info = reqinfo.info;
        var rsp = reqinfo_info.RAW_RESPONSE;
        var finfo = reqinfo_info._func_info;

        // Check raw result
        if ( finfo.rawresult )
        {
            reqinfo_info.RAW_RESPONSE = null;

            if ( typeof rsp.r !== 'object' ||
                 Object.keys( rsp.r ).length > 0 )
            {
                as.error( FutoInError.InternalError, "Raw result is expected" );
            }

            return;
        }

        // Check if response is needed at all
        if ( !finfo.expect_result &&
            ( reqinfo_info.RAW_REQUEST.forcersp !== true )
        )
        {
            reqinfo_info.RAW_RESPONSE = null;
            return;
        }

        // check result variables
        var resvars = finfo.result;
        var result = rsp.r;
        var iface_info = reqinfo_info._iface_info;

        if ( typeof resvars === 'string' )
        {
            if ( !invoker.SpecTools.checkType( iface_info, resvars, result ) )
            {
                as.error( FutoInError.InternalError, "Invalid result type" );
            }
        }
        else if ( Object.keys( resvars ).length > 0 )
        {
            var c = 0;
            var k;
            var func = reqinfo_info._func;

            // NOTE: the must be no unknown result variables on executor side as exactly the
            // specified interface version must be implemented
            for ( k in result )
            {
                if ( !( k in resvars ) )
                {
                    as.error( FutoInError.InternalError, "Unknown result variable '" + k + "'" );
                }

                invoker.SpecTools.checkResultType(
                    as,
                    iface_info,
                    func,
                    k,
                    result[ k ]
                );
                ++c;
            }

            if ( Object.keys( resvars ).length !== c )
            {
                as.error( FutoInError.InternalError, "Missing result variables" );
            }
        }
        else if ( Object.keys( result ).length > 0 )
        {
            as.error( FutoInError.InternalError, "No result variables are expected" );
        }
    },

    _signResponse : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var rawrsp = reqinfo_info.RAW_RESPONSE;

        if ( !rawrsp )
        {
            // Nothing to sign
            this.emit( 'response', reqinfo, rawrsp );
            return;
        }

        if ( reqinfo_info.DERIVED_KEY )
        {
            // TODO: implement signing with Derived key
            this.emit( 'response', reqinfo, rawrsp );
            return;
        }

        if ( reqinfo_info._hmac_user )
        {
            // Temporary use of "basicauth" service
            var _this = this;

            as.add(
                function( as )
                {
                    var basicauth = _this._ccm.iface( '#basicauth' );

                    basicauth.call( as, 'genHMAC',
                        {
                            msg : rawrsp,
                            user : reqinfo_info._hmac_user,
                            algo : reqinfo_info._hmac_algo,
                        } );

                    as.add( function( as, rsp )
                    {
                        rawrsp.sec = rsp.sig;
                        _this.emit( 'response', reqinfo, rawrsp );
                    } );
                },
                function( as, err )
                {
                    void err;
                    _this.emit( 'response', reqinfo, rawrsp );
                    as.success();
                }
            );

            return;
        }

        // Default
        this.emit( 'response', reqinfo, rawrsp );
    },

    /**
     * Shutdown Executor and stop whole processing
     * @param {callable} [close_cb=null] - callback to execute after Executor shutdown
     * @fires Executor#close
     */
    close : function( close_cb )
    {
        this.emit( 'close' );

        if ( close_cb )
        {
            close_cb();
        }
    },

    /**
     * Not standard. Pack message object into JSON representation.
     * If safe limit of 64K is exceeded  then error is raised.
     *
     * @param {object} msg - message to encode into JSON
     * @returns {string} string representation of the message
     * @fires Executor#notExpected
     */
    packPayloadJSON : function( msg )
    {
        var rawmsg = JSON.stringify( msg );

        if ( this._byteLength( rawmsg, 'utf8' ) > this.SAFE_PAYLOAD_LIMIT )
        {
            this.emit( 'notExpected', FutoInError.InternalError, "Response size has exceeded safety limit" );
            throw new Error( FutoInError.InternalError );
        }

        return rawmsg;
    },
};

Executor.prototype = ExecutorProto;

module.exports = Executor;

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
 * ( errmsg, error_info, last_exception )
 * @event Executor#notExpected
 */

/**
 * Fired when Executor is shutting down.
 * ()
 * @event Executor#close
 */
