"use strict";

var _extend = require( 'lodash/object/extend' );
var performance_now = require( "performance-now" );
var async_steps = require( 'futoin-asyncsteps' );

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

var RequestInfo = function( executor, rawreq )
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

_extend( RequestInfo, reqinfo_const );

var RequestInfoProto = reqinfo_const; // optimize

RequestInfoProto._rawinp = null;
RequestInfoProto._rawout = null;

RequestInfoProto.params = function()
{
    return this._rawreq.p;
};

RequestInfoProto.result = function()
{
    return this._rawrsp.r;
};

// info : null,

RequestInfoProto.rawInput = function()
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
};

RequestInfoProto.rawOutput = function()
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
};

RequestInfoProto.executor = function()
{
    return this._executor;
};

RequestInfoProto.channel = function()
{
    return this.info[ this.INFO_CHANNEL_CONTEXT ];
};

RequestInfoProto.cancelAfter = function( time_ms )
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
};

RequestInfo.prototype = RequestInfoProto;
module.exports = RequestInfo;
