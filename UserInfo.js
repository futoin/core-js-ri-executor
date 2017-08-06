"use strict";

var _extend = require( 'lodash/extend' );

/**
 * Pseudo-class for documenting UserInfo detail fields as
 * defined in FTN8 spec
 */
var UserInfoConst =
{
    /**
     * Login Name
     * @const
     * @default
     */
    INFO_Login : "Login",

    /**
     * Nick Name
     * @const
     * @default
     */
    INFO_Nick : "Nick",

    /**
     * First Name
     * @const
     * @default
     */
    INFO_FirstName : "FirstName",

    /**
     * Full Name
     * @const
     * @default
     */
    INFO_FullName : "FullName",

    /**
     * Date if birth in ISO "YYYY-MM-DD" format
     * @const
     * @default
     */
    INFO_DateOfBirth : "DateOfBirth",

    /**
     * Date if birth in ISO "HH:mm:ss" format, can be truncated to minutes
     * @const
     * @default
     */
    INFO_TimeOfBirth : "TimeOfBirth",

    /**
     * E-mail for contacts
     * @const
     * @default
     */
    INFO_ContactEmail : "ContactEmail",

    /**
     * Phone for contacts
     * @const
     * @default
     */
    INFO_ContactPhone : "ContactPhone",

    /**
     * Home address
     * @const
     * @default
     */
    INFO_HomeAddress : "HomeAddress",

    /**
     * Work address
     * @const
     * @default
     */
    INFO_WorkAddress : "WorkAddress",

    /**
     * Citizenship
     * @const
     * @default
     */
    INFO_Citizenship : "Citizenship",

    /**
     * Country-specific unique registration ID, e,g, SSN, PersonalCode, etc.
     * @const
     * @default
     */
    INFO_GovernmentRegID : "GovernmentRegID",

    /**
     * URL of avatar image
     * @const
     * @default
     */
    INFO_AvatarURL : "AvatarURL",
};

/**
 * Class representing user information
 * @param {AdvancedCCM} ccm - reference to CCM
 * @param {integer} local_id - local unique ID
 * @param {string} global_id - global unique ID
 * @param {object} details - user info fields, see UserInfoConst
 * @class
 */
var UserInfo = function( ccm, local_id, global_id, details )
{
    this._ccm = ccm;
    this._local_id = local_id;
    this._global_id = global_id;
    this._details = details;
};

_extend( UserInfo, UserInfoConst );

var UserInfoProto = UserInfoConst; // optimize

UserInfoProto._ccm = null;
UserInfoProto._local_id = null;
UserInfoProto._global_id = null;
UserInfoProto._details = null;

/**
 * Get local unique ID
 * @alias UserInfo#localID
 * @returns {integer} Local ID
 */
UserInfoProto.localID = function()
{
    return this._local_id;
};

/**
 * Get local global ID
 * @alias UserInfo#globalID
 * @returns {string} Global ID
 */
UserInfoProto.globalID = function()
{
    return this._global_id;
};

/**
 * Get user info details
 * @param {AsyncSteps} as - steps interface
 * @param {object=} user_field_identifiers - field list to get
 * @alias UserInfo#details
 * @returns {AsyncSteps} for easy chaining. {object} with details through as.success()
 */
UserInfoProto.details = function( as, user_field_identifiers )
{
    var user_details = this._details;

    if ( user_details )
    {
        as.add( function( as )
        {
            as.success( user_details );
        } );
        return;
    }

    var basic_auth = this._ccm.iface( '#basicauth' );

    basic_auth.call( as, 'getUserDetails', {
        local_id : this._local_id,
        fields : user_field_identifiers || {},
    } );

    as.add( function( as, rsp )
    {
        var user_details = rsp.details;

        basic_auth._details = user_details;
        as.success( user_details );
    } );

    return as;
};

UserInfoProto._cleanup = function()
{
    this._ccm = null;
};

UserInfo.prototype = UserInfoProto;
module.exports = UserInfo;
