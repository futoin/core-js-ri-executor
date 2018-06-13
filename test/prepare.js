'use strict';

if ( typeof window === 'undefined' ) {
    module.require( 'tough-cookie' );
    module.require( 'borc' );
    module.require( 'msgpack-lite' );
    module.require( 'memorystream' );

    module.require( 'futoin-invoker/node_modules/tough-cookie' );
    module.require( 'futoin-invoker/node_modules/borc' );
    module.require( 'futoin-invoker/node_modules/msgpack-lite' );

    Object.freeze( Object.prototype );
}
