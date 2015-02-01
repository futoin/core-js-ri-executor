"use strict";

var _extend = require( 'lodash/object/extend' );
var invoker = require( 'futoin-invoker' );
var FutoInError = invoker.FutoInError;
var request = require( './request' );
var async_steps = require( 'futoin-asyncsteps' );
var ee = require( 'event-emitter' );

var ChannelContext = request.ChannelContext;

// ---
var CallbackChannelContext = function( executor )
{
    ChannelContext.call( this, executor );
    _extend( this, CallbackChannelContextProto );
};

var CallbackChannelContextProto = {
    type : function()
    {
        return "CALLBACK";
    },

    isStateful : function()
    {
        return true;
    }
};

// ---
var InternalChannelContext = function( executor, invoker_executor )
{
    ChannelContext.call( this, executor );
    _extend( this, InternalChannelContextProto );
    this._invoker_executor = invoker_executor;
};

var InternalChannelContextProto = {
    type : function()
    {
        return "INTERNAL";
    },

    isStateful : function()
    {
        return true;
    },

    _getPerformRequest : function()
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
    },

    _commError : function( as )
    {
        as.error( FutoInError.CommError, "No Invoker's Executor for internal call" );
    }
};

// ---
var executor_const =
{
    OPT_VAULT : "vault",
    OPT_SPEC_DIRS : invoker.AdvancedCCM.OPT_SPEC_DIRS,
    OPT_PROD_MODE : invoker.AdvancedCCM.OPT_PROD_MODE,

    /**
     * Message sniffer callback( source, msg, is_incomming )
     * @alias Executor.OPT_MSG_SNIFFER
     * @private
     */
    OPT_MSG_SNIFFER : invoker.SimpleCCM.OPT_MSG_SNIFFER,

    OPT_REQUEST_TIMEOT : "reqTimeout",
    OPT_HEAVY_REQUEST_TIMEOT : "heavyTimeout",

    DEFAULT_REQUEST_TIMEOUT : 5e3,
    DEFAULT_HEAVY_TIMEOUT : 60e3,

    SAFE_PAYLOAD_LIMIT : 65536,
};

