'use strict';

var invoker = require( 'futoin-invoker' );

/**
 * BasicAuth is not official spec - it is a temporary solution
 * until FTN8 Security Concept is finalized
 */
function BasicAuthFace()
{
    invoker.NativeIface.apply( this, arguments );
}

/**
 * BasicAuth ionterface registration helper
 * @alias BasicAuthFace.register
 */
BasicAuthFace.register = function( as, ccm, endpoint, credentials, options )
{
    var iface = BasicAuthFace.ifacespec;

    options = options || {};
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

module.exports = BasicAuthFace;

/**
 * Embedded spec for FutoIn BasicAuthFace
 * @alias BasicAuthFace.ifacespec
 */
BasicAuthFace.ifacespec =
        {
            "iface" : "futoin.basicauth",
            "version" : "0.1",
            "ftn3rev" : "1.1",
            "funcs" : {
                "auth" : {
                    "params" : {
                        "user" : {
                            "type" : "string",
                            "desc" : "User name"
                        },
                        "pwd" : {
                            "type" : "string",
                            "desc" : "User password"
                        },
                        "client_addr" : {
                            "type" : "string",
                            "desc" : "Client's source address"
                        },
                        "is_secure" : {
                            "type" : "boolean",
                            "desc" : "Is secure channel?"
                        }
                    },
                    "result" : {
                        "local_id" : {
                            "type" : "integer",
                            "desc" : "Local user ID"
                        },
                        "global_id" : {
                            "type" : "string",
                            "desc" : "Global user ID"
                        },
                        "details" : {
                            "type" : "map",
                            "desc" : "User details"
                        }
                    },
                    "throws" : [
                        "AuthenticationFailure"
                    ],
                    "desc" : "Try to authenticate user with provided credentials"
                }
            },
            "requires" : [
                "SecureChannel",
                "AllowAnonymous"
            ],
            "desc" : "Basic Auth interface"
        };