(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            'futoin-asyncsteps',
            'futoin-invoker'
        ], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('futoin-asyncsteps'), require('futoin-invoker'));
    } else {
        this.FutoInExecutor = factory($as, FutoInInvoker);
    }
}(function (__external_$as, __external_FutoInInvoker) {
    var global = this, define;
    function _require(id) {
        var module = _require.cache[id];
        if (!module) {
            var exports = {};
            module = _require.cache[id] = {
                id: id,
                exports: exports
            };
            _require.modules[id].call(exports, module, exports);
        }
        return module.exports;
    }
    _require.cache = [];
    _require.modules = [
        function (module, exports) {
            'use strict';
            var _clone = _require(49);
            var _zipObject = _require(27);
            var _defaults = _require(55);
            var async_steps = _require(25);
            var performance_now = _require(63);
            var browser_window = window;
            var Executor = _require(3);
            var ChannelContext = _require(1);
            var SourceAddress = _require(5);
            var RequestInfo = _require(4);
            var BrowserChannelContext = function (executor, event) {
                ChannelContext.call(this, executor);
                this._event_origin = event.origin;
                this._event_source = event.source;
                this._last_used = performance_now();
                this._is_secure_channel = true;
            };
            var BrowserChannelContextProto = _clone(ChannelContext.prototype);
            BrowserChannelContext.prototype = BrowserChannelContextProto;
            BrowserChannelContextProto._event_origin = null;
            BrowserChannelContextProto._event_source = null;
            BrowserChannelContextProto.type = function () {
                return 'BROWSER';
            };
            BrowserChannelContextProto.isStateful = function () {
                return true;
            };
            BrowserChannelContextProto._getPerformRequest = function () {
                var evt_origin = this._event_origin;
                var evt_source = this._event_source;
                var revreq = this._executor._reverse_requests;
                var sniffer = this._executor._msg_sniffer;
                return function (as, ctx, ftnreq) {
                    as.add(function (as) {
                        var rid = 'S' + revreq.rid++;
                        ftnreq.rid = rid;
                        if (ctx.expect_response) {
                            var sentreqs = revreq.sentreqs;
                            sentreqs[rid] = {
                                reqas: as,
                                evt_origin: evt_origin,
                                evt_source: evt_source
                            };
                            as.setCancel(function () {
                                delete sentreqs[rid];
                            });
                        }
                        sniffer(evt_origin, ftnreq, false);
                        evt_source.postMessage(ftnreq, evt_origin);
                    });
                };
            };
            var BrowserExecutorOptions = {
                    clientTimeoutMS: 600,
                    allowedOrigins: []
                };
            var BrowserExecutor = function (ccm, opts) {
                Executor.call(this, ccm, opts);
                opts = opts || {};
                _defaults(opts, BrowserExecutorOptions);
                this._msg_sniffer = opts.messageSniffer;
                this._contexts = [];
                this._reverse_requests = {
                    rid: 1,
                    sentreqs: {}
                };
                var _this = this;
                var allowed_origins = opts.allowedOrigins || {};
                if (allowed_origins instanceof Array) {
                    allowed_origins = _zipObject(allowed_origins, allowed_origins);
                }
                this.allowed_origins = allowed_origins;
                var client_timeout = opts.clientTimeoutMS;
                var connection_cleanup = function () {
                    var ctx_list = _this._contexts;
                    var remove_time = performance_now() - client_timeout;
                    for (var i = ctx_list.length - 1; i >= 0; --i) {
                        var ctx = ctx_list[i];
                        if (ctx._last_used < remove_time) {
                            ctx._cleanup();
                            ctx_list.splice(i, 1);
                        }
                    }
                    setTimeout(connection_cleanup, client_timeout * 1000);
                };
                connection_cleanup();
                this._event_listener = function (event) {
                    _this.handleMessage(event);
                };
                browser_window.addEventListener('message', this._event_listener);
            };
            var BrowserExecutorProto = _clone(Executor.prototype);
            BrowserExecutor.prototype = BrowserExecutorProto;
            BrowserExecutorProto.allowed_origins = null;
            BrowserExecutorProto.handleMessage = function (event) {
                this._msg_sniffer(event, event.data, true);
                var ftnreq = event.data;
                var source = event.source;
                var origin = event.origin;
                if (typeof ftnreq !== 'object' || !('rid' in ftnreq)) {
                    return;
                }
                var rid = ftnreq.rid;
                if (!('f' in ftnreq) && rid.charAt(0) === 'S') {
                    var sentreqs = this._reverse_requests.sentreqs;
                    var sreq = sentreqs[rid];
                    if (sreq && source === sreq.evt_source && origin === sreq.evt_origin) {
                        sreq.reqas.success(ftnreq, 'application/futoin+json');
                        delete sentreqs[rid];
                    }
                    if (event.stopPropagation) {
                        event.stopPropagation();
                    }
                    return;
                }
                if (!('f' in ftnreq) || rid.charAt(0) !== 'C' || !(origin in this.allowed_origins)) {
                    return;
                }
                var context = null;
                var ctx_list = this._contexts;
                for (var i = 0, c = ctx_list.length; i < c; ++i) {
                    var ctx = ctx_list[i];
                    if (ctx._event_source === source && ctx._event_origin === origin) {
                        context = ctx;
                        break;
                    }
                }
                if (context) {
                    context._last_used = performance_now();
                } else {
                    context = new BrowserChannelContext(this, event);
                    ctx_list.push(context);
                }
                var source_addr = new SourceAddress('LOCAL', source, origin);
                var reqinfo = new RequestInfo(this, ftnreq);
                var reqinfo_info = reqinfo.info;
                reqinfo_info.CHANNEL_CONTEXT = context;
                reqinfo_info.CLIENT_ADDR = source_addr;
                reqinfo_info.SECURE_CHANNEL = this._is_secure_channel;
                var _this = this;
                var as = async_steps();
                as.state.reqinfo = reqinfo;
                reqinfo._as = as;
                var cancel_req = function (as) {
                    void as;
                    reqinfo._cleanup();
                    var ftnrsp = {
                            e: 'InternalError',
                            rid: rid
                        };
                    _this._msg_sniffer(event, ftnrsp, false);
                    context._event_source.postMessage(ftnrsp, context._event_origin);
                };
                as.add(function (as) {
                    as.setCancel(cancel_req);
                    _this.process(as);
                    as.add(function (as) {
                        void as;
                        var ftnrsp = reqinfo_info.RAW_RESPONSE;
                        reqinfo._cleanup();
                        if (ftnrsp !== null) {
                            _this._msg_sniffer(event, ftnrsp, false);
                            context._event_source.postMessage(ftnrsp, context._event_origin);
                        }
                    });
                }).execute();
                if (event.stopPropagation) {
                    event.stopPropagation();
                }
            };
            BrowserExecutorProto.close = function (close_cb) {
                browser_window.removeEventListener('message', this._event_listener);
                if (close_cb) {
                    close_cb();
                }
            };
            module.exports = BrowserExecutor;
        },
        function (module, exports) {
            'use strict';
            var ChannelContext = function (executor) {
                this._executor = executor;
                this._ifaces = {};
                this.state = function () {
                    return this.state;
                };
            };
            var ChannelContextProto = {
                    _executor: null,
                    _ifaces: null,
                    state: null,
                    type: function () {
                    },
                    isStateful: function () {
                        return false;
                    },
                    onInvokerAbort: function (callable, user_data) {
                        void callable;
                        void user_data;
                    },
                    _openRawInput: function () {
                        return null;
                    },
                    _openRawOutput: function () {
                        return null;
                    },
                    register: function (as, ifacever, options) {
                        if (!this.isStateful()) {
                            as.error('InvokerError', 'Not stateful channel');
                        }
                        this._executor.ccm().register(as, null, ifacever, this._getPerformRequest(), null, options);
                        var _this = this;
                        as.add(function (as, info, impl) {
                            info.secure_channel = _this._executor._is_secure_channel;
                            _this._ifaces[ifacever] = impl;
                        });
                    },
                    iface: function (ifacever) {
                        return this._ifaces[ifacever];
                    },
                    _getPerformRequest: function () {
                        throw Error('NotImplemented');
                    },
                    _cleanup: function () {
                        this._executor = null;
                        this._ifaces = null;
                        this.state = null;
                    }
                };
            ChannelContext.prototype = ChannelContextProto;
            module.exports = ChannelContext;
        },
        function (module, exports) {
            'use strict';
            var DerivedKey = function (ccm, base_id, sequence_id) {
                this._ccm = ccm;
                this._base_id = base_id;
                this._sequence_id = sequence_id;
            };
            var DerivedKeyProto = {
                    _ccm: null,
                    _base_id: null,
                    _sequence_id: null,
                    baseID: function () {
                        return this._base_id;
                    },
                    sequenceID: function () {
                        return this._sequence_id;
                    },
                    encrypt: function (as, data) {
                        void as;
                        void data;
                        as.error('NotImplemented', 'Derived key encryption is not supported yet');
                    },
                    decrypt: function (as, data) {
                        void as;
                        void data;
                        as.error('NotImplemented', 'Derived key decryption is not supported yet');
                    },
                    _cleanup: function () {
                        this._ccm = null;
                    }
                };
            DerivedKey.prototype = DerivedKeyProto;
            module.exports = DerivedKey;
        },
        function (module, exports) {
            'use strict';
            var _extend = _require(56);
            var _defaults = _require(55);
            var invoker = _require(26);
            var FutoInError = invoker.FutoInError;
            var async_steps = _require(25);
            var ee = _require(10);
            var _clone = _require(49);
            var Executor = _require(3);
            var ChannelContext = _require(1);
            var SourceAddress = _require(5);
            var RequestInfo = _require(4);
            var UserInfo = _require(6);
            var CallbackChannelContext = function (executor) {
                ChannelContext.call(this, executor);
            };
            var CallbackChannelContextProto = _clone(ChannelContext.prototype);
            CallbackChannelContext.prototype = CallbackChannelContextProto;
            CallbackChannelContextProto.type = function () {
                return 'CALLBACK';
            };
            CallbackChannelContextProto.isStateful = function () {
                return true;
            };
            var InternalChannelContext = function (executor, invoker_executor) {
                ChannelContext.call(this, executor);
                this._invoker_executor = invoker_executor;
            };
            var InternalChannelContextProto = _clone(ChannelContext.prototype);
            InternalChannelContext.prototype = InternalChannelContextProto;
            InternalChannelContextProto._invoker_executor = null;
            InternalChannelContextProto.type = function () {
                return 'INTERNAL';
            };
            InternalChannelContextProto.isStateful = function () {
                return true;
            };
            InternalChannelContextProto._getPerformRequest = function () {
                var invoker_executor = this._invoker_executor;
                if (!invoker_executor) {
                    return this._commError;
                }
                return function (as, ctx, ftnreq) {
                    invoker_executor.onInternalRequest(as, ctx.info, ftnreq);
                };
            };
            InternalChannelContextProto._commError = function (as) {
                as.error(FutoInError.CommError, 'No Invoker\'s Executor for internal call');
            };
            var ExecutorOptions = {
                    messageSniffer: function () {
                    },
                    specDirs: [],
                    prodMode: false,
                    reqTimeout: 5000,
                    heavyReqTimeout: 60000
                };
            var Executor = function (ccm, opts) {
                ee(this);
                this._ccm = ccm;
                this._ifaces = {};
                this._impls = {};
                opts = opts || {};
                _defaults(opts, ExecutorOptions);
                var spec_dirs = opts.specDirs;
                if (!(spec_dirs instanceof Array)) {
                    spec_dirs = [spec_dirs];
                }
                this._specdirs = spec_dirs;
                this._dev_checks = !opts.prodMode;
                this._request_timeout = opts.reqTimeout;
                this._heavy_timeout = opts.heavyReqTimeout;
                if (typeof Buffer !== 'undefined' && Buffer.byteLength) {
                    this._byteLength = Buffer.byteLength;
                } else {
                    this._byteLength = function (data) {
                        return data.length;
                    };
                }
            };
            var ExecutorProto = {
                    SAFE_PAYLOAD_LIMIT: 65536,
                    _ccm: null,
                    _ifaces: null,
                    _impls: null,
                    _specdirs: null,
                    _dev_checks: false,
                    _request_timeout: null,
                    _heavy_timeout: null,
                    _byteLength: null,
                    ccm: function () {
                        return this._ccm;
                    },
                    register: function (as, ifacever, impl, specdirs) {
                        var m = ifacever.match(invoker.SpecTools._ifacever_pattern);
                        if (m === null) {
                            as.error(FutoInError.InternalError, 'Invalid ifacever');
                        }
                        var iface = m[1];
                        var mjrmnr = m[4];
                        var mjr = m[5];
                        var mnr = m[6];
                        var ifaces = this._ifaces;
                        if (iface in ifaces && mjr in ifaces[iface]) {
                            as.error(FutoInError.InternalError, 'Already registered');
                        }
                        var info = {
                                iface: iface,
                                version: mjrmnr,
                                mjrver: mjr,
                                mnrver: mnr
                            };
                        invoker.SpecTools.loadIface(as, info, specdirs || this._specdirs);
                        var _this = this;
                        as.add(function (as) {
                            if (!(iface in ifaces)) {
                                ifaces[iface] = {};
                                _this._impls[iface] = {};
                            }
                            ifaces[iface][mjr] = info;
                            _this._impls[iface][mjr] = impl;
                            for (var i = 0; i < info.inherits.length; ++i) {
                                var supm = info.inherits[i].match(invoker.SpecTools._ifacever_pattern);
                                var supiface = supm[1];
                                var supmjrmnr = supm[4];
                                var supmjr = supm[5];
                                var supmnr = supm[6];
                                var supinfo = {
                                        iface: supiface,
                                        version: supmjrmnr,
                                        mjrver: supmjr,
                                        mnrver: supmnr,
                                        derived: info
                                    };
                                if (supiface in ifaces && supmjr in ifaces[supiface]) {
                                    delete ifaces[iface][mjr];
                                    as.error(FutoInError.InternalError, 'Conflict with inherited interfaces');
                                }
                                if (!(supiface in ifaces)) {
                                    ifaces[supiface] = {};
                                }
                                ifaces[supiface][supmjr] = supinfo;
                            }
                        });
                    },
                    onEndpointRequest: function (info, ftnreq, send_executor_rsp) {
                        var _this = this;
                        var reqinfo = new RequestInfo(this, ftnreq);
                        var context = new CallbackChannelContext(this);
                        var source_addr = new SourceAddress(context.type(), null, info.regname);
                        var reqinfo_info = reqinfo.info;
                        reqinfo_info.CHANNEL_CONTEXT = context;
                        reqinfo_info.CLIENT_ADDR = source_addr;
                        reqinfo_info.SECURE_CHANNEL = info.secure_channel;
                        var as = async_steps();
                        reqinfo._as = as;
                        as.add(function (as) {
                            as.setCancel(function (as) {
                                void as;
                                var ftnrsp = {
                                        rid: reqinfo._rawreq.rid,
                                        e: 'InternalError'
                                    };
                                reqinfo._cleanup();
                                send_executor_rsp(ftnrsp);
                            });
                            as.state.reqinfo = reqinfo;
                            _this.process(as);
                            as.add(function (as) {
                                void as;
                                var ftnrsp = reqinfo_info.RAW_RESPONSE;
                                reqinfo._cleanup();
                                if (ftnrsp !== null) {
                                    send_executor_rsp(ftnrsp);
                                }
                            });
                        }, function (as, err) {
                            _this.emit('notExpected', err, as.state.error_info);
                            reqinfo._cleanup();
                        }).execute();
                    },
                    onInternalRequest: function (as, info, ftnreq, upload_data, download_stream) {
                        var context = info._server_executor_context;
                        if (!context) {
                            context = new InternalChannelContext(this, info.options.executor);
                            info._server_executor_context = context;
                        }
                        var _this = this;
                        var reqinfo = new RequestInfo(this, ftnreq);
                        var source_addr = new SourceAddress(context.type(), null, null);
                        var reqinfo_info = reqinfo.info;
                        reqinfo_info.CHANNEL_CONTEXT = context;
                        reqinfo_info.CLIENT_ADDR = source_addr;
                        reqinfo_info.SECURE_CHANNEL = true;
                        if (upload_data) {
                            reqinfo_info.HAVE_RAW_UPLOAD = true;
                            reqinfo._rawinp = upload_data;
                        }
                        if (download_stream) {
                            reqinfo._rawout = download_stream;
                        }
                        as.add(function (orig_as) {
                            var inner_as = async_steps();
                            reqinfo._as = inner_as;
                            inner_as.add(function (as) {
                                as.setCancel(function (as) {
                                    void as;
                                    reqinfo._cleanup();
                                    if (!as.state._orig_as_cancel) {
                                        try {
                                            orig_as.error(FutoInError.InternalError, 'Executor canceled');
                                        } catch (e) {
                                        }
                                    }
                                });
                                as.state.reqinfo = reqinfo;
                                _this.process(as);
                                as.add(function (as) {
                                    void as;
                                    var ftnrsp = reqinfo_info.RAW_RESPONSE;
                                    reqinfo._cleanup();
                                    if (ftnrsp !== null) {
                                        orig_as.success(ftnrsp, invoker.SimpleCCM.FUTOIN_CONTENT_TYPE);
                                    }
                                });
                            }, function (as, err) {
                                _this.emit('notExpected', err, as.state.error_info);
                                reqinfo._cleanup();
                            }).execute();
                            orig_as.setCancel(function (as) {
                                void as;
                                inner_as.state._orig_as_cancel = true;
                                inner_as.cancel();
                            });
                        });
                    },
                    process: function (as) {
                        var reqinfo = as.state.reqinfo;
                        if (!reqinfo || '_func_info' in reqinfo.info) {
                            as.error(FutoInError.InternalError, 'Invalid process() invocation');
                        }
                        var _this = this;
                        as.add(function (as) {
                            var reqinfo_info = reqinfo.info;
                            var rawreq = reqinfo_info.RAW_REQUEST;
                            _this.emit('request', reqinfo, rawreq);
                            _this._getInfo(as, reqinfo);
                            if (reqinfo_info._func_info.heavy) {
                                reqinfo.cancelAfter(_this._heavy_timeout);
                            } else {
                                reqinfo.cancelAfter(_this._request_timeout);
                            }
                            _this._checkParams(as, reqinfo);
                            var sec = rawreq.sec;
                            if (sec) {
                                sec = sec.split(':');
                                if (sec[0] === '-hmac') {
                                    _this._checkAuthHMAC(as, reqinfo, sec[1], sec[2], sec[3]);
                                } else {
                                    _this._checkBasicAuth(as, reqinfo, sec);
                                }
                            }
                            as.add(function (as) {
                                _this._checkConstraints(as, reqinfo);
                                var func = reqinfo_info._func;
                                var impl = _this._getImpl(as, reqinfo);
                                if (!(func in impl)) {
                                    as.error(FutoInError.InternalError, 'Missing function implementation');
                                }
                                var result = impl[func](as, reqinfo);
                                if (result) {
                                    _extend(reqinfo.result(), result);
                                }
                            });
                            as.add(function (as, result) {
                                if (result) {
                                    _extend(reqinfo.result(), result);
                                }
                                _this._checkResponse(as, reqinfo);
                                as.success(reqinfo);
                            });
                        }, function (as, err) {
                            var reqinfo = as.state.reqinfo;
                            var reqinfo_info = reqinfo.info;
                            var error_info = as.state.error_info;
                            if (!(err in invoker.SpecTools.standard_errors) && (!reqinfo_info._func_info || !(err in reqinfo_info._func_info.throws))) {
                                _this.emit('notExpected', err, error_info);
                                err = FutoInError.InternalError;
                                error_info = 'Not expected error';
                            }
                            var rawrsp = reqinfo.info.RAW_RESPONSE;
                            rawrsp.e = err;
                            delete rawrsp.r;
                            if (error_info) {
                                rawrsp.edesc = error_info;
                            }
                            as.success(reqinfo);
                        }).add(function (as, reqinfo) {
                            _this._signResponse(as, reqinfo);
                        });
                    },
                    checkAccess: function (as, acd) {
                        void acd;
                        as.error(FutoInError.NotImplemented, 'Access Control is not supported yet');
                    },
                    initFromCache: function (as) {
                        as.error(FutoInError.NotImplemented, 'Caching is not supported yet');
                    },
                    cacheInit: function (as) {
                        as.error(FutoInError.NotImplemented, 'Caching is not supported yet');
                    },
                    _getInfo: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var f = reqinfo_info.RAW_REQUEST.f;
                        if (typeof f !== 'string') {
                            as.error(FutoInError.InvalidRequest, 'Missing req.f');
                        }
                        f = f.split(':');
                        if (f.length !== 3) {
                            as.error(FutoInError.InvalidRequest, 'Invalid req.f');
                        }
                        var iface = f[0];
                        var func = f[2];
                        var v = f[1].split('.');
                        if (v.length !== 2) {
                            as.error(FutoInError.InvalidRequest, 'Invalid req.f (version)');
                        }
                        if (!(iface in this._ifaces)) {
                            as.error(FutoInError.UnknownInterface, 'Unknown Interface');
                        }
                        var vmjr = v[0];
                        var vmnr = v[1];
                        if (!(vmjr in this._ifaces[iface])) {
                            as.error(FutoInError.NotSupportedVersion, 'Different major version');
                        }
                        var iface_info = this._ifaces[iface][vmjr];
                        if (iface_info.mnrver < vmnr) {
                            as.error(FutoInError.NotSupportedVersion, 'Iface version is too old');
                        }
                        if ('derived' in iface_info) {
                            iface_info = iface_info.derived;
                        }
                        if (!(func in iface_info.funcs)) {
                            as.error(FutoInError.InvalidRequest, 'Not defined interface function');
                        }
                        var finfo = iface_info.funcs[func];
                        reqinfo_info._iface_info = iface_info;
                        reqinfo_info._func = func;
                        reqinfo_info._func_info = finfo;
                        if (finfo.rawresult) {
                            reqinfo_info.HAVE_RAW_RESULT = true;
                        }
                    },
                    _checkBasicAuth: function (as, reqinfo, sec) {
                        var _this = this;
                        as.add(function (as) {
                            var basicauth = _this._ccm.iface('#basicauth');
                            var reqinfo_info = reqinfo.info;
                            basicauth.call(as, 'auth', {
                                user: sec[0],
                                pwd: sec[1],
                                client_addr: reqinfo_info.CLIENT_ADDR.asString(),
                                is_secure: reqinfo_info.SECURE_CHANNEL
                            });
                            as.add(function (as, rsp) {
                                reqinfo_info.USER_INFO = new UserInfo(_this._ccm, rsp.local_id, rsp.global_id, rsp.details);
                                reqinfo_info.SECURITY_LEVEL = RequestInfo.SL_INFO;
                            });
                        }, function (as, err) {
                            void err;
                            as.success();
                        });
                    },
                    _checkAuthHMAC: function (as, reqinfo, user, algo, sig) {
                        var _this = this;
                        as.add(function (as) {
                            var basicauth = _this._ccm.iface('#basicauth');
                            var reqinfo_info = reqinfo.info;
                            var req = _clone(reqinfo.info.RAW_REQUEST);
                            delete req.sec;
                            basicauth.call(as, 'checkHMAC', {
                                msg: req,
                                user: user,
                                algo: algo,
                                sig: sig,
                                client_addr: reqinfo_info.CLIENT_ADDR.asString(),
                                is_secure: reqinfo_info.SECURE_CHANNEL
                            });
                            as.add(function (as, rsp) {
                                reqinfo_info.USER_INFO = new UserInfo(_this._ccm, rsp.local_id, rsp.global_id, rsp.details);
                                reqinfo_info.SECURITY_LEVEL = RequestInfo.SL_INFO;
                                reqinfo_info._hmac_algo = algo;
                                reqinfo_info._hmac_user = user;
                            });
                        }, function (as, err) {
                            void err;
                            as.error(FutoInError.SecurityError, 'Signature Verification Failed');
                        });
                    },
                    _checkConstraints: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var constraints = reqinfo_info._iface_info.constraints;
                        if ('SecureChannel' in constraints && !reqinfo_info.SECURE_CHANNEL) {
                            as.error(FutoInError.SecurityError, 'Insecure channel');
                        }
                        if ('MessageSignature' in constraints && !reqinfo_info.DERIVED_KEY && !reqinfo_info._hmac_user) {
                            as.error(FutoInError.SecurityError, 'Message Signature is required');
                        }
                        if (!('AllowAnonymous' in constraints) && !reqinfo_info.USER_INFO) {
                            as.error(FutoInError.SecurityError, 'Anonymous not allowed');
                        }
                        var context = reqinfo_info.CHANNEL_CONTEXT;
                        if ('BiDirectChannel' in constraints && (!context || !context.isStateful())) {
                            console.dir(context);
                            console.log(context.isStateful());
                            as.error(FutoInError.InvalidRequest, 'Bi-Direct Channel is required');
                        }
                    },
                    _checkParams: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var rawreq = reqinfo_info.RAW_REQUEST;
                        var finfo = reqinfo_info._func_info;
                        if (reqinfo.HAVE_RAW_UPLOAD && !finfo.rawupload) {
                            as.error(FutoInError.InvalidRequest, 'Raw upload is not allowed');
                        }
                        if ('p' in rawreq) {
                            var reqparams = rawreq.p;
                            var k;
                            for (k in reqparams) {
                                if (!(k in finfo.params)) {
                                    as.error(FutoInError.InvalidRequest, 'Unknown parameter');
                                }
                                var check_res = invoker.SpecTools.checkParameterType(reqinfo_info._iface_info, reqinfo_info._func, k, reqparams[k]);
                                if (check_res) {
                                    continue;
                                }
                                if (reqinfo_info._from_query_string) {
                                    try {
                                        reqparams[k] = JSON.parse(reqparams[k]);
                                        check_res = invoker.SpecTools.checkParameterType(reqinfo_info._iface_info, reqinfo_info._func, k, reqparams[k]);
                                        if (check_res) {
                                            continue;
                                        }
                                    } catch (e) {
                                    }
                                }
                                as.error(FutoInError.InvalidRequest, 'Type mismatch for parameter: ' + k);
                            }
                            for (k in finfo.params) {
                                if (!(k in reqparams)) {
                                    var pinfo = finfo.params[k];
                                    if ('default' in pinfo) {
                                        reqparams[k] = pinfo.default;
                                    } else {
                                        as.error(FutoInError.InvalidRequest, 'Missing parameter: ' + k);
                                    }
                                }
                            }
                        } else if (Object.keys(finfo.params).length > 0) {
                            as.error(FutoInError.InvalidRequest, 'Missing parameter (any)');
                        }
                    },
                    _getImpl: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var iface_info = reqinfo_info._iface_info;
                        var iname = iface_info.iface;
                        var imjr = iface_info.mjrver;
                        var impl = this._impls[iname][imjr];
                        if (typeof impl !== 'object') {
                            if (typeof impl === 'function') {
                                impl = impl(impl, this);
                            } else {
                                as.error(FutoInError.InternalError, 'Invalid implementation type');
                            }
                            if (typeof impl !== 'object') {
                                as.error(FutoInError.InternalError, 'Implementation does not implement InterfaceImplementation');
                            }
                            this._impls[iname][imjr] = impl;
                        }
                        return impl;
                    },
                    _checkResponse: function (as, reqinfo) {
                        if (!this._dev_checks) {
                            return;
                        }
                        var reqinfo_info = reqinfo.info;
                        var rsp = reqinfo_info.RAW_RESPONSE;
                        var finfo = reqinfo_info._func_info;
                        if (finfo.rawresult) {
                            reqinfo_info.RAW_RESPONSE = null;
                            if (Object.keys(rsp.r).length > 0) {
                                as.error(FutoInError.InternalError, 'Raw result is expected');
                            }
                            return;
                        }
                        if (!finfo.expect_result && reqinfo_info.RAW_REQUEST.forcersp !== true) {
                            reqinfo_info.RAW_RESPONSE = null;
                            return;
                        }
                        if (Object.keys(finfo.result).length > 0) {
                            var resvars = finfo.result;
                            var c = 0;
                            var k;
                            for (k in rsp.r) {
                                if (!(k in resvars)) {
                                    as.error(FutoInError.InternalError, 'Unknown result variable \'' + k + '\'');
                                }
                                invoker.SpecTools.checkResultType(as, reqinfo_info._iface_info, reqinfo_info._func, k, rsp.r[k]);
                                ++c;
                            }
                            if (Object.keys(resvars).length !== c) {
                                as.error(FutoInError.InternalError, 'Missing result variables');
                            }
                        } else if (Object.keys(rsp.r).length > 0) {
                            as.error(FutoInError.InternalError, 'No result variables are expected');
                        }
                    },
                    _signResponse: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var rawrsp = reqinfo_info.RAW_RESPONSE;
                        if (!rawrsp) {
                            this.emit('response', reqinfo, rawrsp);
                            return;
                        }
                        if (reqinfo_info.DERIVED_KEY) {
                            this.emit('response', reqinfo, rawrsp);
                            return;
                        }
                        if (reqinfo_info._hmac_user) {
                            var _this = this;
                            as.add(function (as) {
                                var basicauth = _this._ccm.iface('#basicauth');
                                basicauth.call(as, 'genHMAC', {
                                    msg: rawrsp,
                                    user: reqinfo_info._hmac_user,
                                    algo: reqinfo_info._hmac_algo
                                });
                                as.add(function (as, rsp) {
                                    rawrsp.sec = rsp.sig;
                                    _this.emit('response', reqinfo, rawrsp);
                                });
                            }, function (as, err) {
                                void err;
                                _this.emit('response', reqinfo, rawrsp);
                                as.success();
                            });
                            return;
                        }
                        this.emit('response', reqinfo, rawrsp);
                    },
                    close: function () {
                    },
                    packPayloadJSON: function (msg) {
                        var rawmsg = JSON.stringify(msg);
                        if (this._byteLength(rawmsg, 'utf8') > this.SAFE_PAYLOAD_LIMIT) {
                            this.emit('notExpected', FutoInError.InternalError, 'Response size has exceeded safety limit');
                            throw new Error(FutoInError.InternalError);
                        }
                        return rawmsg;
                    }
                };
            Executor.prototype = ExecutorProto;
            module.exports = Executor;
        },
        function (module, exports) {
            'use strict';
            var _extend = _require(56);
            var performance_now = _require(63);
            var async_steps = _require(25);
            var RequestInfoConst = {
                    SL_ANONYMOUS: 'Anonymous',
                    SL_INFO: 'Info',
                    SL_SAFEOPS: 'SafeOps',
                    SL_PRIVLEGED_OPS: 'PrivilegedOps',
                    SL_EXCEPTIONAL_OPS: 'ExceptionalOps',
                    INFO_X509_CN: 'X509_CN',
                    INFO_PUBKEY: 'PUBKEY',
                    INFO_CLIENT_ADDR: 'CLIENT_ADDR',
                    INFO_SECURE_CHANNEL: 'SECURE_CHANNEL',
                    INFO_REQUEST_TIME_FLOAT: 'REQUEST_TIME_FLOAT',
                    INFO_SECURITY_LEVEL: 'SECURITY_LEVEL',
                    INFO_USER_INFO: 'USER_INFO',
                    INFO_RAW_REQUEST: 'RAW_REQUEST',
                    INFO_RAW_RESPONSE: 'RAW_RESPONSE',
                    INFO_DERIVED_KEY: 'DERIVED_KEY',
                    INFO_HAVE_RAW_UPLOAD: 'HAVE_RAW_UPLOAD',
                    INFO_HAVE_RAW_RESULT: 'HAVE_RAW_RESULT',
                    INFO_CHANNEL_CONTEXT: 'CHANNEL_CONTEXT'
                };
            var RequestInfo = function (executor, rawreq) {
                this._executor = executor;
                if (typeof rawreq === 'string') {
                    rawreq = JSON.parse(rawreq);
                }
                this._rawreq = rawreq;
                var rawrsp = { r: {} };
                if ('rid' in rawreq) {
                    rawrsp.rid = rawreq.rid;
                }
                this._rawrsp = rawrsp;
                var info = function () {
                    return this.info;
                };
                this.info = info;
                info.X509_CN = null;
                info.PUBKEY = null;
                info.CLIENT_ADDR = null;
                info.SECURE_CHANNEL = false;
                info.SECURITY_LEVEL = this.SL_ANONYMOUS;
                info.USER_INFO = null;
                info.RAW_REQUEST = rawreq;
                info.RAW_RESPONSE = rawrsp;
                info.DERIVED_KEY = null;
                info.HAVE_RAW_UPLOAD = false;
                info.HAVE_RAW_RESULT = false;
                info.CHANNEL_CONTEXT = null;
                info.REQUEST_TIME_FLOAT = performance_now();
            };
            _extend(RequestInfo, RequestInfoConst);
            var RequestInfoProto = RequestInfoConst;
            RequestInfoProto._executor = null;
            RequestInfoProto._rawinp = null;
            RequestInfoProto._rawout = null;
            RequestInfoProto._as = null;
            RequestInfoProto.params = function () {
                return this._rawreq.p;
            };
            RequestInfoProto.result = function () {
                return this._rawrsp.r;
            };
            RequestInfoProto.info = null;
            RequestInfoProto.rawInput = function () {
                var rawinp = this._rawinp;
                if (!rawinp) {
                    if (this.info.HAVE_RAW_UPLOAD && this.info.CHANNEL_CONTEXT !== null) {
                        rawinp = this.info.CHANNEL_CONTEXT._openRawInput();
                        this._rawinp = rawinp;
                    }
                    if (!rawinp) {
                        throw new Error('RawInputError');
                    }
                }
                return rawinp;
            };
            RequestInfoProto.rawOutput = function () {
                var rawout = this._rawout;
                if (!rawout) {
                    if (this.info.HAVE_RAW_RESULT && this.info.CHANNEL_CONTEXT !== null) {
                        rawout = this.info.CHANNEL_CONTEXT._openRawOutput();
                        this._rawout = rawout;
                    }
                    if (!rawout) {
                        throw new Error('RawOutputError');
                    }
                }
                return rawout;
            };
            RequestInfoProto.executor = function () {
                return this._executor;
            };
            RequestInfoProto.channel = function () {
                return this.info.CHANNEL_CONTEXT;
            };
            RequestInfoProto.cancelAfter = function (time_ms) {
                if (this._cancelAfter) {
                    async_steps.AsyncTool.cancelCall(this._cancelAfter);
                    this._cancelAfter = null;
                }
                if (time_ms > 0 && this._as) {
                    var _this = this;
                    this._cancelAfter = async_steps.AsyncTool.callLater(function () {
                        _this._as.cancel();
                    }, time_ms);
                }
            };
            RequestInfoProto._cleanup = function () {
                var info = this.info;
                this.cancelAfter(0);
                this._as = null;
                this.info = null;
                var context = info.CHANNEL_CONTEXT;
                if (context && !context.isStateful()) {
                    context._cleanup();
                }
                var user = info.USER_INFO;
                if (user) {
                    user._cleanup();
                }
            };
            RequestInfo.prototype = RequestInfoProto;
            module.exports = RequestInfo;
        },
        function (module, exports) {
            'use strict';
            var SourceAddress = function (type, host, port) {
                if (type === null) {
                    if (typeof host !== 'string') {
                        type = 'LOCAL';
                    } else if (host.match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
                        type = 'IPv4';
                    } else {
                        type = 'IPv6';
                    }
                }
                this.type = type;
                this.host = host;
                this.port = port;
            };
            SourceAddress.prototype = {
                host: null,
                port: null,
                type: null,
                asString: function () {
                    if (this.type === 'LOCAL') {
                        return 'LOCAL:' + this.port;
                    } else if (this.type === 'IPv6') {
                        return 'IPv6:[' + this.host + ']:' + this.port;
                    } else {
                        return this.type + ':' + this.host + ':' + this.port;
                    }
                }
            };
            module.exports = SourceAddress;
        },
        function (module, exports) {
            'use strict';
            var _extend = _require(56);
            var UserInfoConst = {
                    INFO_FirstName: 'FirstName',
                    INFO_FullName: 'FullName',
                    INFO_DateOfBirth: 'DateOfBirth',
                    INFO_TimeOfBirth: 'TimeOfBirth',
                    INFO_ContactEmail: 'ContactEmail',
                    INFO_ContactPhone: 'ContactPhone',
                    INFO_HomeAddress: 'HomeAddress',
                    INFO_WorkAddress: 'WorkAddress',
                    INFO_Citizenship: 'Citizenship',
                    INFO_GovernmentRegID: 'GovernmentRegID',
                    INFO_AvatarURL: 'AvatarURL'
                };
            var UserInfo = function (ccm, local_id, global_id, details) {
                this._ccm = ccm;
                this._local_id = local_id;
                this._global_id = global_id;
                this._details = details;
            };
            _extend(UserInfo, UserInfoConst);
            var UserInfoProto = UserInfoConst;
            UserInfoProto._ccm = null;
            UserInfoProto._local_id = null;
            UserInfoProto._global_id = null;
            UserInfoProto._details = null;
            UserInfoProto.localID = function () {
                return this._local_id;
            };
            UserInfoProto.globalID = function () {
                return this._global_id;
            };
            UserInfoProto.details = function (as, user_field_identifiers) {
                var user_details = this._details;
                if (user_details) {
                    as.add(function (as) {
                        as.success(user_details);
                    });
                    return;
                }
                as.error('NotImplemented');
                void user_field_identifiers;
            };
            UserInfoProto._cleanup = function () {
                this._ccm = null;
            };
            UserInfo.prototype = UserInfoProto;
            module.exports = UserInfo;
        },
        function (module, exports) {
            (function (window) {
                'use strict';
                var futoin = window.FutoIn || {};
                if (typeof futoin.Executor === 'undefined') {
                    var executor_module = _require(8);
                    window.FutoInExecutor = executor_module;
                    futoin.Executor = executor_module;
                    window.FutoIn = futoin;
                    window.BrowserExecutor = executor_module.BrowserExecutor;
                    if (module) {
                        module.exports = executor_module;
                    }
                }
            }(window));
        },
        function (module, exports) {
            'use strict';
            var isNode = _require(9);
            exports.ChannelContext = _require(1);
            exports.DerivedKey = _require(2);
            exports.RequestInfo = _require(4);
            exports.SourceAddress = _require(5);
            exports.UserInfo = _require(6);
            var Executor = _require(3);
            exports.Executor = Executor;
            exports.ClientExecutor = Executor;
            if (isNode) {
                var hidreq = require;
                exports.NodeExecutor = hidreq('../NodeExecutor');
            } else {
                exports.BrowserExecutor = _require(0);
            }
        },
        function (module, exports) {
            module.exports = false;
            try {
                module.exports = Object.prototype.toString.call(global.process) === '[object process]';
            } catch (e) {
            }
        },
        function (module, exports) {
            'use strict';
            var d = _require(11), callable = _require(20), apply = Function.prototype.apply, call = Function.prototype.call, create = Object.create, defineProperty = Object.defineProperty, defineProperties = Object.defineProperties, hasOwnProperty = Object.prototype.hasOwnProperty, descriptor = {
                    configurable: true,
                    enumerable: false,
                    writable: true
                }, on, once, off, emit, methods, descriptors, base;
            on = function (type, listener) {
                var data;
                callable(listener);
                if (!hasOwnProperty.call(this, '__ee__')) {
                    data = descriptor.value = create(null);
                    defineProperty(this, '__ee__', descriptor);
                    descriptor.value = null;
                } else {
                    data = this.__ee__;
                }
                if (!data[type])
                    data[type] = listener;
                else if (typeof data[type] === 'object')
                    data[type].push(listener);
                else
                    data[type] = [
                        data[type],
                        listener
                    ];
                return this;
            };
            once = function (type, listener) {
                var once, self;
                callable(listener);
                self = this;
                on.call(this, type, once = function () {
                    off.call(self, type, once);
                    apply.call(listener, this, arguments);
                });
                once.__eeOnceListener__ = listener;
                return this;
            };
            off = function (type, listener) {
                var data, listeners, candidate, i;
                callable(listener);
                if (!hasOwnProperty.call(this, '__ee__'))
                    return this;
                data = this.__ee__;
                if (!data[type])
                    return this;
                listeners = data[type];
                if (typeof listeners === 'object') {
                    for (i = 0; candidate = listeners[i]; ++i) {
                        if (candidate === listener || candidate.__eeOnceListener__ === listener) {
                            if (listeners.length === 2)
                                data[type] = listeners[i ? 0 : 1];
                            else
                                listeners.splice(i, 1);
                        }
                    }
                } else {
                    if (listeners === listener || listeners.__eeOnceListener__ === listener) {
                        delete data[type];
                    }
                }
                return this;
            };
            emit = function (type) {
                var i, l, listener, listeners, args;
                if (!hasOwnProperty.call(this, '__ee__'))
                    return;
                listeners = this.__ee__[type];
                if (!listeners)
                    return;
                if (typeof listeners === 'object') {
                    l = arguments.length;
                    args = new Array(l - 1);
                    for (i = 1; i < l; ++i)
                        args[i - 1] = arguments[i];
                    listeners = listeners.slice();
                    for (i = 0; listener = listeners[i]; ++i) {
                        apply.call(listener, this, args);
                    }
                } else {
                    switch (arguments.length) {
                    case 1:
                        call.call(listeners, this);
                        break;
                    case 2:
                        call.call(listeners, this, arguments[1]);
                        break;
                    case 3:
                        call.call(listeners, this, arguments[1], arguments[2]);
                        break;
                    default:
                        l = arguments.length;
                        args = new Array(l - 1);
                        for (i = 1; i < l; ++i) {
                            args[i - 1] = arguments[i];
                        }
                        apply.call(listeners, this, args);
                    }
                }
            };
            methods = {
                on: on,
                once: once,
                off: off,
                emit: emit
            };
            descriptors = {
                on: d(on),
                once: d(once),
                off: d(off),
                emit: d(emit)
            };
            base = defineProperties({}, descriptors);
            module.exports = exports = function (o) {
                return o == null ? create(base) : defineProperties(Object(o), descriptors);
            };
            exports.methods = methods;
        },
        function (module, exports) {
            'use strict';
            var assign = _require(12), normalizeOpts = _require(19), isCallable = _require(15), contains = _require(22), d;
            d = module.exports = function (dscr, value) {
                var c, e, w, options, desc;
                if (arguments.length < 2 || typeof dscr !== 'string') {
                    options = value;
                    value = dscr;
                    dscr = null;
                } else {
                    options = arguments[2];
                }
                if (dscr == null) {
                    c = w = true;
                    e = false;
                } else {
                    c = contains.call(dscr, 'c');
                    e = contains.call(dscr, 'e');
                    w = contains.call(dscr, 'w');
                }
                desc = {
                    value: value,
                    configurable: c,
                    enumerable: e,
                    writable: w
                };
                return !options ? desc : assign(normalizeOpts(options), desc);
            };
            d.gs = function (dscr, get, set) {
                var c, e, options, desc;
                if (typeof dscr !== 'string') {
                    options = set;
                    set = get;
                    get = dscr;
                    dscr = null;
                } else {
                    options = arguments[3];
                }
                if (get == null) {
                    get = undefined;
                } else if (!isCallable(get)) {
                    options = get;
                    get = set = undefined;
                } else if (set == null) {
                    set = undefined;
                } else if (!isCallable(set)) {
                    options = set;
                    set = undefined;
                }
                if (dscr == null) {
                    c = true;
                    e = false;
                } else {
                    c = contains.call(dscr, 'c');
                    e = contains.call(dscr, 'e');
                }
                desc = {
                    get: get,
                    set: set,
                    configurable: c,
                    enumerable: e
                };
                return !options ? desc : assign(normalizeOpts(options), desc);
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = _require(13)() ? Object.assign : _require(14);
        },
        function (module, exports) {
            'use strict';
            module.exports = function () {
                var assign = Object.assign, obj;
                if (typeof assign !== 'function')
                    return false;
                obj = { foo: 'raz' };
                assign(obj, { bar: 'dwa' }, { trzy: 'trzy' });
                return obj.foo + obj.bar + obj.trzy === 'razdwatrzy';
            };
        },
        function (module, exports) {
            'use strict';
            var keys = _require(16), value = _require(21), max = Math.max;
            module.exports = function (dest, src) {
                var error, i, l = max(arguments.length, 2), assign;
                dest = Object(value(dest));
                assign = function (key) {
                    try {
                        dest[key] = src[key];
                    } catch (e) {
                        if (!error)
                            error = e;
                    }
                };
                for (i = 1; i < l; ++i) {
                    src = arguments[i];
                    keys(src).forEach(assign);
                }
                if (error !== undefined)
                    throw error;
                return dest;
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = function (obj) {
                return typeof obj === 'function';
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = _require(17)() ? Object.keys : _require(18);
        },
        function (module, exports) {
            'use strict';
            module.exports = function () {
                try {
                    Object.keys('primitive');
                    return true;
                } catch (e) {
                    return false;
                }
            };
        },
        function (module, exports) {
            'use strict';
            var keys = Object.keys;
            module.exports = function (object) {
                return keys(object == null ? object : Object(object));
            };
        },
        function (module, exports) {
            'use strict';
            var forEach = Array.prototype.forEach, create = Object.create;
            var process = function (src, obj) {
                var key;
                for (key in src)
                    obj[key] = src[key];
            };
            module.exports = function (options) {
                var result = create(null);
                forEach.call(arguments, function (options) {
                    if (options == null)
                        return;
                    process(Object(options), result);
                });
                return result;
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = function (fn) {
                if (typeof fn !== 'function')
                    throw new TypeError(fn + ' is not a function');
                return fn;
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = function (value) {
                if (value == null)
                    throw new TypeError('Cannot use null or undefined');
                return value;
            };
        },
        function (module, exports) {
            'use strict';
            module.exports = _require(23)() ? String.prototype.contains : _require(24);
        },
        function (module, exports) {
            'use strict';
            var str = 'razdwatrzy';
            module.exports = function () {
                if (typeof str.contains !== 'function')
                    return false;
                return str.contains('dwa') === true && str.contains('foo') === false;
            };
        },
        function (module, exports) {
            'use strict';
            var indexOf = String.prototype.indexOf;
            module.exports = function (searchString) {
                return indexOf.call(this, searchString, arguments[1]) > -1;
            };
        },
        function (module, exports) {
            module.exports = __external_$as;
        },
        function (module, exports) {
            module.exports = __external_FutoInInvoker;
        },
        function (module, exports) {
            var isArray = _require(51);
            function zipObject(props, values) {
                var index = -1, length = props ? props.length : 0, result = {};
                if (length && !values && !isArray(props[0])) {
                    values = [];
                }
                while (++index < length) {
                    var key = props[index];
                    if (values) {
                        result[key] = values[index];
                    } else if (key) {
                        result[key[0]] = key[1];
                    }
                }
                return result;
            }
            module.exports = zipObject;
        },
        function (module, exports) {
            function arrayCopy(source, array) {
                var index = -1, length = source.length;
                array || (array = Array(length));
                while (++index < length) {
                    array[index] = source[index];
                }
                return array;
            }
            module.exports = arrayCopy;
        },
        function (module, exports) {
            function arrayEach(array, iteratee) {
                var index = -1, length = array.length;
                while (++index < length) {
                    if (iteratee(array[index], index, array) === false) {
                        break;
                    }
                }
                return array;
            }
            module.exports = arrayEach;
        },
        function (module, exports) {
            function assignDefaults(objectValue, sourceValue) {
                return typeof objectValue == 'undefined' ? sourceValue : objectValue;
            }
            module.exports = assignDefaults;
        },
        function (module, exports) {
            var baseCopy = _require(33), keys = _require(57);
            function baseAssign(object, source, customizer) {
                var props = keys(source);
                if (!customizer) {
                    return baseCopy(source, object, props);
                }
                var index = -1, length = props.length;
                while (++index < length) {
                    var key = props[index], value = object[key], result = customizer(value, source[key], key, object, source);
                    if ((result === result ? result !== value : value === value) || typeof value == 'undefined' && !(key in object)) {
                        object[key] = result;
                    }
                }
                return object;
            }
            module.exports = baseAssign;
        },
        function (module, exports) {
            var arrayCopy = _require(28), arrayEach = _require(29), baseCopy = _require(33), baseForOwn = _require(35), initCloneArray = _require(40), initCloneByTag = _require(41), initCloneObject = _require(42), isArray = _require(51), isObject = _require(53), keys = _require(57);
            var argsTag = '[object Arguments]', arrayTag = '[object Array]', boolTag = '[object Boolean]', dateTag = '[object Date]', errorTag = '[object Error]', funcTag = '[object Function]', mapTag = '[object Map]', numberTag = '[object Number]', objectTag = '[object Object]', regexpTag = '[object RegExp]', setTag = '[object Set]', stringTag = '[object String]', weakMapTag = '[object WeakMap]';
            var arrayBufferTag = '[object ArrayBuffer]', float32Tag = '[object Float32Array]', float64Tag = '[object Float64Array]', int8Tag = '[object Int8Array]', int16Tag = '[object Int16Array]', int32Tag = '[object Int32Array]', uint8Tag = '[object Uint8Array]', uint8ClampedTag = '[object Uint8ClampedArray]', uint16Tag = '[object Uint16Array]', uint32Tag = '[object Uint32Array]';
            var cloneableTags = {};
            cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[stringTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
            cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[mapTag] = cloneableTags[setTag] = cloneableTags[weakMapTag] = false;
            var objectProto = Object.prototype;
            var objToString = objectProto.toString;
            function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
                var result;
                if (customizer) {
                    result = object ? customizer(value, key, object) : customizer(value);
                }
                if (typeof result != 'undefined') {
                    return result;
                }
                if (!isObject(value)) {
                    return value;
                }
                var isArr = isArray(value);
                if (isArr) {
                    result = initCloneArray(value);
                    if (!isDeep) {
                        return arrayCopy(value, result);
                    }
                } else {
                    var tag = objToString.call(value), isFunc = tag == funcTag;
                    if (tag == objectTag || tag == argsTag || isFunc && !object) {
                        result = initCloneObject(isFunc ? {} : value);
                        if (!isDeep) {
                            return baseCopy(value, result, keys(value));
                        }
                    } else {
                        return cloneableTags[tag] ? initCloneByTag(value, tag, isDeep) : object ? value : {};
                    }
                }
                stackA || (stackA = []);
                stackB || (stackB = []);
                var length = stackA.length;
                while (length--) {
                    if (stackA[length] == value) {
                        return stackB[length];
                    }
                }
                stackA.push(value);
                stackB.push(result);
                (isArr ? arrayEach : baseForOwn)(value, function (subValue, key) {
                    result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
                });
                return result;
            }
            module.exports = baseClone;
        },
        function (module, exports) {
            function baseCopy(source, object, props) {
                if (!props) {
                    props = object;
                    object = {};
                }
                var index = -1, length = props.length;
                while (++index < length) {
                    var key = props[index];
                    object[key] = source[key];
                }
                return object;
            }
            module.exports = baseCopy;
        },
        function (module, exports) {
            var toObject = _require(48);
            function baseFor(object, iteratee, keysFunc) {
                var index = -1, iterable = toObject(object), props = keysFunc(object), length = props.length;
                while (++index < length) {
                    var key = props[index];
                    if (iteratee(iterable[key], key, iterable) === false) {
                        break;
                    }
                }
                return object;
            }
            module.exports = baseFor;
        },
        function (module, exports) {
            var baseFor = _require(34), keys = _require(57);
            function baseForOwn(object, iteratee) {
                return baseFor(object, iteratee, keys);
            }
            module.exports = baseForOwn;
        },
        function (module, exports) {
            function baseToString(value) {
                if (typeof value == 'string') {
                    return value;
                }
                return value == null ? '' : value + '';
            }
            module.exports = baseToString;
        },
        function (module, exports) {
            var identity = _require(62);
            function bindCallback(func, thisArg, argCount) {
                if (typeof func != 'function') {
                    return identity;
                }
                if (typeof thisArg == 'undefined') {
                    return func;
                }
                switch (argCount) {
                case 1:
                    return function (value) {
                        return func.call(thisArg, value);
                    };
                case 3:
                    return function (value, index, collection) {
                        return func.call(thisArg, value, index, collection);
                    };
                case 4:
                    return function (accumulator, value, index, collection) {
                        return func.call(thisArg, accumulator, value, index, collection);
                    };
                case 5:
                    return function (value, other, key, object, source) {
                        return func.call(thisArg, value, other, key, object, source);
                    };
                }
                return function () {
                    return func.apply(thisArg, arguments);
                };
            }
            module.exports = bindCallback;
        },
        function (module, exports) {
            var constant = _require(61), isNative = _require(52);
            var ArrayBuffer = isNative(ArrayBuffer = global.ArrayBuffer) && ArrayBuffer, bufferSlice = isNative(bufferSlice = ArrayBuffer && new ArrayBuffer(0).slice) && bufferSlice, floor = Math.floor, Uint8Array = isNative(Uint8Array = global.Uint8Array) && Uint8Array;
            var Float64Array = function () {
                    try {
                        var func = isNative(func = global.Float64Array) && func, result = new func(new ArrayBuffer(10), 0, 1) && func;
                    } catch (e) {
                    }
                    return result;
                }();
            var FLOAT64_BYTES_PER_ELEMENT = Float64Array ? Float64Array.BYTES_PER_ELEMENT : 0;
            function bufferClone(buffer) {
                return bufferSlice.call(buffer, 0);
            }
            if (!bufferSlice) {
                bufferClone = !(ArrayBuffer && Uint8Array) ? constant(null) : function (buffer) {
                    var byteLength = buffer.byteLength, floatLength = Float64Array ? floor(byteLength / FLOAT64_BYTES_PER_ELEMENT) : 0, offset = floatLength * FLOAT64_BYTES_PER_ELEMENT, result = new ArrayBuffer(byteLength);
                    if (floatLength) {
                        var view = new Float64Array(result, 0, floatLength);
                        view.set(new Float64Array(buffer, 0, floatLength));
                    }
                    if (byteLength != offset) {
                        view = new Uint8Array(result, offset);
                        view.set(new Uint8Array(buffer, offset));
                    }
                    return result;
                };
            }
            module.exports = bufferClone;
        },
        function (module, exports) {
            var bindCallback = _require(37), isIterateeCall = _require(44);
            function createAssigner(assigner) {
                return function () {
                    var length = arguments.length, object = arguments[0];
                    if (length < 2 || object == null) {
                        return object;
                    }
                    if (length > 3 && isIterateeCall(arguments[1], arguments[2], arguments[3])) {
                        length = 2;
                    }
                    if (length > 3 && typeof arguments[length - 2] == 'function') {
                        var customizer = bindCallback(arguments[--length - 1], arguments[length--], 5);
                    } else if (length > 2 && typeof arguments[length - 1] == 'function') {
                        customizer = arguments[--length];
                    }
                    var index = 0;
                    while (++index < length) {
                        var source = arguments[index];
                        if (source) {
                            assigner(object, source, customizer);
                        }
                    }
                    return object;
                };
            }
            module.exports = createAssigner;
        },
        function (module, exports) {
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function initCloneArray(array) {
                var length = array.length, result = new array.constructor(length);
                if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
                    result.index = array.index;
                    result.input = array.input;
                }
                return result;
            }
            module.exports = initCloneArray;
        },
        function (module, exports) {
            var bufferClone = _require(38);
            var boolTag = '[object Boolean]', dateTag = '[object Date]', numberTag = '[object Number]', regexpTag = '[object RegExp]', stringTag = '[object String]';
            var arrayBufferTag = '[object ArrayBuffer]', float32Tag = '[object Float32Array]', float64Tag = '[object Float64Array]', int8Tag = '[object Int8Array]', int16Tag = '[object Int16Array]', int32Tag = '[object Int32Array]', uint8Tag = '[object Uint8Array]', uint8ClampedTag = '[object Uint8ClampedArray]', uint16Tag = '[object Uint16Array]', uint32Tag = '[object Uint32Array]';
            var reFlags = /\w*$/;
            function initCloneByTag(object, tag, isDeep) {
                var Ctor = object.constructor;
                switch (tag) {
                case arrayBufferTag:
                    return bufferClone(object);
                case boolTag:
                case dateTag:
                    return new Ctor(+object);
                case float32Tag:
                case float64Tag:
                case int8Tag:
                case int16Tag:
                case int32Tag:
                case uint8Tag:
                case uint8ClampedTag:
                case uint16Tag:
                case uint32Tag:
                    var buffer = object.buffer;
                    return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);
                case numberTag:
                case stringTag:
                    return new Ctor(object);
                case regexpTag:
                    var result = new Ctor(object.source, reFlags.exec(object));
                    result.lastIndex = object.lastIndex;
                }
                return result;
            }
            module.exports = initCloneByTag;
        },
        function (module, exports) {
            function initCloneObject(object) {
                var Ctor = object.constructor;
                if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
                    Ctor = Object;
                }
                return new Ctor();
            }
            module.exports = initCloneObject;
        },
        function (module, exports) {
            var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
            function isIndex(value, length) {
                value = +value;
                length = length == null ? MAX_SAFE_INTEGER : length;
                return value > -1 && value % 1 == 0 && value < length;
            }
            module.exports = isIndex;
        },
        function (module, exports) {
            var isIndex = _require(43), isLength = _require(45), isObject = _require(53);
            function isIterateeCall(value, index, object) {
                if (!isObject(object)) {
                    return false;
                }
                var type = typeof index;
                if (type == 'number') {
                    var length = object.length, prereq = isLength(length) && isIndex(index, length);
                } else {
                    prereq = type == 'string' && index in object;
                }
                var other = object[index];
                return prereq && (value === value ? value === other : other !== other);
            }
            module.exports = isIterateeCall;
        },
        function (module, exports) {
            var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
            function isLength(value) {
                return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
            }
            module.exports = isLength;
        },
        function (module, exports) {
            function isObjectLike(value) {
                return value && typeof value == 'object' || false;
            }
            module.exports = isObjectLike;
        },
        function (module, exports) {
            var isArguments = _require(50), isArray = _require(51), isIndex = _require(43), isLength = _require(45), keysIn = _require(58), support = _require(60);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function shimKeys(object) {
                var props = keysIn(object), propsLength = props.length, length = propsLength && object.length;
                var allowIndexes = length && isLength(length) && (isArray(object) || support.nonEnumArgs && isArguments(object));
                var index = -1, result = [];
                while (++index < propsLength) {
                    var key = props[index];
                    if (allowIndexes && isIndex(key, length) || hasOwnProperty.call(object, key)) {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = shimKeys;
        },
        function (module, exports) {
            var isObject = _require(53);
            function toObject(value) {
                return isObject(value) ? value : Object(value);
            }
            module.exports = toObject;
        },
        function (module, exports) {
            var baseClone = _require(32), bindCallback = _require(37), isIterateeCall = _require(44);
            function clone(value, isDeep, customizer, thisArg) {
                if (isDeep && typeof isDeep != 'boolean' && isIterateeCall(value, isDeep, customizer)) {
                    isDeep = false;
                } else if (typeof isDeep == 'function') {
                    thisArg = customizer;
                    customizer = isDeep;
                    isDeep = false;
                }
                customizer = typeof customizer == 'function' && bindCallback(customizer, thisArg, 1);
                return baseClone(value, isDeep, customizer);
            }
            module.exports = clone;
        },
        function (module, exports) {
            var isLength = _require(45), isObjectLike = _require(46);
            var argsTag = '[object Arguments]';
            var objectProto = Object.prototype;
            var objToString = objectProto.toString;
            function isArguments(value) {
                var length = isObjectLike(value) ? value.length : undefined;
                return isLength(length) && objToString.call(value) == argsTag || false;
            }
            module.exports = isArguments;
        },
        function (module, exports) {
            var isLength = _require(45), isNative = _require(52), isObjectLike = _require(46);
            var arrayTag = '[object Array]';
            var objectProto = Object.prototype;
            var objToString = objectProto.toString;
            var nativeIsArray = isNative(nativeIsArray = Array.isArray) && nativeIsArray;
            var isArray = nativeIsArray || function (value) {
                    return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag || false;
                };
            module.exports = isArray;
        },
        function (module, exports) {
            var escapeRegExp = _require(59), isObjectLike = _require(46);
            var funcTag = '[object Function]';
            var reHostCtor = /^\[object .+?Constructor\]$/;
            var objectProto = Object.prototype;
            var fnToString = Function.prototype.toString;
            var objToString = objectProto.toString;
            var reNative = RegExp('^' + escapeRegExp(objToString).replace(/toString|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');
            function isNative(value) {
                if (value == null) {
                    return false;
                }
                if (objToString.call(value) == funcTag) {
                    return reNative.test(fnToString.call(value));
                }
                return isObjectLike(value) && reHostCtor.test(value) || false;
            }
            module.exports = isNative;
        },
        function (module, exports) {
            function isObject(value) {
                var type = typeof value;
                return type == 'function' || value && type == 'object' || false;
            }
            module.exports = isObject;
        },
        function (module, exports) {
            var baseAssign = _require(31), createAssigner = _require(39);
            var assign = createAssigner(baseAssign);
            module.exports = assign;
        },
        function (module, exports) {
            var arrayCopy = _require(28), assign = _require(54), assignDefaults = _require(30);
            function defaults(object) {
                if (object == null) {
                    return object;
                }
                var args = arrayCopy(arguments);
                args.push(assignDefaults);
                return assign.apply(undefined, args);
            }
            module.exports = defaults;
        },
        function (module, exports) {
            module.exports = _require(54);
        },
        function (module, exports) {
            var isLength = _require(45), isNative = _require(52), isObject = _require(53), shimKeys = _require(47);
            var nativeKeys = isNative(nativeKeys = Object.keys) && nativeKeys;
            var keys = !nativeKeys ? shimKeys : function (object) {
                    if (object) {
                        var Ctor = object.constructor, length = object.length;
                    }
                    if (typeof Ctor == 'function' && Ctor.prototype === object || typeof object != 'function' && (length && isLength(length))) {
                        return shimKeys(object);
                    }
                    return isObject(object) ? nativeKeys(object) : [];
                };
            module.exports = keys;
        },
        function (module, exports) {
            var isArguments = _require(50), isArray = _require(51), isIndex = _require(43), isLength = _require(45), isObject = _require(53), support = _require(60);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function keysIn(object) {
                if (object == null) {
                    return [];
                }
                if (!isObject(object)) {
                    object = Object(object);
                }
                var length = object.length;
                length = length && isLength(length) && (isArray(object) || support.nonEnumArgs && isArguments(object)) && length || 0;
                var Ctor = object.constructor, index = -1, isProto = typeof Ctor == 'function' && Ctor.prototype === object, result = Array(length), skipIndexes = length > 0;
                while (++index < length) {
                    result[index] = index + '';
                }
                for (var key in object) {
                    if (!(skipIndexes && isIndex(key, length)) && !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = keysIn;
        },
        function (module, exports) {
            var baseToString = _require(36);
            var reRegExpChars = /[.*+?^${}()|[\]\/\\]/g, reHasRegExpChars = RegExp(reRegExpChars.source);
            function escapeRegExp(string) {
                string = baseToString(string);
                return string && reHasRegExpChars.test(string) ? string.replace(reRegExpChars, '\\$&') : string;
            }
            module.exports = escapeRegExp;
        },
        function (module, exports) {
            var isNative = _require(52);
            var reThis = /\bthis\b/;
            var objectProto = Object.prototype;
            var document = (document = global.window) && document.document;
            var propertyIsEnumerable = objectProto.propertyIsEnumerable;
            var support = {};
            (function (x) {
                support.funcDecomp = !isNative(global.WinRTError) && reThis.test(function () {
                    return this;
                });
                support.funcNames = typeof Function.name == 'string';
                try {
                    support.dom = document.createDocumentFragment().nodeType === 11;
                } catch (e) {
                    support.dom = false;
                }
                try {
                    support.nonEnumArgs = !propertyIsEnumerable.call(arguments, 1);
                } catch (e) {
                    support.nonEnumArgs = true;
                }
            }(0, 0));
            module.exports = support;
        },
        function (module, exports) {
            function constant(value) {
                return function () {
                    return value;
                };
            }
            module.exports = constant;
        },
        function (module, exports) {
            function identity(value) {
                return value;
            }
            module.exports = identity;
        },
        function (module, exports) {
            (function () {
                var getNanoSeconds, hrtime, loadTime;
                if (typeof performance !== 'undefined' && performance !== null && performance.now) {
                    module.exports = function () {
                        return performance.now();
                    };
                } else if (typeof process !== 'undefined' && process !== null && process.hrtime) {
                    module.exports = function () {
                        return (getNanoSeconds() - loadTime) / 1000000;
                    };
                    hrtime = process.hrtime;
                    getNanoSeconds = function () {
                        var hr;
                        hr = hrtime();
                        return hr[0] * 1000000000 + hr[1];
                    };
                    loadTime = getNanoSeconds();
                } else if (Date.now) {
                    module.exports = function () {
                        return Date.now() - loadTime;
                    };
                    loadTime = Date.now();
                } else {
                    module.exports = function () {
                        return new Date().getTime() - loadTime;
                    };
                    loadTime = new Date().getTime();
                }
            }.call(this));
        }
    ];
    return _require(7);
}));
//# sourceMappingURL=futoin-executor.js.map