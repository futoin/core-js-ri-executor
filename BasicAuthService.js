'use strict';

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

var BasicAuthFace = require( './BasicAuthFace' );
var SpecTools = require( 'futoin-invoker/SpecTools' );

/**
 * BasicService is not official spec - it is a temporary solution
 * until FTN8 Security Concept is finalized
 */
function BasicAuthService() {
    this._user_list = {};
    this._user_ids = {};
    this._next_id = 1;
}

/**
 * BasicAuthService registration helper
 * @param {AsyncSteps} as - steps interface
 * @param {Executor} executor - executor instance
 * @alias BasicAuthService.register
 * @returns {BasicAuthService} reference to implementation instance (to register users)
 */
BasicAuthService.register = function( as, executor ) {
    var iface = BasicAuthFace.spec( "0.1" );
    var ifacever = iface.iface + ':' + iface.version;
    var impl = new this();

    executor.register( as, ifacever, impl, [ iface ] );

    // a quick hack
    return impl;
};

BasicAuthService.prototype =
{
    /**
     * Register users statically right after registration
     * @param {string} user - user name
     * @param {string} secret - user secret (either password or raw key for HMAC)
     * @param {object} details - user details the way as defined in FTN8
     * @param {boolean=} system_user - is system user
     * @alias BasicAuthService#addUser
     */
    addUser : function( user, secret, details, system_user ) {
        var next_id = this._next_id++;

        details = details || {};
        details.Login = user; // yes, side-effect

        var user_reg =
        {
            secret : secret,
            info : {
                local_id : next_id,
                global_id : 'G' + next_id,
                details : details,
            },
            system_user : system_user || false,
        };

        this._user_list[ user ] = user_reg;
        this._user_ids[ next_id ] = user_reg;
    },

    /**
     * Get by name. Override, if needed.
     * @param {AsyncSteps} as - steps interface
     * @param {string} user - user name
     * @note as result: {object} user object or null (through as)
     */
    _getUser : function( as, user ) {
        var u = this._user_list[ user ];

        as.add( function( as ) {
            as.success( u );
        } );
    },

    /**
     * Get by ID. Override, if needed.
     * @param {AsyncSteps} as - steps interfaces
     * @param {number} local_id - local ID
     * @note as result: {object} user object or null (through as)
     */
    _getUserByID : function( as, local_id ) {
        var u = this._user_ids[ local_id ];

        as.add( function( as ) {
            as.success( u );
        } );
    },

    auth : function( as, reqinfo ) {
        var p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( function( as, u ) {
            // Vulnerable to time attacks
            if ( u &&
                 ( u.secret === p.pwd ) ) {
                reqinfo.result().seclvl = u.system_user ?
                    reqinfo.SL_SYSTEM :
                    reqinfo.SL_SAFE_OPS;
                as.success( u.info );
            } else {
                as.error( 'AuthenticationFailure' );
            }
        } );
    },

    checkHMAC : function( as, reqinfo ) {
        var p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( function( as, u ) {
            if ( u ) {
                var algo = SpecTools.getRawAlgo( as, p.algo );
                var sig = SpecTools.genHMACRaw( algo, u.secret, p.msg );
                var msg_sig = new Buffer( p.sig, 'base64' );

                if ( SpecTools.checkHMAC( sig, msg_sig ) ) {
                    reqinfo.result().seclvl = u.system_user ?
                        reqinfo.SL_SYSTEM :
                        reqinfo.SL_PRIVILEGED_OPS;
                    as.success( u.info );
                    return;
                }
            }

            as.error( 'AuthenticationFailure' );
        } );
    },

    genHMAC : function( as, reqinfo ) {
        var p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( function( as, u ) {
            if ( u ) {
                var algo = SpecTools.getRawAlgo( as, p.algo );
                var sig = SpecTools.genHMACRaw( algo, u.secret, p.msg );

                reqinfo.result().sig = sig.toString( 'base64' );
                return;
            }

            as.error( 'InvalidUser' );
        } );
    },

    getUserDetails : function( as, reqinfo ) {
        var p = reqinfo.params();

        this._getUserByID( as, p.local_id );

        as.add( function( as, u ) {
            if ( u ) {
                reqinfo.result().details = u.info.details;
                return;
            }

            as.error( 'InvalidUser' );
        } );
    },
};

module.exports = BasicAuthService;
