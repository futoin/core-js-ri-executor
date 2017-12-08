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

const PingFace = require( 'futoin-invoker/PingFace' );

/**
 * Implementation of futoin.ping & futoin.anonping interface
 *
 * Designed to be used as imported part of larger interfaces.
 */
class PingService {
    /**
     * Register futoin.ping interface with Executor
     * @param {AsyncSteps} as - steps interface
     * @param {Executor} executor - executor instance
     */
    static register( as, executor ) {
        var iface = PingFace.spec( "1.0" );
        var ifacever = iface.iface + ':' + iface.version;
        var impl = new this();

        executor.register( as, ifacever, impl, [ iface ] );
    }

    ping( as, reqinfo ) {
        reqinfo.result().echo = reqinfo.params().echo;
    }
}

module.exports = PingService;
