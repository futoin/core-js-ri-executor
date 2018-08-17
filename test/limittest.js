'use strict';

require( './prepare' );

const $as = require( 'futoin-asyncsteps' );
const {
    AdvancedCCM,
    PingFace,
} = require( 'futoin-invoker' );


const is_browser = ( typeof window !== 'undefined' );
const mod = module;
const executor_module = is_browser
    ? require( 'futoin-executor' )
    : mod.require( '../lib/main' );

const {
    NodeExecutor,
    PingService,
    LegacySecurityProvider,
} = executor_module;

const request = require( 'request' );

const expect = require( 'chai' ).expect;

describe( 'Request Limiter', function() {
    let as;
    let ccm;
    let executor;
    let impl;

    const CONN_LIMIT = 8;
    const CUSTOM_CONN_LIMIT = 6;
    const REQ_LIMIT = 10;
    const PERIOD_MS = 300;

    const make_ping = ( done, headers={} ) => {
        return request( {
            method: 'POST',
            url: 'http://127.0.0.1:8123/',
            body: JSON.stringify( {
                f: 'futoin.ping:1.0:ping',
                p: { echo : 1 },
                sec: 'user:pass',
            } ),
            headers,
        }, function( e, r, b ) {
            if ( e || r.statusCode !== 200 ) {
                console.log( e );
                console.log( b );
                done( e || 'Fail' );
            } else {
                // console.log( b );
            }
        } );
    };

    beforeEach( function() {
        as = $as();

        as.add(
            ( as ) => {
                class DelayedPingService extends PingService {
                    constructor( ...args ) {
                        super( ...args );
                        this._curr = 0;
                        this._max = 0;
                        this._total = 0;
                    }

                    ping( as, reqinfo ) {
                        as.add( ( as ) => super.ping( as, reqinfo ) );
                        as.add( ( as ) => {
                            this._total += 1;
                            this._curr += 1;
                            this._max = Math.max( this._max, this._curr );

                            as.setCancel( ( as ) => {
                                this._curr -= 1;
                            } );

                            $as.ActiveAsyncTool.callLater( () => {
                                this._curr -= 1;
                                as.state && as.success();
                            }, PERIOD_MS );
                        } );
                    }
                }

                ccm = new AdvancedCCM();
                // ---

                const legacy_secprov = new LegacySecurityProvider( as, ccm );
                legacy_secprov.addUser( 'user', 'pass' );

                // ---

                executor = new NodeExecutor( ccm, {
                    securityProvider: legacy_secprov,
                    httpPort : 8123,
                    enableLimiter: true,
                    trustProxy: true,
                    cleanupLimitsMS: PERIOD_MS / 2,
                    limitConf: {
                        default: {
                            period_ms: PERIOD_MS,
                        },
                        group: {
                            concurrent: CUSTOM_CONN_LIMIT,
                            period_ms: PERIOD_MS,
                            v4scope: 24,
                        },
                    },
                    addressLimitMap: {
                        group: [
                            '1.2.3.4/15',
                        ],
                        blacklist: [
                            '128.0.0.0/8',
                            '192.168.0.0/16',
                        ],
                    },
                } );
                impl = DelayedPingService.register( as, executor );
            },
            ( as, err ) => {
                console.log( err, as.state.error_info );
                console.log( as.state.last_exception );
            }
        );
    } );

    afterEach( function( done ) {
        this.timeout( 10e3 );
        ccm.close();
        as.cancel();
        executor.close( () => done() );
    } );

    it ( 'should process requests with limits', ( done ) => {
        as.add(
            ( as ) => {
                const total = CONN_LIMIT * 2;

                for ( let i = 0; i < total; ++i ) make_ping( done );

                as.waitExternal();

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._total ).to.equal( CONN_LIMIT );
                        expect( impl._max ).to.equal( CONN_LIMIT );
                    } catch ( e ) {
                        if ( as.state ) {
                            as.state.last_exception = e;
                            as._root._handle_error( 'Fail' );
                        }
                    }
                }, PERIOD_MS / 2 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._total ).to.equal( total );
                        expect( impl._max ).to.equal( CONN_LIMIT );

                        if ( as.state ) as.success();
                    } catch ( e ) {
                        if ( as.state ) {
                            as.state.last_exception = e;
                            as._root._handle_error( 'Fail' );
                        }
                    }
                }, PERIOD_MS * 1.5 );
            },
            ( as, err ) => {
                console.log( `${err}:${as.state.error_info}` );
                done( as.state.last_exception || 'Fail' );
            }
        );
        as.add( ( as ) => done() );
        as.execute();
    } );

    it ( 'should process requests with separate limits', ( done ) => {
        as.add(
            ( as ) => {
                const total = CONN_LIMIT * 2;

                for ( let i = 0; i < total; ++i ) {
                    // first limit
                    make_ping( done, {
                        'X-Real-IP' : '10.1.1.1',
                    } );

                    // second shared limit
                    make_ping( done, {
                        'X-Real-IP' : '10.1.2.1',
                    } );
                    make_ping( done, {
                        'X-Forwarded-For' : '10.1.2.2',
                    } );
                }

                as.waitExternal();

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._total ).to.equal( CONN_LIMIT * 2 );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 );

                        const first_lim = executor._scope2lim.get( '10.1.1.0' );
                        const second_lim = executor._scope2lim.get( '10.1.2.0' );
                        expect( first_lim._throttle._queue.length ).to.equal( 0 );
                        expect( second_lim._throttle._queue.length ).to.equal( 0 );
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 0.5 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._total ).to.equal( CONN_LIMIT * 4 );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 );

                        const first_lim = executor._scope2lim.get( '10.1.1.0' );
                        const second_lim = executor._scope2lim.get( '10.1.2.0' );
                        expect( first_lim._throttle._queue.length ).to.equal( 0 );
                        expect( second_lim._throttle._queue.length ).to.equal( 0 );
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 1.5 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        const second_lim = executor._scope2lim.get( '10.1.2.0' );
                        expect( second_lim._throttle._queue.length ).to.equal( 0 );

                        expect( impl._total ).to.equal( CONN_LIMIT * 5 );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 );
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 2.5 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        const second_lim = executor._scope2lim.get( '10.1.2.0' );
                        expect( second_lim._throttle._queue.length ).to.equal( 0 );

                        expect( impl._total ).to.equal( CONN_LIMIT * 6 );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 );

                        if ( as.state ) as.success();
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 3.5 );
            },
            ( as, err ) => {
                console.log( `${err}:${as.state.error_info}` );
                done( as.state.last_exception || 'Fail' );
            }
        );
        as.add( ( as ) => done() );
        as.execute();
    } );

    it ( 'should process requests with custom limits', ( done ) => {
        as.add(
            ( as ) => {
                executor.limitsIPSet.add( '10.1.2.2/32', 'group' );

                const total = CONN_LIMIT * 2;

                for ( let i = 0; i < total; ++i ) {
                    // first limit
                    make_ping( done, {
                        'X-Real-IP' : '10.1.1.1',
                    } );

                    // second shared limit
                    make_ping( done, {
                        'X-Real-IP' : '10.1.2.1',
                    } );

                    // custom limit
                    make_ping( done, {
                        'X-Forwarded-For' : '10.1.2.2',
                    } );
                }

                as.waitExternal();

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        // must be equal
                        expect( executor._host2lim.get( '10.1.2.2' ) )
                            .to.equal( executor._scope2lim.get( '10.1.2.0:group' ) );

                        expect( impl._total ).to.equal( CONN_LIMIT * 2 + CUSTOM_CONN_LIMIT );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 + CUSTOM_CONN_LIMIT );

                        const first_lim = executor._scope2lim.get( '10.1.1.0' );
                        const second_lim = executor._scope2lim.get( '10.1.2.0' );
                        expect( first_lim._throttle._queue.length ).to.equal( 0 );
                        expect( second_lim._throttle._queue.length ).to.equal( 0 );
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 0.5 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 + CUSTOM_CONN_LIMIT );
                        expect( impl._total ).to.equal( CONN_LIMIT * 4 + CUSTOM_CONN_LIMIT * 2 );
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 1.5 );

                $as.ActiveAsyncTool.callLater( () => {
                    try {
                        expect( impl._total ).to.equal( CONN_LIMIT * 4 +
                            ( CUSTOM_CONN_LIMIT * 2 + total % CUSTOM_CONN_LIMIT ) );
                        expect( impl._max ).to.equal( CONN_LIMIT * 2 + CUSTOM_CONN_LIMIT );

                        if ( as.state ) as.success();
                    } catch ( e ) {
                        console.log( e );
                        done( e );
                    }
                }, PERIOD_MS * 3 );
            },
            ( as, err ) => {
                console.log( `${err}:${as.state.error_info}` );
                done( as.state.last_exception || 'Fail' );
            }
        );
        as.add( ( as ) => done() );
        as.execute();
    } );
} );
