"use strict";

var _ = require( 'lodash' );
var performance_now = require( "performance-now" );

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
    this._ccm = ccm;
    this._local_id = local_id;
    this._global_id = global_id;
};

exports.UserInfo.prototype =
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

_.extend( exports.UserInfo, userinfo_const );
_.extend( exports.UserInfo.prototype, userinfo_const );

//
// ---
exports.SourceAddress = function( type, host, port )
{
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

exports.SourceAddress.prototype =
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
    this._ccm = ccm;
    this._base_id = base_id;
    this._sequence_id = sequence_id;
};

exports.DerivedKey.prototype =
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
exports.ChannelContext = function()
{
    this.state = function()
    {
        return this.state;
    };
};

exports.ChannelContext.prototype =
{
    state : null,

    type : function()
    {},

    isStateful : function()
    {},

    onInvokerAbort : function( callable, user_data )
    {
        void callable;
        void user_data;
    },

    openRawInput : function()
    {
        return null;
    },

    openRawOutput : function()
    {
        return null;
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

exports.RequestInfo.prototype =
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
        if ( this.info[ this.INFO_HAVE_RAW_UPLOAD ] &&
             ( this._rawinp === null ) &&
             ( this.info[ this.INFO_CHANNEL_CONTEXT ] !== null ) )
        {
            this._rawinp = this.info[ this.INFO_CHANNEL_CONTEXT ].openRawInput();
        }

        return this._rawinp;
    },

    rawOutput : function()
    {
        if ( this.info[ this.INFO_HAVE_RAW_RESULT ] &&
             ( this._rawout === null ) &&
             ( this.info[ this.INFO_CHANNEL_CONTEXT ] !== null ) )
        {
            this._rawout = this.info[ this.INFO_CHANNEL_CONTEXT ].openRawOutput();
        }

        return this._rawout;
    },

    executor : function()
    {
        return this._executor;
    }
};

_.extend( exports.RequestInfo, reqinfo_const );
_.extend( exports.RequestInfo.prototype, reqinfo_const );
