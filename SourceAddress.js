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

/**
 * Source Address representation
 * @param {string} type - Type of address
 * @param {string=} host - machine address, if applicable
 * @param {integer|string=} port - port or path, if applicable
 * @class
 */
class SourceAddress {
    constructor( type, host, port ) {
        if ( type === null ) {
            if ( typeof host !== 'string' ) {
                type = "LOCAL";
            } else if ( host.match( /^([0-9]{1,3}\.){3}[0-9]{1,3}$/ ) ) {
                type = "IPv4";
            } else {
                type = "IPv6";
            }
        }

        this.type = type;
        this.host = host;
        this.port = port;
    }

    /**
     * Host field
     * @alias SourceAddress#host
     * @member {string}
     */

    /**
     * Port field
     * @alias SourceAddress#port
     * @member {integer}
     */

    /**
     * Type field
     * @alias SourceAddress#type
     * @member {string}
     */

    /**
     * Get a stable string representation
     * @returns {string} string representation
     * @alias SourceAddress#asString
     */
    asString() {
        if ( this.type === "LOCAL" ) {
            return `LOCAL:${this.port}`;
        } else if ( this.type === "IPv6" ) {
            return `IPv6:[${this.host}]:${this.port}`;
        } else {
            return `${this.type}:${this.host}:${this.port}`;
        }
    }
}

module.exports = SourceAddress;
