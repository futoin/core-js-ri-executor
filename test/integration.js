"use strict";

require( './prepare' );

const is_in_browser = ( typeof window !== 'undefined' );

const mod = module;
const executor_module = is_in_browser
    ? require( 'futoin-executor' )
    : mod.require( '../lib/main' );

const chai = require( 'chai' );
const { expect, assert } = chai;

const MemoryStream = is_in_browser ? null : mod.require( 'memorystream' );

const invoker_module = require( 'futoin-invoker' );
const async_steps = require( 'futoin-asyncsteps' );

const {
    NodeExecutor,
    BrowserExecutor,
    SecurityProvider,
    LegacySecurityProvider,
} = executor_module;
let _clone = require( 'lodash/clone' );

let thisDir;
let request;
let crypto;

if ( is_in_browser ) {
    thisDir = '.';
} else {
    thisDir = __dirname;

    request = mod.require( 'request' );
    crypto = mod.require( 'crypto' );
}

let ClientExecutor = executor_module.ClientExecutor;
let integration_iface = require( './integration_iface' );
let test_if_anon = integration_iface.test_if_anon;
let test_if_anon_secure = integration_iface.test_if_anon_secure;
let test_if_anon_bidirect = integration_iface.test_if_anon_bidirect;
let interface_impl = integration_iface.interface_impl;

// ---
class TestMasterAuth extends invoker_module.MasterAuth {
    signMessage( ctx, req ) {
        const { macAlgo } = ctx.options;
        const sig = this.genMAC( ctx, req ).toString( 'base64' );
        req.sec = `-mmac:0123456789abcdefghijklm:${macAlgo}:HKDF256:20180101:${sig}`;
    }

    genMAC( ctx, msg ) {
        return invoker_module.SpecTools.genHMAC( {}, ctx.options, msg );
    }
}

// ---
class TestSecurityProvider extends SecurityProvider {
    checkAuth( as, reqinfo, reqmsg, sec ) {
        // FTN8.2: Master MAC
        if ( sec[ 0 ] === '-mmac' ) {
            this._normalizeQueryParams( as, reqinfo );
            this._checkMasterMAC( as, reqinfo, reqmsg, {
                msid: sec[1],
                algo: sec[2],
                kds: sec[3],
                prm: sec[4],
                sig: sec[5],
            } );
        // FTN8.1: Stateless MAC
        } else if ( sec[ 0 ] === '-smac' ) {
            this._normalizeQueryParams( as, reqinfo );
            this._checkStatelessMAC( as, reqinfo, reqmsg, {
                user: sec[1],
                algo: sec[2],
                sig: sec[3],
            } );
        // FTN8.1: Clear secret
        } else if ( sec.length == 2 ) {
            this._checkStatelessClear( as, reqinfo, {
                user: sec[0],
                secret: sec[1],
            } );
        }
    }

    signAuto( as, reqinfo, rspmsg ) {
        if ( reqinfo.info._is_signed ) {
            const base = invoker_module.SpecTools.macBase( rspmsg );
            rspmsg.sec = crypto.createHmac(
                'sha256',
                Buffer.from( '111222333444555666777888999', 'base64' )
            ).update( base ).digest().toString( 'base64' );
            return true;
        }

        return false;
    }

    isSigned( reqinfo ) {
        return reqinfo.info._is_signed;
    }

    _checkStatelessClear( as, reqinfo, { user, secret } ) {
        if ( ( user === '01234567890123456789ab' ) &&
             ( secret === 'pass' )
        ) {
            this._setUser( as, reqinfo, 'SafeOps', {
                local_id: '01234567890123456789ab',
                global_id: 'user@example.com',
            } );
        } else {
            as.error(
                'SecurityError',
                'Stateless Clear Verification Failed' );
        }
    }

    _checkStatelessMAC( as, reqinfo, rawreq, { sig } ) {
        const base = invoker_module.SpecTools.macBase( rawreq );
        const reqsig = crypto.createHmac(
            'sha256',
            Buffer.from( '111222333444555666777888999', 'base64' )
        ).update( base ).digest();
        sig = Buffer.from( sig, 'base64' );

        if ( invoker_module.SpecTools.secureEqualBuffer( sig, reqsig ) ) {
            reqinfo.info._is_signed = 'stls';
            this._setUser( as, reqinfo, 'PrivilegedOps', {
                local_id: '01234567890123456789ab',
                global_id: 'user@example.com',
            } );
        } else {
            as.error(
                'SecurityError',
                'Stateless MAC Verification Failed' );
        }
    }

