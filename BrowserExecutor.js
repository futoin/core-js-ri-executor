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

const _zipObject = require( 'lodash/zipObject' );
const _defaults = require( 'lodash/defaults' );
const async_steps = require( 'futoin-asyncsteps' );
const performance_now = require( "performance-now" );
const browser_window = window;

const Executor = require( './Executor' );
const ChannelContext = require( './ChannelContext' );
const SourceAddress = require( './SourceAddress' );
const RequestInfo = require( './RequestInfo' );

/**
 * Browser Channel Context
 * @ignore
 * @param {BrowserExecutor} executor - _
 * @param {object} event - browser event
 */
class BrowserChannelContext extends ChannelContext {
    constructor( executor, event ) {
        super( executor );

        this._event_origin = event.origin;
        this._event_source = event.source;
        this._last_used = performance_now();
        this._is_secure_channel = true;
    }

    type() {
        return "BROWSER";
    }

    isStateful() {
        return true;
    }

    _getPerformRequest() {
        const evt_origin = this._event_origin;
        const evt_source = this._event_source;
        const revreq = this._executor._reverse_requests;
        const sniffer = this._executor._msg_sniffer;

        return ( as, ctx, ftnreq ) => {
            as.add( ( as ) => {
                const rid = 'S' + revreq.rid++;

                ftnreq.rid = rid;

                //
                if ( ctx.expect_response ) {
                    const sentreqs = revreq.sentreqs;

                    sentreqs[ rid ] = {
                        reqas : as,
                        evt_origin : evt_origin,
                        evt_source : evt_source,
                    };

                    as.setCancel( ( as ) => {
                        delete sentreqs[ rid ];
                    } );
                }

                //
                sniffer( evt_origin, ftnreq, false );
                evt_source.postMessage( ftnreq, evt_origin );
            } );
        };
    }
}

/**
 * Pseudo-class for BrowserExecutor options documentation
 * @class
 * @extends ExecutorOptions
 */
const BrowserExecutorOptions =
{
    /**
     * Client timeout MS
     * @default
     */
    clientTimeoutMS : 600,

    /**
     * List of allowed page origins for incoming connections.
     * It is MANDATORY for security reasons.
     *
     * Example:
     * * 'http://localhost:8000'
     * * 'http://example.com'
     * @default
     */
    allowedOrigins : [],
};

/**
 * Browser Executor with HTML5 Web Messaging as incoming transport.
 *
 * It allows communication across open pages (frames/tabs/windows) inside client browser.
 * @param {AdvancedCCM} ccm - CCM ref
 * @param {BrowserExecutorOptions} opts - executor options
 * @class
 */
class BrowserExecutor extends Executor {
    constructor( ccm, opts ) {
        super( ccm, opts );

        opts = opts || {};
        _defaults( opts, BrowserExecutorOptions );

        this._msg_sniffer = opts.messageSniffer;
        this._contexts = [];
        this._reverse_requests = {
            rid : 1,
            sentreqs : {},
        };

        // --
        let allowed_origins = opts.allowedOrigins || {};

        if ( allowed_origins instanceof Array ) {
            allowed_origins = _zipObject( allowed_origins, allowed_origins );
        }

        this.allowed_origins = allowed_origins;

        // --
        const client_timeout = opts.clientTimeoutMS;

        const connection_cleanup = () => {
            const ctx_list = this._contexts;
            const remove_time = performance_now() - client_timeout;

            for ( let i = ctx_list.length - 1; i >= 0; --i ) {
                const ctx = ctx_list[ i ];

                if ( ctx._last_used < remove_time ) {
                    ctx._cleanup();
                    ctx_list.splice( i, 1 );
                }
            }

            setTimeout( connection_cleanup, client_timeout * 1e3 );
        };

        connection_cleanup();

        // --
        this._event_listener = ( event ) => this.handleMessage( event );

        browser_window.addEventListener( 'message', this._event_listener );
    }

    handleMessage( event ) {
        this._msg_sniffer( event, event.data, true );

        const ftnreq = event.data;
        const source = event.source;
        const origin = event.origin;

        // Not valid request
        // ---
        if ( ( typeof ftnreq !== 'object' ) ||
            !( 'rid' in ftnreq ) ) {
            return;
        }

        const rid = ftnreq.rid;

        // Handle response to server-initiated request
        // ---
        if ( !( 'f' in ftnreq ) && ( rid.charAt( 0 ) === 'S' ) ) {
            const sentreqs = this._reverse_requests.sentreqs;
            const sreq = sentreqs[ rid ];

            if ( sreq &&
                ( source === sreq.evt_source ) &&
                ( origin === sreq.evt_origin )
            ) {
                sreq.reqas.success( ftnreq, 'application/futoin+json' );
                delete sentreqs[ rid ];
            }

            if ( event.stopPropagation ) {
                event.stopPropagation();
            }

            return;
        }

        // ---
        if ( !( 'f' in ftnreq ) ||
             ( rid.charAt( 0 ) !== 'C' ) ||
             !( origin in this.allowed_origins )
        ) {
            // ignore, not client request
            return;
        }

        let context = null;
        const ctx_list = this._contexts;

        for ( let i = 0, c = ctx_list.length; i < c; ++i ) {
            const ctx = ctx_list[ i ];

            if ( ( ctx._event_source === source ) &&
                 ( ctx._event_origin === origin )
            ) {
                context = ctx;
                break;
            }
        }

        if ( context ) {
            context._last_used = performance_now();
        } else {
            context = new BrowserChannelContext( this, event );
            ctx_list.push( context );
        }

        // ---
        const source_addr = new SourceAddress(
            'LOCAL',
            source,
            origin
        );

        // ---
        const reqinfo = new RequestInfo( this, ftnreq );

        const reqinfo_info = reqinfo.info;

        reqinfo_info.CHANNEL_CONTEXT = context;
        reqinfo_info.CLIENT_ADDR = source_addr;
        reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;

        const as = async_steps();

        as.state.reqinfo = reqinfo;

        reqinfo._as = as;

        const cancel_req = ( as ) => {
            reqinfo._cleanup();

            const ftnrsp = {
                e : 'InternalError',
                rid : rid,
            };

            this._msg_sniffer( event, ftnrsp, false );
            context._event_source.postMessage( ftnrsp, context._event_origin );
        };

        as.add( ( as ) => {
            as.setCancel( cancel_req );
            this.process( as );

            as.add( ( as ) => {
                const ftnrsp = reqinfo_info.RAW_RESPONSE;

                reqinfo._cleanup();

                if ( ftnrsp !== null ) {
                    this._msg_sniffer( event, ftnrsp, false );
                    context._event_source.postMessage( ftnrsp, context._event_origin );
                }
            } );
        } );
        as.execute();

        if ( event.stopPropagation ) {
            event.stopPropagation();
        }
    }

    close( close_cb ) {
        browser_window.removeEventListener( 'message', this._event_listener );
        super.close( close_cb );
    }

    /**
    * Current list of allowed origins for modifications. Please note that
    * it is an object, where field is actual origin and value must evaluate
    * to true.
    * @alias BrowserExecutor.allowed_origins
    * @member {object}
    */
}

module.exports = BrowserExecutor;
