'use strict';

const PingFace = require( 'futoin-invoker/PingFace' );

/**
 * Implementation of futoin.ping & futoin.anonping interface
 *
 * Designed to be used as imported part of larger interfaces.
 */
class PingService
{
    /**
     * Register futoin.ping interface with Executor
     * @param {AsyncSteps} as - steps interface
     * @param {Executor} executor - executor instance
     */
    static register( as, executor )
    {
        var iface = PingFace.spec( "1.0" );
        var ifacever = iface.iface + ':' + iface.version;
        var impl = new this();

        executor.register( as, ifacever, impl, [ iface ] );
    }

    ping( as, reqinfo )
    {
        reqinfo.result().echo = reqinfo.params().echo;
    }
}

module.exports = PingService;
