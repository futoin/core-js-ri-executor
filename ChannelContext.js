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
 * Channel Context normally accessible through RequestInfo object.
 * @param {Executor} executor - reference to associated executor
 * @class
 */
class ChannelContext {
    constructor( executor ) {
        this._executor = executor;
        this._ifaces = {};

        this.state = function() {
            return this.state;
        };
    }

    /**
     * Persistent storage for arbitrary user variables.
     * Please make sure variable names a prefixed.
     *
     * NOTE: context.state === context.state()
     * @alias ChannelContext.state
     * @returns {object} this.state
     */

    /**
     * Get type of channel
     *
     * Standard values: HTTP, WS, BROWSER, TCP, UDP, UNIX
     *
     * @returns {string} arbitrary string, see FTN6
     * @abstract
     */
    type() {
        return null;
    }

    /**
     * Check if transport is stateful (e.g. WebSockets)
     *
     * @returns {Boolean} true, if context object is persistent across
     * requests in the same session
     */
    isStateful() {
        return false;
    }

    /**
     * Set invoker abort handler.
     *
     * @note It should be possible to call multiple times setting
     *       multiple callbacks.
     * @note The callback is set for lifetime of the channel - do not use it on every
     *       request!
     * @param {Function} callable - callback
     * @param {any=} user_data - optional parameter to pass to callable
     */
    onInvokerAbort( callable, user_data ) {
        void callable;
        void user_data;
    }

    /**
     * Get native input stream
     * @private
     * @returns {object} raw input stream
     */
    _openRawInput() {
        return null;
    }

    /**
     * Get native output stream
     * @private
     * @returns {object} raw output stream
     */
    _openRawOutput() {
        return null;
    }

    /**
     * Register Invoker interface on bi-directional channels to make
     * calls from Server to Client.
     * @param {AsyncSteps} as - steps interface
     * @param {string} ifacever - standard iface:version notation
     * @param {object} options - standard Invoker options
     * @see AdvancedCCM.register
     */
    register( as, ifacever, options ) {
        if ( !this.isStateful() ) {
            as.error( "InvokerError", 'Not stateful channel' );
        }

        options = options || {};

        if ( !( 'sendOnBehalfOf' in options ) ) {
            options.sendOnBehalfOf = false;
        }

        if ( !( 'limitZone' in options ) ) {
            options.limitZone = 'unlimited';
        }

        if ( !( 'secureChannel' in options ) ) {
            options.secureChannel = this._executor._is_secure_channel;
        }

        this._executor.ccm().register( as, null, ifacever, this._getPerformRequest(), null, options );

        as.add( ( as, _, impl ) => {
            this._ifaces[ ifacever ] = impl;
        } );
    }

    /**
     * Get previously registered interface on bi-directional channel.
     *
     * NOTE: unlike CCM, there is no point for local alias name as Invoker
     * can have only a single ClientExecutor which can have only a single
     * instance implementing specified iface:version.
     * @param {string} ifacever - standard iface:version notation
     * @returns {NativeIface} - native interface
     * @see AdvancedCCM.iface
     */
    iface( ifacever ) {
        return this._ifaces[ ifacever ];
    }

    /**
     * It is just a subset of *ExecFunc*
     * @private
     * @callback PerformRequestFunc
     * @param {AsyncSteps} as - steps interface
     * @param {ChannelContext} ctx - channel context
     * @param {object} ftmreq - raw FutoIn request
     * @alias perform_request_callback
     */

    /**
     * Returns actual closure for making Server to Client requests
     * @private
     * @returns {PerformRequestFunc} perform request callback
     * @abstract
     */
    _getPerformRequest() {
        // Implementation should return the following function
        // return function( as, ctx, ftnreq ) {};
        return null;
    }

    /**
     * Cleanup procedure for disposal
     * @private
     */
    _cleanup() {
        this._executor = null;
        this._ifaces = null;
        this.state = null;
    }
}

module.exports = ChannelContext;
