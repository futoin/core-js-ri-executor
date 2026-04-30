"use strict";

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

const _extend = require( 'lodash/extend' );

/**
 * Pseudo-class for documenting UserInfo detail fields as
 * defined in FTN8 spec
 */
const UserInfoConst =
{
    /**
     * Login Name
     * @constant
     * @default
     */
    INFO_Login : "Login",

    /**
     * Nick Name
     * @constant
     * @default
     */
    INFO_Nick : "Nick",

    /**
     * First Name
     * @constant
     * @default
     */
    INFO_FirstName : "FirstName",

    /**
     * Full Name
     * @constant
     * @default
     */
    INFO_FullName : "FullName",

    /**
     * Date if birth in ISO "YYYY-MM-DD" format
     * @constant
     * @default
     */
    INFO_DateOfBirth : "DateOfBirth",

    /**
     * Date if birth in ISO "HH:mm:ss" format, can be truncated to minutes
     * @constant
     * @default
     */
    INFO_TimeOfBirth : "TimeOfBirth",

    /**
     * E-mail for contacts
     * @constant
     * @default
     */
    INFO_ContactEmail : "ContactEmail",

    /**
     * Phone for contacts
     * @constant
     * @default
     */
    INFO_ContactPhone : "ContactPhone",

    /**
     * Home address
     * @constant
     * @default
     */
    INFO_HomeAddress : "HomeAddress",

    /**
     * Work address
     * @constant
     * @default
     */
    INFO_WorkAddress : "WorkAddress",

    /**
     * Citizenship
     * @constant
     * @default
     */
    INFO_Citizenship : "Citizenship",

    /**
     * Country-specific unique registration ID, e,g, SSN, PersonalCode, etc.
     * @constant
     * @default
     */
    INFO_GovernmentRegID : "GovernmentRegID",

    /**
     * URL of avatar image
     * @constant
     * @default
     */
    INFO_AvatarURL : "AvatarURL",
};

/**
 * Class representing user information
 * @param {AdvancedCCM} ccm - reference to CCM
 * @param {number} local_id - local unique ID, integer
 * @param {string} global_id - global unique ID
 * @param {object} details - user info fields, see UserInfoConst
 * @class
 */
class UserInfo {
    constructor( ccm, local_id, global_id, details ) {
        this._ccm = ccm;
        this._local_id = local_id;
        this._global_id = global_id;
        this._details = details;
    }

    /**
     * Get local unique ID
     * @alias UserInfo#localID
     * @returns {number} Local ID, integer
     */
    localID() {
        return this._local_id;
    }

    /**
     * Get local global ID
     * @alias UserInfo#globalID
     * @returns {string} Global ID
     */
    globalID() {
        return this._global_id;
    }

    /**
     * Get user info details
     * @param {AsyncSteps} as - steps interface
     * @param {object=} user_field_identifiers - field list to get
     * @alias UserInfo#details
     * @returns {AsyncSteps} for easy chaining. {object} with details through as.success()
     */
    details( as, user_field_identifiers ) {
        const user_details = this._details;

        if ( user_details ) {
            as.add( ( as ) => as.success( user_details ) );
            return as;
        }

        const basic_auth = this._ccm.iface( '#basicauth' );

        basic_auth.call( as, 'getUserDetails', {
            local_id : this._local_id,
            fields : user_field_identifiers || {},
        } );

        as.add( ( as, rsp ) => {
            const user_details = rsp.details;

            basic_auth._details = user_details;
            as.success( user_details );
        } );

        return as;
    }

    _cleanup() {
        this._ccm = null;
    }
}

_extend( UserInfo, UserInfoConst );
_extend( UserInfo.prototype, UserInfoConst );

module.exports = UserInfo;
