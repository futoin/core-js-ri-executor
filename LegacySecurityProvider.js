'use strict';

/**
 * @file
 *
 * Copyright 2014-2018 FutoIn Project (https://futoin.org)
 * Copyright 2014-2018 Andrey Galkin <andrey@futoin.org>
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

const Executor = require( './Executor' );
const RequestInfo = require( './RequestInfo' );
const UserInfo = require( './UserInfo' );
const SecurityProvider = require( './SecurityProvider' );
const Errors = require( 'futoin-asyncsteps/Errors' );

const BasicAuthService = require( './BasicAuthService' );
const BasicAuthFace = require( './BasicAuthFace' );

const STLS_USER_LEN = 22;
const SYM_HMAC_USER = Symbol( 'HMAC_USER' );
const SYM_HMAC_ALGO = Symbol( 'HMAC_ALGO' );

/**
 * This functionality is provided to provide historical not standard BasicAuth
 * interface. Use of this approach is discouraged.
 */
class LegacySecurityProvider extends SecurityProvider {
    /**
     * C-tor
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {AdvancedCCM} ccm - CCM instance
     * @param {SecurityProvider} secprov - optional secprov for chaining
     */
    constructor( as, ccm, secprov=null ) {
        super();

        this._ccm = ccm;
        this._secprov = secprov || new SecurityProvider;

        const ba_executor = new Executor( ccm );
        this._auth_svc = BasicAuthService.register( as, ba_executor );
        BasicAuthFace.register( as, ccm, ba_executor );

        ccm.once( 'close', () => ba_executor.close() );
    }

    /**
     * Register users statically right after registration
     * @param {string} user - user name
     * @param {string} secret - user secret (either password or raw key for HMAC)
     * @param {object} details - user details the way as defined in FTN8
     * @param {boolean=} system_user - is system user
     * @alias BasicAuthService#addUser
     */
    addUser( user, secret, details, system_user=false ) {
        this._auth_svc.addUser( user, secret, details, system_user );
    }

    checkAuth( as, reqinfo, reqmsg, sec ) {
        if ( sec[ 0 ] === '-hmac' ) {
            this._checkMAC( as, reqinfo, {
                user: sec[1],
                algo: sec[2],
                sig: sec[3],
            } );
        // Legacy Basic Auth
        } else if ( ( sec.length === 2 ) &&
                    ( sec[0].length !== STLS_USER_LEN )
        ) {
            this._checkBasicAuth( as, reqinfo, {
                user: sec[0],
                pwd: sec[1],
            } );
        } else {
            this._secprov.checkAuth( as, reqinfo, reqmsg, sec );
        }
    }

    signAuto( as, reqinfo, rspmsg ) {
        if ( reqinfo.info[SYM_HMAC_USER] ) {
            this._signHMAC( as, reqinfo, rspmsg );
            return true;
        }

        return this._secprov.signAuto( as, reqinfo, rspmsg );
    }

    isSigned( reqinfo ) {
        return (
            reqinfo.info[SYM_HMAC_USER] ||
            this._secprov.isSigned( reqinfo )
        );
    }

    _checkBasicAuth( as, reqinfo, { user, pwd } ) {
        // NOTE: legacy mode
        as.add(
            ( as ) => {
                const basicauth = this._ccm.iface( '#basicauth' );
                const reqinfo_info = reqinfo.info;

                if ( reqinfo_info.RAW_REQUEST.obf &&
                     ( reqinfo.info.CHANNEL_CONTEXT.type() === 'INTERNAL' )
                ) {
                    this._stepReqinfoUser( as, reqinfo_info,
                        { seclvl : RequestInfo.SL_SYSTEM } );
                } else {
                    basicauth.call( as, 'auth',
                        {
                            user,
                            pwd,
                            client_addr : reqinfo_info.CLIENT_ADDR.asString(),
                            is_secure : reqinfo_info.SECURE_CHANNEL,
                        } );

                    as.add( ( as, rsp ) => {
                        this._stepReqinfoUser( as, reqinfo_info, rsp );
                    } );
                }
            },
            ( as, err ) => {
                // console.log( err, as.state.error_info );
                // console.log( as.state.last_exception.stack );
                as.error( Errors.SecurityError,
                    "Basic Auth Verification Failed" );
            }
        );
    }

    _checkMAC( as, reqinfo, { user, algo, sig } ) {
        // NOTE: legacy mode
        as.add(
            ( as ) => {
                const basicauth = this._ccm.iface( '#basicauth' );
                const reqinfo_info = reqinfo.info;
                const req = Object.assign( {}, reqinfo.info.RAW_REQUEST );

                basicauth.call( as, 'checkHMAC',
                    {
                        msg : req,
                        user : user,
                        algo : algo,
                        sig : sig,
                        client_addr : reqinfo_info.CLIENT_ADDR.asString(),
                        is_secure : reqinfo_info.SECURE_CHANNEL,
                    } );

                as.add( ( as, rsp ) => {
                    this._stepReqinfoUser( as, reqinfo_info, rsp, '-hmac' );
                    reqinfo_info[SYM_HMAC_ALGO] = algo;
                    reqinfo_info[SYM_HMAC_USER] = user;
                } );
            },
            ( as, err ) => {
                // console.log( err, as.state.error_info );
                // console.log( as.state.last_exception.stack );
                as.error( Errors.SecurityError,
                    "Legacy Signature Verification Failed" );
            }
        );
    }

    _signHMAC( as, reqinfo, rawrsp ) {
        const basicauth = this._ccm.iface( '#basicauth' );
        const reqinfo_info = reqinfo.info;

        basicauth.call( as, 'genHMAC',
            {
                msg : rawrsp,
                user : reqinfo_info[SYM_HMAC_USER],
                algo : reqinfo_info[SYM_HMAC_ALGO],
            } );

        as.add( ( as, { sig } ) => {
            rawrsp.sec = sig;
        } );
    }

    _stepReqinfoUser( as, reqinfo_info, authrsp ) {
        const obf = reqinfo_info.RAW_REQUEST.obf;

        if ( obf && ( authrsp.seclvl === RequestInfo.SL_SYSTEM ) ) {
            reqinfo_info.SECURITY_LEVEL = obf.slvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                null );
        } else {
            reqinfo_info.SECURITY_LEVEL = authrsp.seclvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                authrsp.local_id,
                authrsp.global_id,
                authrsp.details );
        }
    }
}

module.exports = LegacySecurityProvider;
