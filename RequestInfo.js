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

var _extend = require( 'lodash/extend' );
var performance_now = require( "performance-now" );
var async_steps = require( 'futoin-asyncsteps' );

/**
 * Pseudo-class for RequestInfo.info field enumeration
 * @class
 * @see FTN6 spec
 */
var RequestInfoConst = {
    /**
     * Security Level - Anonymous
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_ANONYMOUS : "Anonymous",

    /**
     * Security Level - Info
     *
     * NOTE: it is level of user authentication, but
     * not authorization. This one is equal to
     * HTTP cookie-based authentication.
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_INFO : "Info",

    /**
     * Security Level - SafeOps
     *
     * NOTE: it is level of user authentication, but
     * not authorization. This one is equal to
     * HTTP Basic Auth.
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_SAFE_OPS : "SafeOps",

    /**
     * @deprecated
     * @ignore
     */
    SL_SAFEOPS :  "SafeOps",

    /**
     * Security Level - PrivilegedOps
     *
     * NOTE: it is level of user authentication, but
     * not authorization. This one equals to
     * multi-factor authentication and signed requests.
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_PRIVILEGED_OPS : "PrivilegedOps",

    /**
     * Security Level - ExceptionalOps
     *
     * NOTE: it is level of user authentication, but
     * not authorization. This one equals to
     * multi-factor authentication for each action and
     * signed requests.
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_EXCEPTIONAL_OPS : "ExceptionalOps",

    /**
     * Security Level - System
     *
     * NOTE: it is level of user authentication, but
     * not authorization. This one equals to
     * internal system authorization. User never gets
     * such security level.
     * @const
     * @see RequestInfoConst.INFO_SECURITY_LEVEL
     * @default
     */
    SL_SYSTEM : "System",

    /**
     * CN field coming from validated client's x509 certificate, if any
     * @default
     */
    INFO_X509_CN : "X509_CN",

    /**
     * Client provided public key, if any
     * @default
     */
    INFO_PUBKEY : "PUBKEY",

    /**
     * Client address
     * @see SourceAddress
     * @default
     */
    INFO_CLIENT_ADDR : "CLIENT_ADDR",

    /**
     * Boolean, indicates if transport channel is secure
     * @default
     */
    INFO_SECURE_CHANNEL : "SECURE_CHANNEL",

    /**
     * Implementation define timestamp of request start.
     *
     * NOTE:it may not be related to absolute time. Please
     * see performance-now NPM module.
     * @default
     */
    INFO_REQUEST_TIME_FLOAT : "REQUEST_TIME_FLOAT",

    /**
     * Authentication, but not authorization, security level.
     * @see RequestInfoConst.SL_*
     */
    INFO_SECURITY_LEVEL : "SECURITY_LEVEL",

    /**
     * User Info object
     * @see UserInfo
     */
    INFO_USER_INFO : "USER_INFO",

    /**
     * Raw FutoIn request object
     */
    INFO_RAW_REQUEST : "RAW_REQUEST",

    /**
     * Raw FutoIn response object
     */
    INFO_RAW_RESPONSE : "RAW_RESPONSE",

    /**
     * Associated Derived Key
     * @see DerivedKey
     */
    INFO_DERIVED_KEY : "DERIVED_KEY",

    /**
     * Indicates that input transport provided raw upload stream.
     *
     * NOTE: service implementation should simply try to open
     * RequestInfo.rawInput()
     */
    INFO_HAVE_RAW_UPLOAD : "HAVE_RAW_UPLOAD",

    /**
     * Indicates that Executor must provide raw response
     *
     * NOTE: service implementation should simply try to open
     * RequestInfo.rawOutput()
     */
    INFO_HAVE_RAW_RESULT : "HAVE_RAW_RESULT",

    /**
     * Associated transport channel context
     * @see ChannelContext
     */
    INFO_CHANNEL_CONTEXT : "CHANNEL_CONTEXT",
};

