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
const Errors = require( 'futoin-asyncsteps/Errors' );

/**
 * Base interface to interact with FTN8 Security Concept implementation.
 */
class SecurityProvider {
    checkAuth( as, reqinfo, reqmsg, sec ) {
        // FTN8.2: Master MAC
        if ( sec[ 0 ] === '-mmac' ) {
            this._checkMasterMAC( as, reqinfo, reqmsg, {
                msid: sec[1],
                algo: sec[2],
                kds: sec[3],
                prm: sec[4],
                sig: sec[5],
            } );
        // FTN8.1: Stateless MAC
        } else if ( sec[ 0 ] === '-smac' ) {
            this._checkStatelessMAC( as, reqinfo, reqmsg, {
                user: sec[1],
                algo: sec[2],
                sig: sec[3],
            } );
        // FTN8.1: Clear secret
        } else if ( sec.length == 2 ) {
            this._checkStatelessClear( as, reqinfo, {
                user: sec[0],
                secret: sec[1],
            } );
        }
    }

    signAuto( as, _reqinfo, _rspmsg ) {
        return false;
    }

    isSigned( _reqinfo ) {
        return false;
    }

    checkAccess( as, _reqinfo, _acd ) {
        as.error( Errors.NotImplemented, "Access Control is not supported yet" );
    }

    _checkStatelessClear( as, _reqinfo, _sec ) {
        as.error( Errors.SecurityError,
            'Not Implemented Stateless Clear' );
    }

    _checkStatelessMAC( as, _reqinfo, _reqmsg, _sec ) {
        as.error( Errors.SecurityError,
            'Not Implemented Stateless MAC' );
    }

    _checkMasterMAC( as, _reqinfo, _reqmsg, _sec ) {
        as.error( Errors.SecurityError,
            'Not Implemented Master MAC' );
    }

    _stepReqinfoUser( as, reqinfo, seclvl, { local_id, global_id } ) {
        const reqinfo_info = reqinfo.info;
        const obf = reqinfo_info.RAW_REQUEST.obf;

        if ( obf && ( seclvl === RequestInfo.SL_SYSTEM ) ) {
            reqinfo_info.SECURITY_LEVEL = obf.slvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                obf.lid,
                obf.gid,
                null );
        } else {
            reqinfo_info.SECURITY_LEVEL = seclvl;
            reqinfo_info.USER_INFO = new UserInfo(
                this._ccm,
                local_id,
                global_id,
                null );
        }
    }
}

module.exports = SecurityProvider;