    _checkMasterMAC( as, reqinfo, rawreq, { sig } ) {
        const base = invoker_module.SpecTools.macBase( rawreq );
        const reqsig = crypto.createHmac(
            'sha256',
            Buffer.from( '111222333444555666777888999', 'base64' )
        ).update( base ).digest();
        sig = Buffer.from( sig, 'base64' );

        if ( invoker_module.SpecTools.secureEqualBuffer( sig, reqsig ) ) {
            reqinfo.info._is_signed = 'master';
            this._setUser( as, reqinfo, 'PrivilegedOps', {
                local_id: '01234567890123456789ab',
                global_id: 'user@example.com',
            } );
        } else {
            as.error(
                'SecurityError',
                'Master MAC Verification Failed' );
        }
    }
}

// ---
let model_as = async_steps();

model_as.add(
    function( as ) {
        const opts = {};
        // ---

        opts.callTimeoutMS = 1e3;
        opts.specDirs = [
            thisDir + '/specs',
            test_if_anon,
            test_if_anon_bidirect,
            test_if_anon_secure,
        ];

        let internal_test = ( as.state.proto === 'internal' );
        let node_test = NodeExecutor && !internal_test;

        let end_point = '';
        let secend_point;
        let secopts;

        if ( internal_test ) {
            // configure later
        } else if ( node_test ) {
            opts.httpAddr = 'localhost';
            opts.httpPort = '1080';
            opts.httpPath = '/ftn';

            secopts = _clone( opts );

            end_point = as.state.proto +
                "://" + opts.httpAddr +
                ":" + opts.httpPort +
                opts.httpPath;

            secopts.httpPort = '1081';

            secend_point = "secure+" + as.state.proto +
                "://" + secopts.httpAddr +
                ":" + secopts.httpPort +
                secopts.httpPath;
        } else {
            end_point = "browser://server_frame";
            secend_point = end_point;
        }

        let state = as.state;

        state.ccm_msgs = [];
        state.exec_msgs = [];

        opts.messageSniffer = function( info, msg ) {
            state.ccm_msgs.push( msg );
        };


        const ccm = new as.state.CCMImpl( opts );
        as.state.ccm = ccm;
        const executor_ccm = new invoker_module.AdvancedCCM( opts );
        as.state.executor_ccm = executor_ccm;
        let anon_iface;
        let bidirect_iface;
        let anonsec_iface;

        ccm.limitZone( 'default', { rate: 0xFFFF } );
        executor_ccm.limitZone( 'default', { rate: 0xFFFF } );

        let is_bidirect = internal_test || ( end_point.match( /^(ws|browser)/ ) !== null );

        let execopts = _clone( opts );

        execopts.messageSniffer = function( src, msg ) {
            state.exec_msgs.push( msg );
        };
        execopts.cleanupConnMS = 10;

        // ---
        const legacy_secprov = new LegacySecurityProvider( as, executor_ccm, new TestSecurityProvider );
        legacy_secprov.addUser( 'user', 'pass' );
        legacy_secprov.addUser( 'hmacuser', 'MyLongLongSecretKey' );
        legacy_secprov.addUser( 'system', 'pass', {}, true );

        execopts.securityProvider = legacy_secprov;
        // ---

        if ( node_test ) {
            secopts.messageSniffer = execopts.messageSniffer;
        }

        function set_step( s ) {
            // console.log( 'Step: ' + s );
            as.state.step = s;
        }

        as.add( function( as ) {
            if ( !node_test ) return;

            let executor = new NodeExecutor( executor_ccm, execopts );

            as.state.executor = executor;

            executor.on( 'notExpected', function( err, error_info ) {
                console.log( "NotExpected: " + err + " " + error_info );
            } );

            as.setTimeout( execopts.callTimeoutMS );
            executor.on( 'ready', function() {
                as.success();
            } );
        } ).add( function( as ) {
            if ( !node_test ) return;

            let secexecutor = new NodeExecutor( executor_ccm, secopts );

            as.state.secexecutor = secexecutor;

            secexecutor.on( 'notExpected', function( err, error_info ) {
                console.log( "NotExpected: " + err + " " + error_info );
            } );

            as.setTimeout( execopts.callTimeoutMS );
            secexecutor.on( 'ready', function() {
                as.success();
            } );
        } ).add( function( as ) {
            if ( !internal_test ) return;

            let executor = new executor_module.Executor( executor_ccm, execopts );

            as.state.executor = executor;
            as.state.secexecutor = executor;
            end_point = executor;
            secend_point = executor;
        } ).add( function( as ) {
            let p = as.parallel();

            if ( node_test || internal_test ) {
                p.add( function( as ) {
                    as.state.executor.register( as, 'test.int.anon:1.0', interface_impl );
                } ).add( function( as ) {
                    as.state.executor.register( as, 'test.int.bidirect:1.0', interface_impl );
                } ).add( function( as ) {
                    as.state.secexecutor.register( as, 'test.int.anonsec:1.0', interface_impl );
                } );
            }

            let clientExecutor = new ClientExecutor( ccm, opts );

            as.state.clientExecutor = clientExecutor;
            clientExecutor.on( 'notExpected', function( err, error_info ) {
                console.log( 'Not Expected: ' + err, error_info );
                console.log( state.last_exception.stack );
            } );

            p.add( function( as ) {
                clientExecutor.register( as, 'test.int.bidirect:1.0', {
                    clientCallback : function( as, reqinfo ) {
                        try {
                            expect( reqinfo.info.RAW_REQUEST ).not.have.property( 'sec' );
                            return { a: 'ClientResult' };
                        } catch ( e ) {
                            as.error( 'InternalError', e.message );
                        }
                    },
                } );
            } ).add( function( as ) {
                ccm.register(
                    as,
                    'test_if_anon',
                    'test.int.anon:1.0',
                    end_point,
                    as.state.creds,
                    {
                        hmacKey: 'TXlMb25nTG9uZ1NlY3JldEtleQ==',
                        macKey: '111222333444555666777888999',
                        masterAuth: new TestMasterAuth(),
                    }
                );
                executor_ccm.register(
                    as,
                    'subcall',
                    'test.int.anon:1.0',
                    end_point,
                    'system:pass'
                );
            } ).add( function( as ) {
                as.add(
                    function( as ) {
                        ccm.register(
                            as,
                            'test_if_bidirect',
                            'test.int.bidirect:1.0',
                            end_point,
                            null, {
                                executor : clientExecutor,
                            } );

                        as.add( function( as ) {
                            if ( as.state.CCMImpl === invoker_module.AdvancedCCM ) {
                                expect( is_bidirect ).be.true;
                            }
                        } );
                    },
                    function( as, err ) {
                        if ( !is_bidirect ) {
                            expect( err ).equal( 'InvokerError' );
                            expect( as.state.error_info ).equal( "BiDirectChannel is required" );
                            as.success();
                        }
                    }
                );
            } ).add( function( as ) {
                if ( node_test ) {
                    ccm.register( as, 'test_if_anonsec', 'test.int.anonsec:1.0', secend_point );
                } else {
                    ccm.register( as, 'test_if_anonsec', 'test.int.anonsec:1.0', secend_point, null, { targetOrigin: 'http://localhost:8000' } );
                }
            } );
        } ).add( function( as ) {
            anon_iface = ccm.iface( 'test_if_anon' );
            anonsec_iface = ccm.iface( 'test_if_anonsec' );

            if ( is_bidirect ) {
                bidirect_iface = ccm.iface( 'test_if_bidirect' );
            }
            // ---
        } ).add( function( as ) {
            set_step( "regular" );
            anon_iface.call( as, 'regular', {
                b : true,
                s : 'Value',
                n : 123.456,
                i : 123456,
                m : { field : 'value' },
                a : [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ],
            } );
        } ).add( function( as, res ) {
            expect( res.rb ).be.true;
            expect( res.rs ).equal( 'Value' );
            expect( res.rn ).equal( 123.456 );
            expect( res.ri ).equal( 123456 );
            expect( res.rm ).eql( { field : 'value' } );
            expect( res.ra ).eql( [ true, 'value', 123.456, 123456, { field : 'value' }, [ 1, 2, 3 ] ] );
            // ---
        } ).add( function( as ) {
            set_step( "noResult" );
            anon_iface.call( as, 'noResult', {
                a : "param",
            } );
        } ).add( function( as, res ) {
            if ( res !== undefined ) {
                expect( res ).be.empty;
            }
            // ---
        } ).add( function( as ) {
            set_step( "customResult" );
            anon_iface.call( as, 'customResult' );
        } ).add( function( as, res ) {
            expect( res ).be.true;
            // ---
        } ).add( function( as ) {
            set_step( "noParams" );
            anon_iface.call( as, 'noParams' );
        } ).add( function( as, res ) {
            expect( res.a ).equal( 'test' );
            // ---
        } ).add( function( as ) {
            if ( is_in_browser ) {
                as.success( { a : 'test' } );
                return;
            }

            set_step( "testAuth" );
            anon_iface.call( as, 'testAuth' );
        } ).add( function( as, res ) {
            expect( res.a ).equal( 'test' );
            // ---
        } ).add( function( as ) {
            set_step( "rawUpload" );

            if ( is_in_browser || internal_test ) {
                as.success( { a: 'TestUpload' } );
                return;
            }

            anon_iface.call( as, 'rawUpload', null, 'TestUpload' );
        } ).add( function( as, res ) {
            expect( res.a ).equal( 'TestUpload' );
            // ---
        } ).add( function( as ) {
            set_step( "rawUpload + buffer" );

            if ( is_in_browser || internal_test ) {
                as.success( { a: 'TestUploadBuffer' } );
                return;
            }

            let upload_data = new Buffer( 'TestUploadBuffer' );

            anon_iface.call( as, 'rawUpload', null, upload_data );
        } ).add( function( as, res ) {
            expect( res.a ).equal( 'TestUploadBuffer' );
            // ---
        } ).add( function( as ) {
            set_step( "rawUpload + stream" );

            if ( is_in_browser || internal_test ) {
                as.success( { a: 'TestUploadStreamЯ' } );
                return;
            }

            let upload_data = new MemoryStream();

            upload_data.lengthInBytes = Buffer.byteLength( 'TestUploadStreamЯ', 'utf8' );
            let orig_pipe = upload_data.pipe;

            upload_data.pipe = function( dst, opts ) {
                orig_pipe.call( this, dst, opts );
                // a dirty hack
                this.write( 'TestUploadStreamЯ', 'utf8' );
                this.end();
            };

            anon_iface.call( as, 'rawUpload', null, upload_data );
        } ).add( function( as, res ) {
            expect( res.a ).equal( 'TestUploadStreamЯ' );
            // ---
        } ).add( function( as ) {
            set_step( "rawResult" );

            if ( is_in_browser|| internal_test ) return;

            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawResult', { a: 'TestDownloadЯ' }, null, as.state.membuf );
        } ).add( function( as, res ) {
            if ( is_in_browser|| internal_test ) return;

            expect( as.state.membuf.toString() ).equal( 'TestDownloadЯ' );
            // ---
        } ).add( function( as ) {
            if ( is_in_browser || internal_test ) {
                as.success( 'TestDownloadЯ' );
            } else if ( anon_iface._raw_info.funcs['rawResult'] ||
                 ( as.state.proto === 'http' ) ||
                 ( as.state.proto === 'https' ) ) {
                set_step( "rawResult + stream" );
                anon_iface.call( as, 'rawResult', { a: 'TestDownloadЯ' } );
            } else {
                console.log( 'WARNING: known issue with SimpleCCM + raw result' );
                as.success( 'TestDownloadЯ' );
            }
        } ).add( function( as, res ) {
            expect( res.toString() ).equal( 'TestDownloadЯ' );
            // ---
        } ).add( function( as ) {
            set_step( "rawUploadResult" );

            if ( is_in_browser || internal_test ) return;

            let upload_data = new Buffer( 'TestUploadBuffer' );

            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call( as, 'rawUploadResult', null, upload_data, as.state.membuf );
        } ).add( function( as ) {
            if ( is_in_browser || internal_test ) return;

            expect( as.state.membuf.toString() ).equal( 'TestUploadBuffer' );
            // ---
        } ).add( function( as ) {
            set_step( "rawUploadResultParams" );

            if ( is_in_browser || internal_test ) return;

            let upload_data = new Buffer( 'TestUploadBuffer' );

            as.state.membuf = new MemoryStream( null, { readable : false } );
            anon_iface.call(
                as,
                'rawUploadResultParams',
                {
                    a : 'start{',
                    e : '}end',
                    c : 1,
                    o : { a : '123' },
                },
                upload_data,
                as.state.membuf
            );
        } ).add( function( as ) {
            if ( is_in_browser || internal_test ) return;

            expect( as.state.membuf.toString() ).equal( 'start{TestUploadBuffer}end' );
            // ---
        } ).add(
            function( as ) {
                if ( !is_bidirect ) {
                    as.success( { a : 'OK' } );
                    return;
                }

                set_step( "testBiDirect" );
                bidirect_iface.call( as, 'testBiDirect' );
            },
            function( as, err ) {
                if ( as.state.proto === 'http' ) {
                    expect( err ).equal( 'InvalidRequest' );
                    expect( as.state.error_info ).equal( "Bi-Direct Channel is required" );
                    as.success( { a: 'OK' } );
                }
            }
        ).add( function( as, res ) {
            expect( res.a ).equal( 'OK' );
        // --
        } ).add(
            function( as ) {
                set_step( "cancelAfterTimeout" );
                anon_iface.call( as, 'cancelAfterTimeout' );
            },
            function( as, err ) {
                expect( err ).equal( 'InternalError' );
                as.success( 'OK' );
            }
        ).add( function( as, res ) {
            expect( res ).equal( 'OK' );
        // --
        } ).add(
            function( as ) {
                if ( !is_bidirect ) {
                    as.success( { a : 'ClientResult' } );
                    return;
                }

                set_step( "clientCallback" );
                bidirect_iface.call( as, 'clientCallback' );
            }
        ).add( function( as, res ) {
            expect( res.a ).equal( 'ClientResult' );
        // --
        } ).add(
            function( as ) {
                set_step( 'testHTTPheader' );
                anon_iface.call( as, 'testHTTPheader' );
            }
        ).add(
            function( as, res ) {
                expect( res.r ).equal( as.state.proto.match( /^http/ ) ? 'OK' : 'IGNORE' );
            }
        // --
        ).add(
            function( as ) {
                set_step( 'testOnBehalfOf' );
                anon_iface.call( as, 'testOnBehalfOf' );
            }
        ).add(
            function( as, res ) {
                expect( res.r ).equal( 'OK' );
            }
        // --
        ).add(
            function( as ) {
                set_step( 'testSecLevel' );

                if ( ( as.state.proto === 'internal' ) &&
                     !as.state.creds
                ) {
                    as.success( 'ReauthOK' );
                } else {
                    anon_iface.call( as, 'testSecLevel' );
                }
            },
            function( as, err ) {
                expect( err ).equal( 'PleaseReauth' );
                expect( as.state.error_info.split( ' ' )[0] ).equal( 'ExceptionalOps' );
                as.success( 'ReauthOK' );
            }
        ).add(
            function( as, res ) {
                expect( res ).equal( 'ReauthOK' );
            }
        // --
        ).add(
            function( as, ok ) {
                set_step( 'clientTimeout' );
                anon_iface.call( as, 'clientTimeout', null, null, null, 1 );
            },
            function( as, err ) {
                expect( err ).equal( 'Timeout' );
                assert.equal( undefined, as.state.error_info );
                as.success();
            }
        ).add(
            function( as ) {
                set_step( 'serverError' );
                anon_iface.call( as, 'serverError', {
                    a : 'ValidError',
                } );
            },
            function( as, err ) {
                expect( err ).equal( 'ValidError' );
                assert.equal( undefined, as.state.error_info );
                as.success();
            }
        ).add(
            function( as ) {
                set_step( 'serverError - invalid' );
                anon_iface.call( as, 'serverError', {
                    a : 'InvalidError',
                } );
            },
            function( as, err ) {
                expect( err ).equal( 'InternalError' );
                expect( as.state.error_info ).equal( 'Not expected error' );
                as.success();
            }
        ).add( function( as ) {
            if ( node_test ) {
                // console.dir(  as.state.ccm_msgs );
                // console.dir(  as.state.exec_msgs );

                let diff = as.state.exec_msgs.length - as.state.ccm_msgs.length;

                // One message difference for client timeout test is possible
                if ( diff < 0 || diff > 1 ) {
                    expect( as.state.ccm_msgs.length ).equal( as.state.exec_msgs.length );
                }
            }
        } ).add( function( as ) {
            if ( !node_test ) return;

            as.add( function( as ) {
                as.setTimeout( 1e3 );

                request( {
                    method: 'POST',
                    url: 'http://localhost:1080/ftn',
                    body: 'some invalid message',
                }, function( e, r, b ) {
                    if ( !e && r.statusCode == 200 ) {
                        as.success( b );
                    } else {
                        try {
                            as.error( e );
                        } catch ( e ) {
                            // pass
                        }
                    }
                } );
            } );
            as.add( function( as, res ) {
                expect( res ).equal( '{"e":"InvalidRequest","edesc":"Missing req.f"}' );
            } );
        } );
    },
    function( as, err ) {
        console.log( as.state.last_exception.stack );
        as.success( new Error( "" + err + ": " + as.state.error_info + " @ " + as.state.step ) );
    }
).add(
    function( as, err ) {
        if ( as.state.executor ) {
            as.state.executor.close();
            as.state.secexecutor.close();
            as.state.executor_ccm.close();
            as.state.ccm.close();
        }

        as.state.done( err );
    },
    function( as, err ) {
        console.log( as.state.last_exception.stack );
        as.state.done( new Error( "" + err + ": " + as.state.error_info + " @ shutdown" ) );
    }
);

