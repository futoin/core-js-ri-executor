"use strict";

// ---
var SourceAddress = function( type, host, port )
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

SourceAddress.prototype =
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

module.exports = SourceAddress;
