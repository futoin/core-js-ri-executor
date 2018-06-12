'use strict';

/**
 * @file
 *
 * Copyright 2018 FutoIn Project (https://futoin.org)
 * Copyright 2018 Andrey Galkin <andrey@futoin.org>
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

const RequestInfo = require( './RequestInfo' );
const UserInfo = require( './UserInfo' );
const { NotImplemented } = require( 'futoin-asyncsteps' ).Errors;
const { normalizeURLParams } = require( 'futoin-invoker' ).SpecTools;

/**
 * Generic security provider interface
 */
class SecurityProvider {
    /**
     * Check request authentication.
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {RequestInfo} reqinfo - extended request info
     * @param {object} reqmsg - request message as is
     * @param {array} sec - reqmsg.sec field split by ':'
     */
    checkAuth( as, reqinfo, reqmsg, sec ) {
        as.error( NotImplemented,
            "Authentication is not enabled" );
        void reqinfo;
        void reqmsg;
        void sec;
    }

    /**
     * Check if response signature is required and perform signing.
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {RequestInfo} reqinfo - extended request info
     * @param {object} rspmsg - response message as is
     * @returns {boolean} true, if signature is set
     */
    signAuto( as, reqinfo, rspmsg ) {
        void reqinfo;
        void rspmsg;
        return false;
    }

    /**
     * Check if request is signed as in MessageSignature constraint.
     * @param {RequestInfo} reqinfo - extended request info
     * @returns {boolean} true, if signed
     */
    isSigned( reqinfo ) {
        void reqinfo;
        return false;
    }

    /**
     * Check access through Access Control concept
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {RequestInfo} reqinfo - extended request info
     * @param {string|array} acd - access control descriptor
     */
    checkAccess( as, reqinfo, acd ) {
        as.error( NotImplemented,
            "Access Control is not enabled" );
        void reqinfo;
        void acd;
    }

    /**
     * A special helper to set authenticated user info
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {RequestInfo} reqinfo - extended request info
     * @param {string} seclvl - security level
     * @param {object} auth_info - authentication info
     * @param {integer|string} auth_info.local_id - Local User ID
     * @param {string} auth_info.global_id - Global User ID
     * @param {object} [auth_info.details=null] - user details
     */
    _setUser( as, reqinfo, seclvl, { local_id, global_id, details = null } ) {
        const reqinfo_info = reqinfo.info;
        const obf = reqinfo_info.RAW_REQUEST.obf;

        if ( obf && seclvl && ( seclvl === RequestInfo.SL_SYSTEM ) ) {
            reqinfo_info.SECURITY_LEVEL = obf.slvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                details );
        } else {
            reqinfo_info.SECURITY_LEVEL = seclvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                local_id,
                global_id,
                details );
        }
    }

    /**
     * Normalize parameters passed through HTTP query.
     * It's important to call this before MAC checking.
     * @param {AsyncSteps} as - AsyncSteps interface
     * @param {RequestInfo} reqinfo - extended request info
     */
    _normalizeQueryParams( as, reqinfo ) {
        const reqinfo_info = reqinfo.info;

        if ( reqinfo_info._from_query_string ) {
            try {
                reqinfo.executor()._getInfo( as, reqinfo );
            } catch ( _ ) {
                // prevent exposing any data to non-authenticated user.
                return;
            }

            const iface_info = reqinfo_info._iface_info;
            const func = reqinfo_info._func;
            const rawreq = reqinfo_info.RAW_REQUEST;

            normalizeURLParams( iface_info, func, rawreq );
            reqinfo_info._from_query_string = false;
        }
    }
}

module.exports = SecurityProvider;
