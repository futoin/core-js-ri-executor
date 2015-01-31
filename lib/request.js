"use strict";

var _extend = require( 'lodash/object/extend' );
var performance_now = require( "performance-now" );
var async_steps = require( 'futoin-asyncsteps' );

// ---
var userinfo_const =
{
    INFO_FirstName : "FirstName",
    INFO_FullName : "FullName",
    /** ISO "YYYY-MM-DD" format */
    INFO_DateOfBirth : "DateOfBirth",
    /** ISO "HH:mm:ss" format, can be truncated to minutes */
    INFO_TimeOfBirth : "TimeOfBirth",
    INFO_ContactEmail : "ContactEmail",
    INFO_ContactPhone : "ContactPhone",
    INFO_HomeAddress : "HomeAddress",
    INFO_WorkAddress : "WorkAddress",
    INFO_Citizenship : "Citizenship",
    INFO_GovernmentRegID : "GovernmentRegID",
    INFO_AvatarURL : "AvatarURL"
};

exports.UserInfo = function( ccm, local_id, global_id )
{
    _extend( this, userinfo_const, UserInfoProto );
    this._ccm = ccm;
    this._local_id = local_id;
    this._global_id = global_id;
};

_extend( exports.UserInfo, userinfo_const );

var UserInfoProto =
{
    localID : function()
    {
        return this._local_id;
    },

    globalID : function()
    {
        return this._global_id;
    },

    details : function( as, user_field_identifiers )
    {
        as.error( 'NotImplemented' );
        void user_field_identifiers;
    }
};

//
// ---
exports.SourceAddress = function( type, host, port )
{
    _extend( this, SourceAddressProto );

    if ( type === null )
    {
        if ( typeof host !== 'string' )
        {
            type = "LOCAL";
        }
        else if ( host.match( /^([0-9]{1,3}\.){3}[0-9]{1,3}$/ ) )
        {
            type = "IPv4";
        }
        else
        {
            type = "IPv6";
        }
    }

    this.type = type;
    this.host = host;
    this.port = port;
};

var SourceAddressProto =
{
    host : null,
    port : null,
    type : null,

    asString : function()
    {
        if ( this.type === "LOCAL" )
        {
            return "LOCAL:" + this.port;
        }
        else if ( this.type === "IPv6" )
        {
            return "IPv6:[" + this.host + "]:" + this.port;
        }
        else
        {
            return this.type + ":" + this.host + ":" + this.port;
        }
    }
};

// ---
exports.DerivedKey = function( ccm, base_id, sequence_id )
{
    _extend( this, DerivedKeyProto );
    this._ccm = ccm;
    this._base_id = base_id;
    this._sequence_id = sequence_id;
};

var DerivedKeyProto =
{
    baseID : function()
    {
        return this._base_id;
    },

    sequenceID : function()
    {
        return this._sequence_id;
    },

    encrypt : function( as, data )
    {
        void as;
        void data;
    },

    decrypt : function( as, data )
    {
        void as;
        void data;
    }
};

// ---
exports.ChannelContext = function( executor )
{
    _extend( this, ChannelContextProto );
    this._executor = executor;
    this._ifaces = {};

    this.state = function()
    {
        return this.state;
    };
};

var ChannelContextProto =
{
    _user_info : null,
    _ifaces : null,

    state : null,

    type : function()
    {},

    isStateful : function()
    {
        return false;
    },

    onInvokerAbort : function( callable, user_data )
    {
        void callable;
        void user_data;
    },

    _openRawInput : function()
    {
        return null;
    },

    _openRawOutput : function()
    {
        return null;
    },

    register : function( as, ifacever, options )
    {
        if ( !this.isStateful() )
        {
            as.error( "InvokerError", 'Not stateful channel' );
        }

        this._executor.ccm().register( as, null, ifacever, this._getPerformRequest(), null, options );
        var _this = this;

        as.add( function( as, info, impl )
        {
            info.secure_channel = _this._executor._is_secure_channel;
            _this._ifaces[ ifacever ] = impl;
        } );
    },

    iface : function( ifacever )
    {
        return this._ifaces[ ifacever ];
    },

    _getPerformRequest : function()
    {
        throw Error( "NotImplemented" );

        // Implementation should return the following function
        // return function( as, ctx, ftnreq ) {};
    },

    _cleanup : function()
    {
        delete this._executor;
        delete this._ifaces;
        delete this.state;
    }
};

