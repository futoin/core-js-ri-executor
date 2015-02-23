'use strict';

var _extend = require( 'lodash/object/extend' );
var BasicAuthFace = require( './BasicAuthFace' );
var SpecTools = require( 'futoin-invoker' ).SpecTools;

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

        this._user_list[ user ] =
        {
            pass : pass,
            info : {
                local_id : next_id,
                global_id : 'G' + next_id,
                details : details || {}
            }
        };
    },

    auth : function( as, reqinfo )
    {
        var p = reqinfo.params();
        var u = this._user_list[ p.user ];

        // Vulnerable to time attacks
        if ( u && ( u.pass === p.pwd ) )
        {
            as.success( u.info );
        }
        else
        {
            as.error( 'AuthenticationFailure' );
        }
    },

    checkHMAC : function( as, reqinfo )
    {
        var p = reqinfo.params();
        var u = this._user_list[ p.user ];

        if ( u )
        {
            var algo = SpecTools.getRawAlgo( as, p.algo );
            var sig = SpecTools.genHMACRaw( algo, u.pass, p.msg );
            var msg_sig = new Buffer( p.sig, 'base64' );

            if ( SpecTools.checkHMAC( sig, msg_sig ) )
            {
                as.success( u.info );
                return;
            }
        }

        as.error( 'AuthenticationFailure' );
    },

    genHMAC : function( as, reqinfo )
    {
        var p = reqinfo.params();
        var u = this._user_list[ p.user ];

        if ( u )
        {
            var algo = SpecTools.getRawAlgo( as, p.algo );
            var sig = SpecTools.genHMACRaw( algo, u.pass, p.msg );
            reqinfo.result().sig = sig.toString( 'base64' );
            return;
        }

        as.error( 'InvalidUser' );
    }
};

module.exports = BasicAuthService;
