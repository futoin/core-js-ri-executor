"use strict";

/**
 * Channel Context normally accessible through RequestInfo object.
 * @param {Executor} executor - reference to associated executor
 * @class
 */
var ChannelContext = function( executor )
{
    this._executor = executor;
    this._ifaces = {};

    this.state = function()
    {
        return this.state;
    };
};

var ChannelContextProto =
{
    _executor : null,
    _ifaces : null,

    /**
     * Persistent storage for arbitrary user variables.
     * Please make sure variable names a prefixed.
     *
     * NOTE: context.state === context.state()
     * @alias ChannelContext.state
     * @returns {object} this.state
     */
    state : null,

    /**
     * Get type of channel
     *
     * Standard values: HTTP, WS, BROWSER, TCP, UDP, UNIX
     *
     * @returns {string} arbitrary string, see FTN6
     * @abstract
     */
    type : function()
    {
        return null;
    },

    /**
     * Check if transport is stateful (e.g. WebSockets)
     *
     * @returns {Boolean} true, if context object is persistent across
     * requests in the same session
     */
    isStateful : function()
    {
        return false;
    },

    /**
     * Set invoker abort handler.
     *
     * NOTE: It should be possible to call multiple times setting
     * multiple callbacks
     * @param {Function} callable - callback
     * @param {any=} user_data - optional parameter to pass to callable
     */
    onInvokerAbort : function( callable, user_data )
    {
        void callable;
        void user_data;
    },

    /**
     * Get native input stream
     * @private
     * @returns {object} raw input stream
     */
    _openRawInput : function()
    {
        return null;
    },

    /**
     * Get native output stream
     * @private
     * @returns {object} raw output stream
     */
    _openRawOutput : function()
    {
        return null;
    },

    /**
     * Register Invoker interface on bi-directional channels to make
     * calls from Server to Client.
     * @param {AsyncSteps} as - steps interface
     * @param {string} ifacever - standard iface:version notation
     * @param {object} options - standard Invoker options
     * @see AdvancedCCM.register
     */
    register : function( as, ifacever, options )
    {
        if ( !this.isStateful() )
        {
            as.error( "InvokerError", 'Not stateful channel' );
        }

        options = options || {};

        if ( !( 'sendOnBehalfOf' in options ) )
        {
            options.sendOnBehalfOf = false;
        }

        this._executor.ccm().register( as, null, ifacever, this._getPerformRequest(), null, options );
        var _this = this;

        as.add( function( as, info, impl )
        {
            info.secure_channel = _this._executor._is_secure_channel;
            _this._ifaces[ ifacever ] = impl;
        } );
    },

    /**
     * Get previously registered interface on bi-directional channel.
     *
     * NOTE: unlike CCM, there is no point for local alias name as Invoker
     * can have only a single ClientExecutor which can have only a single
     * instance implementing specified iface:version.
     * @param {string} ifacever - standard iface:version notation
     * @returns {NativeIface} - native interface
     * @see AdvancedCCM.iface
     */
    iface : function( ifacever )
    {
        return this._ifaces[ ifacever ];
    },

    /**
     * It is just a subset of *ExecFunc*
     * @private
     * @callback PerformRequestFunc
     * @param {AsyncSteps} as - steps interface
     * @param {ChannelContext} ctx - channel context
     * @param {object} ftmreq - raw FutoIn request
     * @alias perform_request_callback
     */

    /**
     * Returns actual closure for making Server to Client requests
     * @private
     * @returns {PerformRequestFunc} perform request callback
     * @abstract
     */
    _getPerformRequest : function()
    {
        // Implementation should return the following function
        // return function( as, ctx, ftnreq ) {};
        return null;
    },

    /**
     * Cleanup procedure for disposal
     * @private
     */
    _cleanup : function()
    {
        this._executor = null;
        this._ifaces = null;
        this.state = null;
    },
};

ChannelContext.prototype = ChannelContextProto;
module.exports = ChannelContext;
