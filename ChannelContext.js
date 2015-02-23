"use strict";

// ---
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

ChannelContext.prototype = ChannelContextProto;
module.exports = ChannelContext;