// ---
var reqinfo_const = {
    SL_ANONYMOUS : "Anonymous",
    SL_INFO : "Info",
    SL_SAFEOPS : "SafeOps",
    SL_PRIVLEGED_OPS : "PrivilegedOps",
    SL_EXCEPTIONAL_OPS : "ExceptionalOps",

    INFO_X509_CN : "X509_CN",
    INFO_PUBKEY : "PUBKEY",
    INFO_CLIENT_ADDR : "CLIENT_ADDR",
    INFO_SECURE_CHANNEL : "SECURE_CHANNEL",
    INFO_REQUEST_TIME_FLOAT : "REQUEST_TIME_FLOAT",
    INFO_SECURITY_LEVEL : "SECURITY_LEVEL",
    INFO_USER_INFO : "USER_INFO",
    INFO_RAW_REQUEST : "RAW_REQUEST",
    INFO_RAW_RESPONSE : "RAW_RESPONSE",
    INFO_DERIVED_KEY : "DERIVED_KEY",
    INFO_HAVE_RAW_UPLOAD : "HAVE_RAW_UPLOAD",
    INFO_HAVE_RAW_RESULT : "HAVE_RAW_RESULT",
    INFO_CHANNEL_CONTEXT : "CHANNEL_CONTEXT"
};

exports.RequestInfo = function( executor, rawreq )
{
    _extend( this, reqinfo_const, RequestInfoProto );
    this._executor = executor;

    // ---
    if ( typeof rawreq === "string" )
    {
        rawreq = JSON.parse( rawreq );
    }

    this._rawreq = rawreq;

    // ---
    var rawrsp = {
        r : {}
    };

    if ( 'rid' in rawreq )
    {
        rawrsp.rid = rawreq.rid;
    }

    this._rawrsp = rawrsp;

    // ---
    var info = function()
    {
        return this.info;
    };
    this.info = info;

    info[ this.INFO_X509_CN ] = null;
    info[ this.INFO_X509_CN ] = null;
    info[ this.INFO_PUBKEY ] = null;
    info[ this.INFO_CLIENT_ADDR ] = null;
    info[ this.INFO_SECURE_CHANNEL ] = false;
    info[ this.INFO_SECURITY_LEVEL ] = this.SL_ANONYMOUS;
    info[ this.INFO_USER_INFO ] = null;
    info[ this.INFO_RAW_REQUEST ] = rawreq;
    info[ this.INFO_RAW_RESPONSE ] = rawrsp;
    info[ this.INFO_DERIVED_KEY ] = null;
    info[ this.INFO_HAVE_RAW_UPLOAD ] = false;
    info[ this.INFO_HAVE_RAW_RESULT ] = false;
    info[ this.INFO_CHANNEL_CONTEXT ] = null;
    info[ this.INFO_REQUEST_TIME_FLOAT ] = performance_now();
};

_extend( exports.RequestInfo, reqinfo_const );

var RequestInfoProto =
{
    _executor : null,
    _rawreq : null,
    _rawrsp : null,

    _rawinp : null,
    _rawout : null,

    params : function()
    {
        return this._rawreq.p;
    },

    result : function()
    {
        return this._rawrsp.r;
    },

    /*
    info : function()
    {
        return this._info;
    },
    */

    rawInput : function()
    {
        var rawinp = this._rawinp;

        if ( !rawinp )
        {
            if ( this.info[ this.INFO_HAVE_RAW_UPLOAD ] &&
                 ( this.info[ this.INFO_CHANNEL_CONTEXT ] !== null ) )
            {
                rawinp = this.info[ this.INFO_CHANNEL_CONTEXT ]._openRawInput();
                this._rawinp = rawinp;
            }

            if ( !rawinp )
            {
                throw new Error( 'RawInputError' );
            }
        }

        return rawinp;
    },

    rawOutput : function()
    {
        var rawout = this._rawout;

        if ( !rawout )
        {
            if ( this.info[ this.INFO_HAVE_RAW_RESULT ] &&
                 ( this.info[ this.INFO_CHANNEL_CONTEXT ] !== null ) )
            {
                rawout = this.info[ this.INFO_CHANNEL_CONTEXT ]._openRawOutput();
                this._rawout = rawout;
            }

            if ( !rawout )
            {
                throw new Error( 'RawOutputError' );
            }
        }

        return rawout;
    },

    executor : function()
    {
        return this._executor;
    },

    channel : function()
    {
        return this.info[ this.INFO_CHANNEL_CONTEXT ];
    },

    cancelAfter : function( time_ms )
    {
        if ( this._cancelAfter )
        {
            async_steps.AsyncTool.cancelCall( this._cancelAfter );
            this._cancelAfter = null;
        }

        if ( ( time_ms > 0 ) &&
            this._as )
        {
            var _this = this;

            this._cancelAfter = async_steps.AsyncTool.callLater(
                function( )
                {
                    _this._as.cancel();
                },
                time_ms
            );
        }
    }
};
