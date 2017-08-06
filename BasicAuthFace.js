'use strict';

var NativeIface = require( 'futoin-invoker/NativeIface' );

/**
 * BasicAuth is not official spec - it is a temporary solution
 * until FTN8 Security Concept is finalized
 */
function BasicAuthFace()
{
    NativeIface.apply( this, arguments );
}

/**
 * BasicAuth interface registration helper
 * @param {AsyncSteps} as - step interface
 * @param {AdvancedCCM} ccm - CCM instance
 * @param {string} endpoint - endpoint URL
 * @param {*} [credentials=null] - see CCM register()
 * @param {object} [options={}] - registration options
 * @param {string} [options.version=1.0] - iface version
 * @alias BasicAuthFace.register
 */
BasicAuthFace.register = function( as, ccm, endpoint, credentials, options )
{
    options = options || {};
    var ifacever = options.version || '1.0';
    var iface = this.spec( ifacever );

    options.nativeImpl = this;
    options.specDirs = [ iface ];

    ccm.register(
        as,
        '#basicauth',
        iface.iface + ':' + iface.version,
        endpoint,
        credentials,
        options
    );
};

BasicAuthFace.prototype = NativeIface.prototype;
module.exports = BasicAuthFace;
BasicAuthFace.spec = NativeIface.spec;

var specs = {};

BasicAuthFace._specs = specs;

/**
 * Embedded spec for FutoIn BasicAuthFace
 * @ignore
 */
specs['1.0'] =
        {
            iface : "futoin.basicauth",
            version : "0.1",
            ftn3rev : "1.1",
            funcs : {
                auth : {
                    params : {
                        user : {
                            type : "string",
                            desc : "User name",
                        },
                        pwd : {
                            type : "string",
                            desc : "User password",
                        },
                        client_addr : {
                            type : "string",
                            desc : "Client's source address",
                        },
                        is_secure : {
                            type : "boolean",
                            desc : "Is secure channel?",
                        },
                    },
                    result : {
                        local_id : {
                            type : "integer",
                            desc : "Local user ID",
                        },
                        global_id : {
                            type : "string",
                            desc : "Global user ID",
                        },
                        details : {
                            type : "map",
                            desc : "User details",
                        },
                        seclvl : {
                            type : "string",
                            desc : "Security level",
                        },
                    },
                    throws : [ "AuthenticationFailure" ],
                    desc : "Try to authenticate user with provided credentials",
                },
                checkHMAC : {
                    params : {
                        msg : {
                            type : "map",
                            desc : "Message object",
                        },
                        user : {
                            type : "string",
                            desc : "User name",
                        },
                        algo : {
                            type : "string",
                            desc : "HMAC algorithm",
                        },
                        sig : {
                            type : "string",
                            desc : "Request signature",
                        },
                        client_addr : {
                            type : "string",
                            desc : "Client's source address",
                        },
                        is_secure : {
                            type : "boolean",
                            desc : "Is secure channel?",
                        },
                    },
                    result : {
                        local_id : {
                            type : "integer",
                            desc : "Local user ID",
                        },
                        global_id : {
                            type : "string",
                            desc : "Global user ID",
                        },
                        details : {
                            type : "map",
                            desc : "User details",
                        },
                        seclvl : {
                            type : "string",
                            desc : "Security level",
                        },
                    },
                    throws : [ "AuthenticationFailure" ],
                    desc : "Try to authenticate user with provided credentials",
                },
                genHMAC : {
                    params : {
                        msg : {
                            type : "map",
                            desc : "Message object",
                        },
                        user : {
                            type : "string",
                            desc : "User name",
                        },
                        algo : {
                            type : "string",
                            desc : "HMAC algorithm",
                        },
                    },
                    result : {
                        sig : {
                            type : "string",
                            desc : "Global user ID",
                        },
                    },
                    throws : [ "InvalidUser" ],
                    desc : "Try to authenticate user with provided credentials",
                },
                getUserDetails : {
                    params : {
                        local_id : {
                            type : "integer",
                            desc : "Local user ID",
                        },
                        fields : {
                            type : "map",
                            default : {},
                            desc : "List of field to retrieve, default - all",
                        },
                    },
                    result : {
                        details : {
                            type : "map",
                            desc : "User details",
                        },
                    },
                    throws : [ "InvalidUser" ],
                    desc : "Try to authenticate user with provided credentials",
                },
            },
            requires : [ "SecureChannel", "AllowAnonymous" ],
            desc : "Basic Auth interface",
        };
