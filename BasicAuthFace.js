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

const { NativeIface } = require( 'futoin-invoker' );

/**
 * BasicAuth is not official spec - it is a temporary solution
 * until FTN8 Security Concept is finalized
 */
class BasicAuthFace extends NativeIface {
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
    static register( as, ccm, endpoint, credentials, options ) {
        options = options || {};
        const ifacever = options.version || '0.1';
        const iface = this.spec( ifacever );

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
    }
}

module.exports = BasicAuthFace;

const specs = BasicAuthFace._specs = {};

/**
 * Embedded spec for FutoIn BasicAuthFace
 * @ignore
 */
specs['0.1'] =
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