var executor = function( ccm, opts )
{
    ee( this );
    _extend( this, executor_const, executor_proto );

    this._ccm = ccm;
    this._ifaces = {};
    this._impls = {};

    opts = opts || {};

    //
    var spec_dirs = opts[ this.OPT_SPEC_DIRS ];

    if ( !( spec_dirs instanceof Array ) )
    {
        spec_dirs = [ spec_dirs ];
    }

    this._specdirs = spec_dirs;

    //
    this._dev_checks = !opts[ this.OPT_PROD_MODE ];

    //
    this._request_timeout = opts[ this.OPT_REQUEST_TIMEOT ] || this.DEFAULT_REQUEST_TIMEOUT;
    this._heavy_timeout = opts[ this.OPT_HEAVY_REQUEST_TIMEOT ] || this.DEFAULT_HEAVY_TIMEOUT;

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

var executor_proto =
{
    _ccm : null,
    _ifaces : null,
    _impls : null,

    _specdirs : null,
    _dev_checks : false,

    ccm : function()
    {
        return this._ccm;
    },

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
            mnrver : mnr
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
                    derived : info
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

    onEndpointRequest : function( info, ftnreq, send_executor_rsp )
    {
        var _this = this;
        var reqinfo = new request.RequestInfo( this, ftnreq );

        var context = new CallbackChannelContext( this );
        var source_addr = new request.SourceAddress( context.type(), null, info.regname );

        var reqinfo_info = reqinfo.info;
        reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] = context;
        reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ] = source_addr;
        reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] = info.secure_channel;

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
                        e : "InternalError"
                    };

                    reqinfo.cancelAfter( 0 );
                    reqinfo._as = null;
                    send_executor_rsp( ftnrsp );
                } );

                as.state.reqinfo = reqinfo;
                _this.process( as );

                as.add( function( as )
                {
                    void as;
                    var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];

                    reqinfo.cancelAfter( 0 );
                    reqinfo._as = null;

                    if ( ftnrsp !== null )
                    {
                        send_executor_rsp( ftnrsp );
                    }
                } );
            },
            function( as, err )
            {
                _this.emit( 'notExpected', err, as.state.error_info );
                reqinfo.cancelAfter( 0 );
                reqinfo._as = null;
            }
        ).execute();
    },

    onInternalRequest : function( as, info, ftnreq, upload_data, download_stream )
    {
        var context = info._server_executor_context;

        if ( !context )
        {
            context = new InternalChannelContext( this, info.options.executor );
            info._server_executor_context = context;
        }

        var _this = this;
        var reqinfo = new request.RequestInfo( this, ftnreq );
        var source_addr = new request.SourceAddress( context.type(), null, null );

        var reqinfo_info = reqinfo.info;
        reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ] = context;
        reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ] = source_addr;
        reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] = true;

        if ( upload_data )
        {
            reqinfo_info[ reqinfo.INFO_HAVE_RAW_UPLOAD ] = true;
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
                        reqinfo.cancelAfter( 0 );
                        reqinfo._as = null;

                        if ( !as.state._orig_as_cancel )
                        {
                            try
                            {
                                orig_as.error( FutoInError.InternalError, "Executor canceled" );
                            }
                            catch ( e )
                            {}
                        }
                    } );

                    as.state.reqinfo = reqinfo;
                    _this.process( as );

                    as.add( function( as )
                    {
                        void as;
                        var ftnrsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];

                        reqinfo.cancelAfter( 0 );
                        reqinfo._as = null;

                        if ( ftnrsp !== null )
                        {
                            orig_as.success( ftnrsp, invoker.SimpleCCM.FUTOIN_CONTENT_TYPE );
                        }
                    } );
                },
                function( as, err )
                {
                    _this.emit( 'notExpected', err, as.state.error_info );
                    reqinfo.cancelAfter( 0 );
                    reqinfo._as = null;
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

    process : function( as )
    {
        if ( !( 'reqinfo' in as.state ) ||
              ( '_futoin_func_info' in as.state ) )
        {
            as.error( FutoInError.InternalError, "Invalid process() invocation" );
        }

        var _this = this;

        as.add(
            function( as )
            {
                var reqinfo = as.state.reqinfo;
                var reqinfo_info = reqinfo.info;
                var rawreq = reqinfo_info[ reqinfo.INFO_RAW_REQUEST ];
                _this.emit( 'request', reqinfo, rawreq );

                // Step 1. Parsing interface and function info
                // ---
                _this._getInfo( as, reqinfo );

                if ( as.state._futoin_func_info.heavy )
                {
                    reqinfo.cancelAfter( _this._heavy_timeout );
                }
                else
                {
                    reqinfo.cancelAfter( _this._request_timeout );
                }

                // Step 2. Security
                // ---
                var sec = rawreq.sec;

                if ( sec )
                {
                    sec = sec.split( ':' );

                    // reserved user name
                    if ( sec[ 0 ] === 'hmac' )
                    {
                        // TODO: check "sec" for HMAC . MasterService
                    }
                    else
                    {
                        // TODO: check for credentials auth

                        // Temporary use of "basicauth" service
                        _this._checkBasicAuth( as, reqinfo, sec );
                    }
                }

                // Step 3. Check constraints and function parameters
                // ---
                as.add( function( as )
                {
                    _this._checkConstraints( as, reqinfo );
                    _this._checkParams( as, reqinfo );
                } );

                // Step 4. Invoke implementation
                // ---
                as.add( function( as )
                {
                    var func = as.state._futoin_func;
                    var impl = _this._getImpl( as, reqinfo );

                    if ( !( func in impl ) )
                    {
                        as.error( FutoInError.InternalError, "Missing function implementation" );
                    }

                    var result = impl[ func ]( as, reqinfo );

                    if ( result )
                    {
                        _extend( reqinfo.result(), result );
                    }
                } );

                // Step 5. Gather result and sign succeeded response
                // ---
                as.add( function( as, result )
                {
                    if ( result )
                    {
                        _extend( reqinfo.result(), result );
                    }

                    _this._checkResponse( as, reqinfo );
                    _this._signResponse( as, reqinfo );

                    _this.emit( 'response', reqinfo, reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] );
                } );
            },
            function( as, err )
            {
                var reqinfo = as.state.reqinfo;
                var error_info = as.state.error_info;

                if ( !( err in invoker.SpecTools.standard_errors ) &&
                      ( !as.state._futoin_func_info ||
                        !( err in as.state._futoin_func_info.throws ) ) )
                {
                    _this.emit( 'notExpected', err, error_info );
                    err = FutoInError.InternalError;
                    error_info = 'Not expected error';
                }

                var rawrsp = reqinfo.info[ reqinfo.INFO_RAW_RESPONSE ];
                rawrsp.e = err;
                delete rawrsp.r;

                if ( error_info )
                {
                    rawrsp.edesc = error_info;
                }

                // Even though request itself fails, send response
                _this._signResponse( as, reqinfo );
                _this.emit( 'response', reqinfo, rawrsp );
                as.success();
            }
        );
    },

    checkAccess : function( as, acd )
    {
        void acd;
        as.error( FutoInError.NotImplemented, "Access Control is not supported yet" );
    },

    initFromCache : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    },

    cacheInit : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    },

    _getInfo : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var f = reqinfo_info[ reqinfo.INFO_RAW_REQUEST ].f;

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

        as.state._futoin_iface_info = iface_info;
        as.state._futoin_func = func;
        as.state._futoin_func_info = finfo;

        if ( finfo.rawresult )
        {
            reqinfo_info[ reqinfo.INFO_HAVE_RAW_RESULT ] = true;
        }
    },

    _checkBasicAuth : function( as, reqinfo, sec )
    {
        var _this = this;

        as.add(
            function( as )
            {
                var basicauth = _this._ccm.iface( '#basicauth' );
                var reqinfo_info = reqinfo.info;

                basicauth.call( as, 'auth',
                {
                    user : sec[ 0 ],
                    pwd : sec[ 1 ],
                    client_addr : reqinfo_info[ reqinfo.INFO_CLIENT_ADDR ].asString(),
                    is_secure : reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ]
                } );

                as.add( function( as, rsp )
                {
                    reqinfo_info[ reqinfo.INFO_USER_INFO ] =
                            new request.UserInfo(
                                _this._ccm,
                                rsp.local_id,
                                rsp.global_id,
                                rsp.details );
                    reqinfo_info[ reqinfo.INFO_SECURITY_LEVEL ] =
                            request.RequestInfo.SL_INFO;
                } );
            },
            function( as, err )
            {
                void err;
                as.success(); // check in constraints
            }
        );
    },

    _checkConstraints : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;
        var constraints = as.state._futoin_iface_info.constraints;

        if ( ( 'SecureChannel' in constraints ) &&
             !reqinfo_info[ reqinfo.INFO_SECURE_CHANNEL ] )
        {
            as.error( FutoInError.SecurityError, "Insecure channel" );
        }

        if ( !( 'AllowAnonymous' in constraints ) &&
             !reqinfo_info[ reqinfo.INFO_USER_INFO ] )
        {
            as.error( FutoInError.SecurityError, "Anonymous not allowed" );
        }

        var context = reqinfo_info[ reqinfo.INFO_CHANNEL_CONTEXT ];

        if ( ( 'BiDirectChannel' in constraints ) &&
             ( !context ||
               !context.isStateful() ) )
        {
            as.error( FutoInError.InvalidRequest, "Bi-Direct Channel is required" );
        }
    },

    _checkParams : function( as, reqinfo )
    {
        var rawreq = reqinfo.info[ reqinfo.INFO_RAW_REQUEST ];
        var finfo = as.state._futoin_func_info;

        if ( reqinfo[ reqinfo.INFO_HAVE_RAW_UPLOAD ] &&
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

                invoker.SpecTools.checkParameterType(
                    as,
                    as.state._futoin_iface_info,
                    as.state._futoin_func,
                    k,
                    reqparams[ k ]
                );
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
        void reqinfo;
        var iface_info = as.state._futoin_iface_info;

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
        var rsp = reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ];
        var finfo = as.state._futoin_func_info;

        // Check raw result
        if ( finfo.rawresult )
        {
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = null;

            if ( Object.keys( rsp.r ).length > 0 )
            {
                as.error( FutoInError.InternalError, "Raw result is expected" );
            }

            return;
        }

        // Check if response is needed at all
        if ( !finfo.expect_result &&
            ( reqinfo_info[ reqinfo.INFO_RAW_REQUEST ].forcersp !== true )
        )
        {
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = null;
            return;
        }

        // check result variables
        if ( Object.keys( finfo.result ).length > 0 )
        {
            var resvars = finfo.result;
            var c = 0;
            var k;

            // NOTE: the must be no unknown result variables on executor side as exactly the
            // specified interface version must be implemented
            for ( k in rsp.r )
            {
                if ( !( k in resvars ) )
                {
                    as.error( FutoInError.InternalError, "Unknown result variable '" + k + "'" );
                }

                invoker.SpecTools.checkResultType(
                        as,
                        as.state._futoin_iface_info,
                        as.state._futoin_func,
                        k,
                        rsp.r[ k ]
                );
                ++c;
            }

            if ( Object.keys( resvars ).length !== c )
            {
                as.error( FutoInError.InternalError, "Missing result variables" );
            }
        }
        else if ( Object.keys( rsp.r ).length > 0 )
        {
            as.error( FutoInError.InternalError, "No result variables are expected" );
        }
    },

    _signResponse : function( as, reqinfo )
    {
        if ( !reqinfo.info[ reqinfo.INFO_DERIVED_KEY ] )
        {
            return;
        }

        // TODO :
    },

    close : function()
    {},

    packPayloadJSON : function(  msg )
    {
        var rawmsg = JSON.stringify( msg );

        if ( this._byteLength( rawmsg, 'utf8' ) > this.SAFE_PAYLOAD_LIMIT )
        {
            this.emit( 'notExpected', FutoInError.InternalError, "Response size has exceeded safety limit" );
            throw new Error( FutoInError.InternalError );
        }

        return rawmsg;
    }
};

_extend( executor, executor_const );
exports.Executor = executor;
exports.ExecutorConst = executor_const;
