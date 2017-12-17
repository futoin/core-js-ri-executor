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

const BasicAuthFace = require( './BasicAuthFace' );
const { SpecTools } = require( 'futoin-invoker' );

/**
 * BasicService is not official spec - it is a temporary solution
 * until FTN8 Security Concept is finalized
 */
class BasicAuthService {
    constructor() {
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
    static register( as, executor ) {
        const iface = BasicAuthFace.spec( "0.1" );
        const ifacever = iface.iface + ':' + iface.version;
        const impl = new this();

        executor.register( as, ifacever, impl, [ iface ] );

        // a quick hack
        return impl;
    }

    /**
     * Register users statically right after registration
     * @param {string} user - user name
     * @param {string} secret - user secret (either password or raw key for HMAC)
     * @param {object} details - user details the way as defined in FTN8
     * @param {boolean=} system_user - is system user
     * @alias BasicAuthService#addUser
     */
    addUser( user, secret, details, system_user ) {
        const next_id = this._next_id++;

        details = details || {};
        details.Login = user; // yes, side-effect

        const user_reg =
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
    }

    /**
     * Get by name. Override, if needed.
     * @param {AsyncSteps} as - steps interface
     * @param {string} user - user name
     * @note as result: {object} user object or null (through as)
     */
    _getUser( as, user ) {
        const u = this._user_list[ user ];

        as.add( ( as ) => as.success( u ) );
    }

    /**
     * Get by ID. Override, if needed.
     * @param {AsyncSteps} as - steps interfaces
     * @param {number} local_id - local ID
     * @note as result: {object} user object or null (through as)
     */
    _getUserByID( as, local_id ) {
        const u = this._user_ids[ local_id ];

        as.add( ( as ) => as.success( u ) );
    }

    auth( as, reqinfo ) {
        const p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( ( as, u ) => {
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
    }

    checkHMAC( as, reqinfo ) {
        const p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( ( as, u ) => {
            if ( u ) {
                const algo = SpecTools.getRawAlgo( as, p.algo );
                const sig = SpecTools.genHMACRaw( algo, u.secret, p.msg );
                const msg_sig = new Buffer( p.sig, 'base64' );

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
    }

    genHMAC( as, reqinfo ) {
        const p = reqinfo.params();

        this._getUser( as, p.user );

        as.add( ( as, u ) => {
            if ( u ) {
                const algo = SpecTools.getRawAlgo( as, p.algo );
                const sig = SpecTools.genHMACRaw( algo, u.secret, p.msg );

                reqinfo.result().sig = sig.toString( 'base64' );
                return;
            }

            as.error( 'InvalidUser' );
        } );
    }

    getUserDetails( as, reqinfo ) {
        const p = reqinfo.params();

        this._getUserByID( as, p.local_id );

        as.add( ( as, u ) => {
            if ( u ) {
                reqinfo.result().details = u.info.details;
                return;
            }

            as.error( 'InvalidUser' );
        } );
    }
}

module.exports = BasicAuthService;