// ---
describe( 'Integration', function() {
    if ( is_in_browser ) {
        it( 'should pass Browser suite SimpleCCM', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.SimpleCCM;
            as.state.done = done;
            as.state.proto = 'browser';
            as.state.creds = null;
            as.execute();
        } );

        it( 'should pass Browser suite AdvancedCCM', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'browser';
            as.state.creds = null;
            as.execute();
        } );
    } else {
        it( 'should pass HTTP suite SimpleCCM with Stateless Clear', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.SimpleCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = '01234567890123456789ab:pass';
            as.execute();
        } );

        it( 'should pass WS suite SimpleCCM with Stateless Clear', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.SimpleCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = '01234567890123456789ab:pass';
            as.execute();
        } );

        it( 'should pass HTTP suite AdvancedCCM with Stateless Clear', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = '01234567890123456789ab:pass';
            as.execute();
        } );

        it( 'should pass WS suite AdvancedCCM with Stateless Clear', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = '01234567890123456789ab:pass';
            as.execute();
        } );

        it( 'should pass HTTP suite AdvancedCCM with Stateless MAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = '-smac:0123456789ABCDEFGHIJKLM';
            as.execute();
        } );

        it( 'should pass HTTP suite AdvancedCCM with Stateless MAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = '-smac:0123456789ABCDEFGHIJKLM';
            as.execute();
        } );

        it( 'should pass WS suite AdvancedCCM with Master MAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = 'master';
            as.execute();
        } );

        it( 'should pass WS suite AdvancedCCM with Master MAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = 'master';
            as.execute();
        } );
        it( 'should pass HTTP suite AdvancedCCM with legacy Basic Auth', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = 'user:pass';
            as.execute();
        } );

        it( 'should pass WS suite AdvancedCCM with legacy Basic Auth', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = 'user:pass';
            as.execute();
        } );

        it( 'should pass HTTP suite AdvancedCCM with legacy HMAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'http';
            as.state.creds = '-hmac:hmacuser';
            as.execute();
        } );

        it( 'should pass WS suite AdvancedCCM with legacy HMAC', function( done ) {
            let as = async_steps();

            as.copyFrom( model_as );
            as.state.CCMImpl = invoker_module.AdvancedCCM;
            as.state.done = done;
            as.state.proto = 'ws';
            as.state.creds = '-hmac:hmacuser';
            as.execute();
        } );
    }

    it( 'should pass INTERNAL suite SimpleCCM', function( done ) {
        this.timeout( 5e3 );
        let as = async_steps();

        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.state.creds = null;
        as.execute();
    } );

    it( 'should pass INTERNAL suite AdvancedCCM', function( done ) {
        this.timeout( 5e3 );
        let as = async_steps();

        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.state.creds = null;
        as.execute();
    } );

    it( 'should pass INTERNAL suite SimpleCCM with basic auth', function( done ) {
        this.timeout( 5e3 );
        let as = async_steps();

        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.SimpleCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.state.creds = 'user:pass';
        as.execute();
    } );

    it( 'should pass INTERNAL suite AdvancedCCM with basic auth', function( done ) {
        this.timeout( 5e3 );
        let as = async_steps();

        as.copyFrom( model_as );
        as.state.CCMImpl = invoker_module.AdvancedCCM;
        as.state.done = done;
        as.state.proto = 'internal';
        as.state.creds = 'user:pass';
        as.execute();
    } );
} );
