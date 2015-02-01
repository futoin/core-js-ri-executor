'use strict';

var _extend = require( 'lodash/object/extend' );
var BasicAuthFace = require( './BasicAuthFace' );

function BasicAuthService()
{
    _extend( this, BasicAuthServiceProto );
    this._user_list = {};
    this._next_id = 1;
}

BasicAuthService.register = function( as, executor )
{
    var iface = BasicAuthFace.ifacespec;
    var ifacever = iface.iface + ':' + iface.version;
    var impl = new this();
    executor.register( as, ifacever, impl, [ iface ] );

    // a quick hack
    return impl;
};

var BasicAuthServiceProto =
{
    addUser : function( user, pass, details )
    {
        var next_id = this._next_id++;

        this._user_list[ user + ':' + pass ] =
        {
            local_id : next_id,
            global_id : 'G' + next_id,
            details : details || {}
        };
    },

    auth : function( as, reqinfo )
    {
        var p = reqinfo.params();
        var u = this._user_list[ p.user + ':' + p.pwd ];

        if ( u )
        {
            as.success( u );
        }
        else
        {
            as.error( 'AuthenticationFailure' );
        }
    }
};

module.exports = BasicAuthService;
