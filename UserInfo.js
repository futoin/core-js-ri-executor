"use strict";

var _extend = require( 'lodash/object/extend' );

// ---
var userinfo_const =
{
    INFO_FirstName : "FirstName",
    INFO_FullName : "FullName",
    /** ISO "YYYY-MM-DD" format */
    INFO_DateOfBirth : "DateOfBirth",
    /** ISO "HH:mm:ss" format, can be truncated to minutes */
    INFO_TimeOfBirth : "TimeOfBirth",
    INFO_ContactEmail : "ContactEmail",
    INFO_ContactPhone : "ContactPhone",
    INFO_HomeAddress : "HomeAddress",
    INFO_WorkAddress : "WorkAddress",
    INFO_Citizenship : "Citizenship",
    INFO_GovernmentRegID : "GovernmentRegID",
    INFO_AvatarURL : "AvatarURL"
};

var UserInfo = function( ccm, local_id, global_id, details )
{
    this._ccm = ccm;
    this._local_id = local_id;
    this._global_id = global_id;
    this._details = details;
};

_extend( UserInfo, userinfo_const );

var UserInfoProto = userinfo_const; // optimize

UserInfoProto.localID = function()
{
    return this._local_id;
};

UserInfoProto.globalID = function()
{
    return this._global_id;
};

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

    as.error( 'NotImplemented' );
    void user_field_identifiers;
};

UserInfo.prototype = UserInfoProto;
module.exports = UserInfo;
