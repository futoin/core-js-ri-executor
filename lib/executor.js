"use strict";

var _ = require( 'lodash' );
var invoker = require( 'futoin-invoker' );
var FutoInError = invoker.FutoInError;

var executor_const =
{
    OPT_VAULT : "vault",
    OPT_SPEC_DIRS : invoker.AdvancedCCM.OPT_SPEC_DIRS,
    OPT_PROD_MODE : invoker.AdvancedCCM.OPT_PROD_MODE
};

var executor = function( ccm, opts )
{
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
};

executor.prototype =
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

    register : function( as, ifacever, impl )
    {
        var m = ifacever.match( invoker.SpecTools._ifacever_pattern );

        if ( m === null )
        {
            as.error( FutoInError.InternalError, "Invalid ifacever" );
        }

        var iface = m[1];
        var mjrmnr = m[4];
        var mjr = m[5];
        var mnr = m[6];

        var ifaces = this._ifaces;

        if ( ( iface in ifaces ) &&
             ( mjr in ifaces[iface] ) )
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

        invoker.SpecTools.loadIface( as, info, this._specdirs );

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
                var supiface = supm[1];
                var supmjrmnr = supm[4];
                var supmjr = supm[5];
                var supmnr = supm[6];

                var supinfo =
                {
                    iface : supiface,
                    version : supmjrmnr,
                    mjrver : supmjr,
                    mnrver : supmnr,
                    derived : info
                };

                if ( ( supiface in ifaces ) &&
                    ( supmjr in ifaces[supiface] ) )
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

                // Step 1. Parsing interface and function info
                // ---
                _this._getInfo( as, reqinfo );

                // Step 2. Security
                // ---
                    // TODO: check "sec" for HMAC . MasterService
                    // TODO: check for credentials auth .

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
                        _.extend( reqinfo.result(), result );
                    }
                } );

                // Step 5. Gather result and sign succeeded response
                // ---
                as.add( function( as, result )
                {
                    if ( result )
                    {
                        _.extend( reqinfo.result(), result );
                    }

                    _this._checkResult( as, reqinfo );

                    _this._signResponse( as, reqinfo );
                    _this._packResponse( as, reqinfo );
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
                    _this._onNotExpected( as, err, error_info );
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
                _this._packError( as, reqinfo );
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

        var iface = f[0];
        var func = f[2];

        //
        var v = f[1].split( '.' );

        if ( v.length !== 2 )
        {
            as.error( FutoInError.InvalidRequest, "Invalid req.f (version)" );
        }

        //
        if ( !( iface in this._ifaces ) )
        {
            as.error( FutoInError.UnknownInterface, "Unknown Interface" );
        }

        var vmjr = v[0];
        var vmnr = v[1];

        if ( !( vmjr in this._ifaces[iface] ) )
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
                    var pinfo = finfo.params[k];

                    if ( 'default' in pinfo )
                    {
                        reqparams[k] = pinfo.default;
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

    _checkResult : function( as, reqinfo )
    {
        if ( !this._dev_checks )
        {
            return;
        }

        var rsp = reqinfo.info[ reqinfo.INFO_RAW_RESPONSE ];
        var finfo = as.state._futoin_func_info;

        // Check raw result
        if ( finfo.rawresult )
        {
            if ( Object.keys( rsp.r ).length > 0 )
            {
                as.error( FutoInError.InternalError, "Raw result is expected" );
            }

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

    _packResponse : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;

        var finfo = as.state._futoin_func_info;

        if ( finfo.rawresult )
        {
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = null;
            return;
        }

        if ( !finfo.expect_result &&
            ( reqinfo_info[ reqinfo.INFO_RAW_REQUEST ].forcersp !== true )
        )
        {
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = null;
            return;
        }

        reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = JSON.stringify(
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ]
        );
    },

    _packError : function( as, reqinfo )
    {
        var reqinfo_info = reqinfo.info;

        reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ] = JSON.stringify(
            reqinfo_info[ reqinfo.INFO_RAW_RESPONSE ]
        );
    },

    _onNotExpected : function( as, err, error_info )
    {
        void as;
        void err;
        void error_info;
    }
};

_.extend( executor, executor_const );
_.extend( executor.prototype, executor_const );
exports.Executor = executor;
exports.ExecutorConst = executor_const;