/**
 * RequestInfo object as defined in FTN6
 * @class
 * @param {Executor} executor - _
 * @param {object|string} rawreq - raw request
 */
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
    var rawrsp = { r : {} };

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

    info.X509_CN = null;
    info.PUBKEY = null;
    info.CLIENT_ADDR = null;
    info.SECURE_CHANNEL = false;
    info.SECURITY_LEVEL = this.SL_ANONYMOUS;
    info.USER_INFO = null;
    info.RAW_REQUEST = rawreq;
    info.RAW_RESPONSE = rawrsp;
    info.DERIVED_KEY = null;
    info.HAVE_RAW_UPLOAD = false;
    info.HAVE_RAW_RESULT = false;
    info.CHANNEL_CONTEXT = null;
    info.REQUEST_TIME_FLOAT = performance_now();
};

_extend( RequestInfo, RequestInfoConst );

var RequestInfoProto = RequestInfoConst; // optimize

RequestInfoProto._executor = null;
RequestInfoProto._rawinp = null;
RequestInfoProto._rawout = null;
RequestInfoProto._as = null;

/**
 * Get reference to input params
 * @return {object} parameter holder
 * @alias RequestInfo#params
 */
RequestInfoProto.params = function()
{
    return this._rawreq.p;
};

/**
 * Get reference to output
 * @param {*} replace - replace result object
 * @return {object} result variable holder
 * @alias RequestInfo#result
 */
RequestInfoProto.result = function( replace )
{
    if ( replace )
    {
        this._rawrsp.r = replace;
    }

    return this._rawrsp.r;
};

/**
 * Get reference to info map object
 *
 * NOTE: reqInfo.info() === reqInfo.info
 * @returns {object}
 * @alias RequestInfo#info
 */
RequestInfoProto.info = null;

/**
 * Get reference to input stream
 * @throws RawInputError
 * @returns {object} raw input stream
 * @alias RequestInfo#rawInput
 */
RequestInfoProto.rawInput = function()
{
    var rawinp = this._rawinp;

    if ( !rawinp )
    {
        if ( this.info.HAVE_RAW_UPLOAD &&
                ( this.info.CHANNEL_CONTEXT !== null ) )
        {
            rawinp = this.info.CHANNEL_CONTEXT._openRawInput();
            this._rawinp = rawinp;
        }

        if ( !rawinp )
        {
            throw new Error( 'RawInputError' );
        }
    }

    return rawinp;
};

/**
 * Get reference to output stream
 * @throws RawOutputError
 * @returns {object} raw output stream
 * @alias RequestInfo#rawOutput
 */
RequestInfoProto.rawOutput = function()
{
    var rawout = this._rawout;

    if ( !rawout )
    {
        if ( this.info.HAVE_RAW_RESULT &&
                ( this.info.CHANNEL_CONTEXT !== null ) )
        {
            rawout = this.info.CHANNEL_CONTEXT._openRawOutput();
            this._rawout = rawout;
        }

        if ( !rawout )
        {
            throw new Error( 'RawOutputError' );
        }
    }

    return rawout;
};

/**
 * Get reference to associated Executor instance
 * @returns {Executor} _
 * @alias RequestInfo#executor
 */
RequestInfoProto.executor = function()
{
    return this._executor;
};

/**
 * Get reference to channel context
 * @returns {ChannelContext} _
 * @alias RequestInfo#channel
 */
RequestInfoProto.channel = function()
{
    return this.info.CHANNEL_CONTEXT;
};

/**
 * Set overall request processing timeout in microseconds.
 *
 * NOTE: repeat calls override previous value
 * @param {float} time_ms - set automatic request timeout after specified
 *        value of microseconds. 0 - disables timeout
 * @alias RequestInfo#cancelAfter
 */
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

/**
 * @ignore
 */
RequestInfoProto._cleanup = function()
{
    var info = this.info;

    this.cancelAfter( 0 );
    this._as = null;
    this.info = null;

    var context = info.CHANNEL_CONTEXT;

    if ( context &&
         !context.isStateful() )
    {
        context._cleanup();
    }

    var user = info.USER_INFO;

    if ( user )
    {
        user._cleanup();
    }
};

RequestInfo.prototype = RequestInfoProto;
module.exports = RequestInfo;
