"use strict";

var _ = require( 'lodash' );
var invoker = require( 'futoin-invoker' );
var FutoInError = invoker.FutoInError;

var executor_const =
{
    OPT_VAULT : "vault",
    OPT_SPEC_DIRS : 'specdirs',
    OPT_PROD_MODE : 'prodmode'
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
        
        if ( ( iface in this._ifaces ) &&
             ( mjr in this._ifaces[iface] ) )
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
        
        spectools.loadSpec( as, info, this._specdirs );
        
        if ( !( iface in this._ifaces ) )
        {
            this._ifaces[ iface ] = {};
            this._impls[ iface ] = {};
        }
        
        this._ifaces[ iface ][ mjrver ] = info;
        this._impls[ iface ][ mjrver ] = impl;
        
        for ( var i = 0; i < info.inherits.length; ++i )
        {
            var m = ifacever.match( invoker.SpecTools._ifacever_pattern );
            var supiface = m[1];
            var supmjrmnr = m[4];
            var supmjr = m[5];
            var supmnr = m[6];
            
            var info =
            {
                iface : supiface,
                version : supmjrmnr,
                mjrver : supmjr,
                mnrver : supmnr
            };
            
            if ( ( supiface in this._ifaces ) &&
                ( supmjr in this._ifaces[supiface] ) )
            {
                delete this._ifaces[ iface ][ mjrver ];
                as.error( FutoInError.InternalError, "Conflict with inherited interfaces" );
            }

            this._ifaces[ supiface ][ supmjr ] = info;
        }
    },
    
    process : function( as )
    {},

    checkAccess : function( as, acd )
    {
        as.error( FutoInError.NotImplemented, "Access Control is not supported yet" );
    },

    initFromCache : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    },

    cacheInit : function( as )
    {
        as.error( FutoInError.NotImplemented, "Caching is not supported yet" );
    }
};

_.extend( executor, executor_const );
_.extend( executor.prototype, executor_const );
exports = module.exports = executor;
