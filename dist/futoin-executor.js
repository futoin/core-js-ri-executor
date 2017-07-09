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
            var _clone = _require(135);
            var _zipObject = _require(154);
            var _defaults = _require(137);
            var async_steps = _require(25);
            var performance_now = _require(155);
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
                        options = options || {};
                        if (!('sendOnBehalfOf' in options)) {
                            options.sendOnBehalfOf = false;
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
            var _extend = _require(139);
            var _defaults = _require(137);
            var invoker = _require(26);
            var FutoInError = invoker.FutoInError;
            var async_steps = _require(25);
            var ee = _require(24);
            var _clone = _require(135);
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
                            _this.emit('notExpected', err, as.state.error_info, as.state.last_exception);
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
                                _this.emit('notExpected', err, as.state.error_info, as.state.last_exception);
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
                                _this.emit('notExpected', err, error_info, as.state.last_exception);
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
                    _stepReqinfoUser: function (as, reqinfo_info, authrsp) {
                        var obf = reqinfo_info.RAW_REQUEST.obf;
                        if (obf && authrsp.seclvl === RequestInfo.SL_SYSTEM) {
                            reqinfo_info.SECURITY_LEVEL = obf.slvl;
                            reqinfo_info.USER_INFO = new UserInfo(this._ccm, obf.lid, obf.gid, null);
                        } else {
                            reqinfo_info.SECURITY_LEVEL = authrsp.seclvl;
                            reqinfo_info.USER_INFO = new UserInfo(this._ccm, authrsp.local_id, authrsp.global_id, authrsp.details);
                        }
                    },
                    _checkBasicAuth: function (as, reqinfo, sec) {
                        var _this = this;
                        as.add(function (as) {
                            var basicauth = _this._ccm.iface('#basicauth');
                            var reqinfo_info = reqinfo.info;
                            if (reqinfo_info.RAW_REQUEST.obf && reqinfo.info.CHANNEL_CONTEXT.type() === 'INTERNAL') {
                                _this._stepReqinfoUser(as, reqinfo_info, { seclvl: RequestInfo.SL_SYSTEM });
                            } else {
                                basicauth.call(as, 'auth', {
                                    user: sec[0],
                                    pwd: sec[1],
                                    client_addr: reqinfo_info.CLIENT_ADDR.asString(),
                                    is_secure: reqinfo_info.SECURE_CHANNEL
                                });
                                as.add(function (as, rsp) {
                                    _this._stepReqinfoUser(as, reqinfo_info, rsp);
                                });
                            }
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
                                _this._stepReqinfoUser(as, reqinfo_info, rsp);
                                reqinfo_info._hmac_algo = algo;
                                reqinfo_info._hmac_user = user;
                            });
                        }, function (as, err) {
                            void err;
                            as.error(FutoInError.SecurityError, 'Signature Verification Failed');
                        });
                    },
                    _seclvl_list: [
                        'Anonymous',
                        'Info',
                        'SafeOps',
                        'PrivilegedOps',
                        'ExceptionalOps',
                        'ExceptionalOps',
                        'System'
                    ],
                    _checkConstraints: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var constraints = reqinfo_info._iface_info.constraints;
                        var finfo = reqinfo_info._func_info;
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
                        if (finfo.seclvl) {
                            var finfo_index = this._seclvl_list.indexOf(finfo.seclvl);
                            var current_index = this._seclvl_list.indexOf(reqinfo_info.SECURITY_LEVEL);
                            if (finfo_index < 0 || current_index < finfo_index) {
                                as.error(FutoInError.PleaseReauth, finfo.seclvl);
                            }
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
            var _extend = _require(139);
            var performance_now = _require(155);
            var async_steps = _require(25);
            var RequestInfoConst = {
                    SL_ANONYMOUS: 'Anonymous',
                    SL_INFO: 'Info',
                    SL_SAFE_OPS: 'SafeOps',
                    SL_SAFEOPS: 'SafeOps',
                    SL_PRIVILEGED_OPS: 'PrivilegedOps',
                    SL_EXCEPTIONAL_OPS: 'ExceptionalOps',
                    SL_SYSTEM: 'System',
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
            var _extend = _require(139);
            var UserInfoConst = {
                    INFO_Login: 'Login',
                    INFO_Nick: 'Nick',
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
                var basic_auth = this._ccm.iface('#basicauth');
                basic_auth.call(as, 'getUserDetails', {
                    local_id: this._local_id,
                    fields: user_field_identifiers || {}
                });
                as.add(function (as, rsp) {
                    var user_details = rsp.details;
                    basic_auth._details = user_details;
                    as.success(user_details);
                });
                return as;
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
            var isNode = _require(10);
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
            'use strict';
            var assign = _require(11), normalizeOpts = _require(18), isCallable = _require(14), contains = _require(21), d;
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
            module.exports = false;
            try {
                module.exports = Object.prototype.toString.call(global.process) === '[object process]';
            } catch (e) {
            }
        },
        function (module, exports) {
            'use strict';
            module.exports = _require(12)() ? Object.assign : _require(13);
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
            var keys = _require(15), value = _require(20), max = Math.max;
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
            module.exports = _require(16)() ? Object.keys : _require(17);
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
            module.exports = _require(22)() ? String.prototype.contains : _require(23);
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
            'use strict';
            var d = _require(9), callable = _require(19), apply = Function.prototype.apply, call = Function.prototype.call, create = Object.create, defineProperty = Object.defineProperty, defineProperties = Object.defineProperties, hasOwnProperty = Object.prototype.hasOwnProperty, descriptor = {
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
            module.exports = __external_$as;
        },
        function (module, exports) {
            module.exports = __external_FutoInInvoker;
        },
        function (module, exports) {
            var getNative = _require(85), root = _require(123);
            var DataView = getNative(root, 'DataView');
            module.exports = DataView;
        },
        function (module, exports) {
            var hashClear = _require(92), hashDelete = _require(93), hashGet = _require(94), hashHas = _require(95), hashSet = _require(96);
            function Hash(entries) {
                var index = -1, length = entries == null ? 0 : entries.length;
                this.clear();
                while (++index < length) {
                    var entry = entries[index];
                    this.set(entry[0], entry[1]);
                }
            }
            Hash.prototype.clear = hashClear;
            Hash.prototype['delete'] = hashDelete;
            Hash.prototype.get = hashGet;
            Hash.prototype.has = hashHas;
            Hash.prototype.set = hashSet;
            module.exports = Hash;
        },
        function (module, exports) {
            var listCacheClear = _require(105), listCacheDelete = _require(106), listCacheGet = _require(107), listCacheHas = _require(108), listCacheSet = _require(109);
            function ListCache(entries) {
                var index = -1, length = entries == null ? 0 : entries.length;
                this.clear();
                while (++index < length) {
                    var entry = entries[index];
                    this.set(entry[0], entry[1]);
                }
            }
            ListCache.prototype.clear = listCacheClear;
            ListCache.prototype['delete'] = listCacheDelete;
            ListCache.prototype.get = listCacheGet;
            ListCache.prototype.has = listCacheHas;
            ListCache.prototype.set = listCacheSet;
            module.exports = ListCache;
        },
        function (module, exports) {
            var getNative = _require(85), root = _require(123);
            var Map = getNative(root, 'Map');
            module.exports = Map;
        },
        function (module, exports) {
            var mapCacheClear = _require(110), mapCacheDelete = _require(111), mapCacheGet = _require(112), mapCacheHas = _require(113), mapCacheSet = _require(114);
            function MapCache(entries) {
                var index = -1, length = entries == null ? 0 : entries.length;
                this.clear();
                while (++index < length) {
                    var entry = entries[index];
                    this.set(entry[0], entry[1]);
                }
            }
            MapCache.prototype.clear = mapCacheClear;
            MapCache.prototype['delete'] = mapCacheDelete;
            MapCache.prototype.get = mapCacheGet;
            MapCache.prototype.has = mapCacheHas;
            MapCache.prototype.set = mapCacheSet;
            module.exports = MapCache;
        },
        function (module, exports) {
            var getNative = _require(85), root = _require(123);
            var Promise = getNative(root, 'Promise');
            module.exports = Promise;
        },
        function (module, exports) {
            var getNative = _require(85), root = _require(123);
            var Set = getNative(root, 'Set');
            module.exports = Set;
        },
        function (module, exports) {
            var ListCache = _require(29), stackClear = _require(127), stackDelete = _require(128), stackGet = _require(129), stackHas = _require(130), stackSet = _require(131);
            function Stack(entries) {
                var data = this.__data__ = new ListCache(entries);
                this.size = data.size;
            }
            Stack.prototype.clear = stackClear;
            Stack.prototype['delete'] = stackDelete;
            Stack.prototype.get = stackGet;
            Stack.prototype.has = stackHas;
            Stack.prototype.set = stackSet;
            module.exports = Stack;
        },
        function (module, exports) {
            var root = _require(123);
            var Symbol = root.Symbol;
            module.exports = Symbol;
        },
        function (module, exports) {
            var root = _require(123);
            var Uint8Array = root.Uint8Array;
            module.exports = Uint8Array;
        },
        function (module, exports) {
            var getNative = _require(85), root = _require(123);
            var WeakMap = getNative(root, 'WeakMap');
            module.exports = WeakMap;
        },
        function (module, exports) {
            function addMapEntry(map, pair) {
                map.set(pair[0], pair[1]);
                return map;
            }
            module.exports = addMapEntry;
        },
        function (module, exports) {
            function addSetEntry(set, value) {
                set.add(value);
                return set;
            }
            module.exports = addSetEntry;
        },
        function (module, exports) {
            function apply(func, thisArg, args) {
                switch (args.length) {
                case 0:
                    return func.call(thisArg);
                case 1:
                    return func.call(thisArg, args[0]);
                case 2:
                    return func.call(thisArg, args[0], args[1]);
                case 3:
                    return func.call(thisArg, args[0], args[1], args[2]);
                }
                return func.apply(thisArg, args);
            }
            module.exports = apply;
        },
        function (module, exports) {
            function arrayEach(array, iteratee) {
                var index = -1, length = array == null ? 0 : array.length;
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
            function arrayFilter(array, predicate) {
                var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
                while (++index < length) {
                    var value = array[index];
                    if (predicate(value, index, array)) {
                        result[resIndex++] = value;
                    }
                }
                return result;
            }
            module.exports = arrayFilter;
        },
        function (module, exports) {
            var baseTimes = _require(62), isArguments = _require(141), isArray = _require(142), isBuffer = _require(144), isIndex = _require(100), isTypedArray = _require(149);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function arrayLikeKeys(value, inherited) {
                var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
                for (var key in value) {
                    if ((inherited || hasOwnProperty.call(value, key)) && !(skipIndexes && (key == 'length' || isBuff && (key == 'offset' || key == 'parent') || isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset') || isIndex(key, length)))) {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = arrayLikeKeys;
        },
        function (module, exports) {
            function arrayPush(array, values) {
                var index = -1, length = values.length, offset = array.length;
                while (++index < length) {
                    array[offset + index] = values[index];
                }
                return array;
            }
            module.exports = arrayPush;
        },
        function (module, exports) {
            function arrayReduce(array, iteratee, accumulator, initAccum) {
                var index = -1, length = array == null ? 0 : array.length;
                if (initAccum && length) {
                    accumulator = array[++index];
                }
                while (++index < length) {
                    accumulator = iteratee(accumulator, array[index], index, array);
                }
                return accumulator;
            }
            module.exports = arrayReduce;
        },
        function (module, exports) {
            var baseAssignValue = _require(50), eq = _require(138);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function assignValue(object, key, value) {
                var objValue = object[key];
                if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) || value === undefined && !(key in object)) {
                    baseAssignValue(object, key, value);
                }
            }
            module.exports = assignValue;
        },
        function (module, exports) {
            var eq = _require(138);
            function assocIndexOf(array, key) {
                var length = array.length;
                while (length--) {
                    if (eq(array[length][0], key)) {
                        return length;
                    }
                }
                return -1;
            }
            module.exports = assocIndexOf;
        },
        function (module, exports) {
            var copyObject = _require(74), keys = _require(150);
            function baseAssign(object, source) {
                return object && copyObject(source, keys(source), object);
            }
            module.exports = baseAssign;
        },
        function (module, exports) {
            var copyObject = _require(74), keysIn = _require(151);
            function baseAssignIn(object, source) {
                return object && copyObject(source, keysIn(source), object);
            }
            module.exports = baseAssignIn;
        },
        function (module, exports) {
            var defineProperty = _require(80);
            function baseAssignValue(object, key, value) {
                if (key == '__proto__' && defineProperty) {
                    defineProperty(object, key, {
                        'configurable': true,
                        'enumerable': true,
                        'value': value,
                        'writable': true
                    });
                } else {
                    object[key] = value;
                }
            }
            module.exports = baseAssignValue;
        },
        function (module, exports) {
            var Stack = _require(34), arrayEach = _require(41), assignValue = _require(46), baseAssign = _require(48), baseAssignIn = _require(49), cloneBuffer = _require(66), copyArray = _require(73), copySymbols = _require(75), copySymbolsIn = _require(76), getAllKeys = _require(82), getAllKeysIn = _require(83), getTag = _require(90), initCloneArray = _require(97), initCloneByTag = _require(98), initCloneObject = _require(99), isArray = _require(142), isBuffer = _require(144), isObject = _require(147), keys = _require(150);
            var CLONE_DEEP_FLAG = 1, CLONE_FLAT_FLAG = 2, CLONE_SYMBOLS_FLAG = 4;
            var argsTag = '[object Arguments]', arrayTag = '[object Array]', boolTag = '[object Boolean]', dateTag = '[object Date]', errorTag = '[object Error]', funcTag = '[object Function]', genTag = '[object GeneratorFunction]', mapTag = '[object Map]', numberTag = '[object Number]', objectTag = '[object Object]', regexpTag = '[object RegExp]', setTag = '[object Set]', stringTag = '[object String]', symbolTag = '[object Symbol]', weakMapTag = '[object WeakMap]';
            var arrayBufferTag = '[object ArrayBuffer]', dataViewTag = '[object DataView]', float32Tag = '[object Float32Array]', float64Tag = '[object Float64Array]', int8Tag = '[object Int8Array]', int16Tag = '[object Int16Array]', int32Tag = '[object Int32Array]', uint8Tag = '[object Uint8Array]', uint8ClampedTag = '[object Uint8ClampedArray]', uint16Tag = '[object Uint16Array]', uint32Tag = '[object Uint32Array]';
            var cloneableTags = {};
            cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
            cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
            function baseClone(value, bitmask, customizer, key, object, stack) {
                var result, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
                if (customizer) {
                    result = object ? customizer(value, key, object, stack) : customizer(value);
                }
                if (result !== undefined) {
                    return result;
                }
                if (!isObject(value)) {
                    return value;
                }
                var isArr = isArray(value);
                if (isArr) {
                    result = initCloneArray(value);
                    if (!isDeep) {
                        return copyArray(value, result);
                    }
                } else {
                    var tag = getTag(value), isFunc = tag == funcTag || tag == genTag;
                    if (isBuffer(value)) {
                        return cloneBuffer(value, isDeep);
                    }
                    if (tag == objectTag || tag == argsTag || isFunc && !object) {
                        result = isFlat || isFunc ? {} : initCloneObject(value);
                        if (!isDeep) {
                            return isFlat ? copySymbolsIn(value, baseAssignIn(result, value)) : copySymbols(value, baseAssign(result, value));
                        }
                    } else {
                        if (!cloneableTags[tag]) {
                            return object ? value : {};
                        }
                        result = initCloneByTag(value, tag, baseClone, isDeep);
                    }
                }
                stack || (stack = new Stack());
                var stacked = stack.get(value);
                if (stacked) {
                    return stacked;
                }
                stack.set(value, result);
                var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
                var props = isArr ? undefined : keysFunc(value);
                arrayEach(props || value, function (subValue, key) {
                    if (props) {
                        key = subValue;
                        subValue = value[key];
                    }
                    assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
                });
                return result;
            }
            module.exports = baseClone;
        },
        function (module, exports) {
            var isObject = _require(147);
            var objectCreate = Object.create;
            var baseCreate = function () {
                    function object() {
                    }
                    return function (proto) {
                        if (!isObject(proto)) {
                            return {};
                        }
                        if (objectCreate) {
                            return objectCreate(proto);
                        }
                        object.prototype = proto;
                        var result = new object();
                        object.prototype = undefined;
                        return result;
                    };
                }();
            module.exports = baseCreate;
        },
        function (module, exports) {
            var arrayPush = _require(44), isArray = _require(142);
            function baseGetAllKeys(object, keysFunc, symbolsFunc) {
                var result = keysFunc(object);
                return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
            }
            module.exports = baseGetAllKeys;
        },
        function (module, exports) {
            var Symbol = _require(35), getRawTag = _require(87), objectToString = _require(120);
            var nullTag = '[object Null]', undefinedTag = '[object Undefined]';
            var symToStringTag = Symbol ? Symbol.toStringTag : undefined;
            function baseGetTag(value) {
                if (value == null) {
                    return value === undefined ? undefinedTag : nullTag;
                }
                return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
            }
            module.exports = baseGetTag;
        },
        function (module, exports) {
            var baseGetTag = _require(54), isObjectLike = _require(148);
            var argsTag = '[object Arguments]';
            function baseIsArguments(value) {
                return isObjectLike(value) && baseGetTag(value) == argsTag;
            }
            module.exports = baseIsArguments;
        },
        function (module, exports) {
            var isFunction = _require(145), isMasked = _require(103), isObject = _require(147), toSource = _require(132);
            var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
            var reIsHostCtor = /^\[object .+?Constructor\]$/;
            var funcProto = Function.prototype, objectProto = Object.prototype;
            var funcToString = funcProto.toString;
            var hasOwnProperty = objectProto.hasOwnProperty;
            var reIsNative = RegExp('^' + funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&').replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');
            function baseIsNative(value) {
                if (!isObject(value) || isMasked(value)) {
                    return false;
                }
                var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
                return pattern.test(toSource(value));
            }
            module.exports = baseIsNative;
        },
        function (module, exports) {
            var baseGetTag = _require(54), isLength = _require(146), isObjectLike = _require(148);
            var argsTag = '[object Arguments]', arrayTag = '[object Array]', boolTag = '[object Boolean]', dateTag = '[object Date]', errorTag = '[object Error]', funcTag = '[object Function]', mapTag = '[object Map]', numberTag = '[object Number]', objectTag = '[object Object]', regexpTag = '[object RegExp]', setTag = '[object Set]', stringTag = '[object String]', weakMapTag = '[object WeakMap]';
            var arrayBufferTag = '[object ArrayBuffer]', dataViewTag = '[object DataView]', float32Tag = '[object Float32Array]', float64Tag = '[object Float64Array]', int8Tag = '[object Int8Array]', int16Tag = '[object Int16Array]', int32Tag = '[object Int32Array]', uint8Tag = '[object Uint8Array]', uint8ClampedTag = '[object Uint8ClampedArray]', uint16Tag = '[object Uint16Array]', uint32Tag = '[object Uint32Array]';
            var typedArrayTags = {};
            typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
            typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
            function baseIsTypedArray(value) {
                return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
            }
            module.exports = baseIsTypedArray;
        },
        function (module, exports) {
            var isPrototype = _require(104), nativeKeys = _require(117);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function baseKeys(object) {
                if (!isPrototype(object)) {
                    return nativeKeys(object);
                }
                var result = [];
                for (var key in Object(object)) {
                    if (hasOwnProperty.call(object, key) && key != 'constructor') {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = baseKeys;
        },
        function (module, exports) {
            var isObject = _require(147), isPrototype = _require(104), nativeKeysIn = _require(118);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function baseKeysIn(object) {
                if (!isObject(object)) {
                    return nativeKeysIn(object);
                }
                var isProto = isPrototype(object), result = [];
                for (var key in object) {
                    if (!(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = baseKeysIn;
        },
        function (module, exports) {
            var identity = _require(140), overRest = _require(122), setToString = _require(125);
            function baseRest(func, start) {
                return setToString(overRest(func, start, identity), func + '');
            }
            module.exports = baseRest;
        },
        function (module, exports) {
            var constant = _require(136), defineProperty = _require(80), identity = _require(140);
            var baseSetToString = !defineProperty ? identity : function (func, string) {
                    return defineProperty(func, 'toString', {
                        'configurable': true,
                        'enumerable': false,
                        'value': constant(string),
                        'writable': true
                    });
                };
            module.exports = baseSetToString;
        },
        function (module, exports) {
            function baseTimes(n, iteratee) {
                var index = -1, result = Array(n);
                while (++index < n) {
                    result[index] = iteratee(index);
                }
                return result;
            }
            module.exports = baseTimes;
        },
        function (module, exports) {
            function baseUnary(func) {
                return function (value) {
                    return func(value);
                };
            }
            module.exports = baseUnary;
        },
        function (module, exports) {
            function baseZipObject(props, values, assignFunc) {
                var index = -1, length = props.length, valsLength = values.length, result = {};
                while (++index < length) {
                    var value = index < valsLength ? values[index] : undefined;
                    assignFunc(result, props[index], value);
                }
                return result;
            }
            module.exports = baseZipObject;
        },
        function (module, exports) {
            var Uint8Array = _require(36);
            function cloneArrayBuffer(arrayBuffer) {
                var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
                new Uint8Array(result).set(new Uint8Array(arrayBuffer));
                return result;
            }
            module.exports = cloneArrayBuffer;
        },
        function (module, exports) {
            var root = _require(123);
            var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;
            var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;
            var moduleExports = freeModule && freeModule.exports === freeExports;
            var Buffer = moduleExports ? root.Buffer : undefined, allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;
            function cloneBuffer(buffer, isDeep) {
                if (isDeep) {
                    return buffer.slice();
                }
                var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
                buffer.copy(result);
                return result;
            }
            module.exports = cloneBuffer;
        },
        function (module, exports) {
            var cloneArrayBuffer = _require(65);
            function cloneDataView(dataView, isDeep) {
                var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
                return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
            }
            module.exports = cloneDataView;
        },
        function (module, exports) {
            var addMapEntry = _require(38), arrayReduce = _require(45), mapToArray = _require(115);
            var CLONE_DEEP_FLAG = 1;
            function cloneMap(map, isDeep, cloneFunc) {
                var array = isDeep ? cloneFunc(mapToArray(map), CLONE_DEEP_FLAG) : mapToArray(map);
                return arrayReduce(array, addMapEntry, new map.constructor());
            }
            module.exports = cloneMap;
        },
        function (module, exports) {
            var reFlags = /\w*$/;
            function cloneRegExp(regexp) {
                var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
                result.lastIndex = regexp.lastIndex;
                return result;
            }
            module.exports = cloneRegExp;
        },
        function (module, exports) {
            var addSetEntry = _require(39), arrayReduce = _require(45), setToArray = _require(124);
            var CLONE_DEEP_FLAG = 1;
            function cloneSet(set, isDeep, cloneFunc) {
                var array = isDeep ? cloneFunc(setToArray(set), CLONE_DEEP_FLAG) : setToArray(set);
                return arrayReduce(array, addSetEntry, new set.constructor());
            }
            module.exports = cloneSet;
        },
        function (module, exports) {
            var Symbol = _require(35);
            var symbolProto = Symbol ? Symbol.prototype : undefined, symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;
            function cloneSymbol(symbol) {
                return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
            }
            module.exports = cloneSymbol;
        },
        function (module, exports) {
            var cloneArrayBuffer = _require(65);
            function cloneTypedArray(typedArray, isDeep) {
                var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
                return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
            }
            module.exports = cloneTypedArray;
        },
        function (module, exports) {
            function copyArray(source, array) {
                var index = -1, length = source.length;
                array || (array = Array(length));
                while (++index < length) {
                    array[index] = source[index];
                }
                return array;
            }
            module.exports = copyArray;
        },
        function (module, exports) {
            var assignValue = _require(46), baseAssignValue = _require(50);
            function copyObject(source, props, object, customizer) {
                var isNew = !object;
                object || (object = {});
                var index = -1, length = props.length;
                while (++index < length) {
                    var key = props[index];
                    var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined;
                    if (newValue === undefined) {
                        newValue = source[key];
                    }
                    if (isNew) {
                        baseAssignValue(object, key, newValue);
                    } else {
                        assignValue(object, key, newValue);
                    }
                }
                return object;
            }
            module.exports = copyObject;
        },
        function (module, exports) {
            var copyObject = _require(74), getSymbols = _require(88);
            function copySymbols(source, object) {
                return copyObject(source, getSymbols(source), object);
            }
            module.exports = copySymbols;
        },
        function (module, exports) {
            var copyObject = _require(74), getSymbolsIn = _require(89);
            function copySymbolsIn(source, object) {
                return copyObject(source, getSymbolsIn(source), object);
            }
            module.exports = copySymbolsIn;
        },
        function (module, exports) {
            var root = _require(123);
            var coreJsData = root['__core-js_shared__'];
            module.exports = coreJsData;
        },
        function (module, exports) {
            var baseRest = _require(60), isIterateeCall = _require(101);
            function createAssigner(assigner) {
                return baseRest(function (object, sources) {
                    var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : undefined, guard = length > 2 ? sources[2] : undefined;
                    customizer = assigner.length > 3 && typeof customizer == 'function' ? (length--, customizer) : undefined;
                    if (guard && isIterateeCall(sources[0], sources[1], guard)) {
                        customizer = length < 3 ? undefined : customizer;
                        length = 1;
                    }
                    object = Object(object);
                    while (++index < length) {
                        var source = sources[index];
                        if (source) {
                            assigner(object, source, index, customizer);
                        }
                    }
                    return object;
                });
            }
            module.exports = createAssigner;
        },
        function (module, exports) {
            var eq = _require(138);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function customDefaultsAssignIn(objValue, srcValue, key, object) {
                if (objValue === undefined || eq(objValue, objectProto[key]) && !hasOwnProperty.call(object, key)) {
                    return srcValue;
                }
                return objValue;
            }
            module.exports = customDefaultsAssignIn;
        },
        function (module, exports) {
            var getNative = _require(85);
            var defineProperty = function () {
                    try {
                        var func = getNative(Object, 'defineProperty');
                        func({}, '', {});
                        return func;
                    } catch (e) {
                    }
                }();
            module.exports = defineProperty;
        },
        function (module, exports) {
            var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;
            module.exports = freeGlobal;
        },
        function (module, exports) {
            var baseGetAllKeys = _require(53), getSymbols = _require(88), keys = _require(150);
            function getAllKeys(object) {
                return baseGetAllKeys(object, keys, getSymbols);
            }
            module.exports = getAllKeys;
        },
        function (module, exports) {
            var baseGetAllKeys = _require(53), getSymbolsIn = _require(89), keysIn = _require(151);
            function getAllKeysIn(object) {
                return baseGetAllKeys(object, keysIn, getSymbolsIn);
            }
            module.exports = getAllKeysIn;
        },
        function (module, exports) {
            var isKeyable = _require(102);
            function getMapData(map, key) {
                var data = map.__data__;
                return isKeyable(key) ? data[typeof key == 'string' ? 'string' : 'hash'] : data.map;
            }
            module.exports = getMapData;
        },
        function (module, exports) {
            var baseIsNative = _require(56), getValue = _require(91);
            function getNative(object, key) {
                var value = getValue(object, key);
                return baseIsNative(value) ? value : undefined;
            }
            module.exports = getNative;
        },
        function (module, exports) {
            var overArg = _require(121);
            var getPrototype = overArg(Object.getPrototypeOf, Object);
            module.exports = getPrototype;
        },
        function (module, exports) {
            var Symbol = _require(35);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            var nativeObjectToString = objectProto.toString;
            var symToStringTag = Symbol ? Symbol.toStringTag : undefined;
            function getRawTag(value) {
                var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
                try {
                    value[symToStringTag] = undefined;
                    var unmasked = true;
                } catch (e) {
                }
                var result = nativeObjectToString.call(value);
                if (unmasked) {
                    if (isOwn) {
                        value[symToStringTag] = tag;
                    } else {
                        delete value[symToStringTag];
                    }
                }
                return result;
            }
            module.exports = getRawTag;
        },
        function (module, exports) {
            var arrayFilter = _require(42), stubArray = _require(152);
            var objectProto = Object.prototype;
            var propertyIsEnumerable = objectProto.propertyIsEnumerable;
            var nativeGetSymbols = Object.getOwnPropertySymbols;
            var getSymbols = !nativeGetSymbols ? stubArray : function (object) {
                    if (object == null) {
                        return [];
                    }
                    object = Object(object);
                    return arrayFilter(nativeGetSymbols(object), function (symbol) {
                        return propertyIsEnumerable.call(object, symbol);
                    });
                };
            module.exports = getSymbols;
        },
        function (module, exports) {
            var arrayPush = _require(44), getPrototype = _require(86), getSymbols = _require(88), stubArray = _require(152);
            var nativeGetSymbols = Object.getOwnPropertySymbols;
            var getSymbolsIn = !nativeGetSymbols ? stubArray : function (object) {
                    var result = [];
                    while (object) {
                        arrayPush(result, getSymbols(object));
                        object = getPrototype(object);
                    }
                    return result;
                };
            module.exports = getSymbolsIn;
        },
        function (module, exports) {
            var DataView = _require(27), Map = _require(30), Promise = _require(32), Set = _require(33), WeakMap = _require(37), baseGetTag = _require(54), toSource = _require(132);
            var mapTag = '[object Map]', objectTag = '[object Object]', promiseTag = '[object Promise]', setTag = '[object Set]', weakMapTag = '[object WeakMap]';
            var dataViewTag = '[object DataView]';
            var dataViewCtorString = toSource(DataView), mapCtorString = toSource(Map), promiseCtorString = toSource(Promise), setCtorString = toSource(Set), weakMapCtorString = toSource(WeakMap);
            var getTag = baseGetTag;
            if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map && getTag(new Map()) != mapTag || Promise && getTag(Promise.resolve()) != promiseTag || Set && getTag(new Set()) != setTag || WeakMap && getTag(new WeakMap()) != weakMapTag) {
                getTag = function (value) {
                    var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : undefined, ctorString = Ctor ? toSource(Ctor) : '';
                    if (ctorString) {
                        switch (ctorString) {
                        case dataViewCtorString:
                            return dataViewTag;
                        case mapCtorString:
                            return mapTag;
                        case promiseCtorString:
                            return promiseTag;
                        case setCtorString:
                            return setTag;
                        case weakMapCtorString:
                            return weakMapTag;
                        }
                    }
                    return result;
                };
            }
            module.exports = getTag;
        },
        function (module, exports) {
            function getValue(object, key) {
                return object == null ? undefined : object[key];
            }
            module.exports = getValue;
        },
        function (module, exports) {
            var nativeCreate = _require(116);
            function hashClear() {
                this.__data__ = nativeCreate ? nativeCreate(null) : {};
                this.size = 0;
            }
            module.exports = hashClear;
        },
        function (module, exports) {
            function hashDelete(key) {
                var result = this.has(key) && delete this.__data__[key];
                this.size -= result ? 1 : 0;
                return result;
            }
            module.exports = hashDelete;
        },
        function (module, exports) {
            var nativeCreate = _require(116);
            var HASH_UNDEFINED = '__lodash_hash_undefined__';
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function hashGet(key) {
                var data = this.__data__;
                if (nativeCreate) {
                    var result = data[key];
                    return result === HASH_UNDEFINED ? undefined : result;
                }
                return hasOwnProperty.call(data, key) ? data[key] : undefined;
            }
            module.exports = hashGet;
        },
        function (module, exports) {
            var nativeCreate = _require(116);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function hashHas(key) {
                var data = this.__data__;
                return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
            }
            module.exports = hashHas;
        },
        function (module, exports) {
            var nativeCreate = _require(116);
            var HASH_UNDEFINED = '__lodash_hash_undefined__';
            function hashSet(key, value) {
                var data = this.__data__;
                this.size += this.has(key) ? 0 : 1;
                data[key] = nativeCreate && value === undefined ? HASH_UNDEFINED : value;
                return this;
            }
            module.exports = hashSet;
        },
        function (module, exports) {
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            function initCloneArray(array) {
                var length = array.length, result = array.constructor(length);
                if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
                    result.index = array.index;
                    result.input = array.input;
                }
                return result;
            }
            module.exports = initCloneArray;
        },
        function (module, exports) {
            var cloneArrayBuffer = _require(65), cloneDataView = _require(67), cloneMap = _require(68), cloneRegExp = _require(69), cloneSet = _require(70), cloneSymbol = _require(71), cloneTypedArray = _require(72);
            var boolTag = '[object Boolean]', dateTag = '[object Date]', mapTag = '[object Map]', numberTag = '[object Number]', regexpTag = '[object RegExp]', setTag = '[object Set]', stringTag = '[object String]', symbolTag = '[object Symbol]';
            var arrayBufferTag = '[object ArrayBuffer]', dataViewTag = '[object DataView]', float32Tag = '[object Float32Array]', float64Tag = '[object Float64Array]', int8Tag = '[object Int8Array]', int16Tag = '[object Int16Array]', int32Tag = '[object Int32Array]', uint8Tag = '[object Uint8Array]', uint8ClampedTag = '[object Uint8ClampedArray]', uint16Tag = '[object Uint16Array]', uint32Tag = '[object Uint32Array]';
            function initCloneByTag(object, tag, cloneFunc, isDeep) {
                var Ctor = object.constructor;
                switch (tag) {
                case arrayBufferTag:
                    return cloneArrayBuffer(object);
                case boolTag:
                case dateTag:
                    return new Ctor(+object);
                case dataViewTag:
                    return cloneDataView(object, isDeep);
                case float32Tag:
                case float64Tag:
                case int8Tag:
                case int16Tag:
                case int32Tag:
                case uint8Tag:
                case uint8ClampedTag:
                case uint16Tag:
                case uint32Tag:
                    return cloneTypedArray(object, isDeep);
                case mapTag:
                    return cloneMap(object, isDeep, cloneFunc);
                case numberTag:
                case stringTag:
                    return new Ctor(object);
                case regexpTag:
                    return cloneRegExp(object);
                case setTag:
                    return cloneSet(object, isDeep, cloneFunc);
                case symbolTag:
                    return cloneSymbol(object);
                }
            }
            module.exports = initCloneByTag;
        },
        function (module, exports) {
            var baseCreate = _require(52), getPrototype = _require(86), isPrototype = _require(104);
            function initCloneObject(object) {
                return typeof object.constructor == 'function' && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
            }
            module.exports = initCloneObject;
        },
        function (module, exports) {
            var MAX_SAFE_INTEGER = 9007199254740991;
            var reIsUint = /^(?:0|[1-9]\d*)$/;
            function isIndex(value, length) {
                length = length == null ? MAX_SAFE_INTEGER : length;
                return !!length && (typeof value == 'number' || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
            }
            module.exports = isIndex;
        },
        function (module, exports) {
            var eq = _require(138), isArrayLike = _require(143), isIndex = _require(100), isObject = _require(147);
            function isIterateeCall(value, index, object) {
                if (!isObject(object)) {
                    return false;
                }
                var type = typeof index;
                if (type == 'number' ? isArrayLike(object) && isIndex(index, object.length) : type == 'string' && index in object) {
                    return eq(object[index], value);
                }
                return false;
            }
            module.exports = isIterateeCall;
        },
        function (module, exports) {
            function isKeyable(value) {
                var type = typeof value;
                return type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean' ? value !== '__proto__' : value === null;
            }
            module.exports = isKeyable;
        },
        function (module, exports) {
            var coreJsData = _require(77);
            var maskSrcKey = function () {
                    var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
                    return uid ? 'Symbol(src)_1.' + uid : '';
                }();
            function isMasked(func) {
                return !!maskSrcKey && maskSrcKey in func;
            }
            module.exports = isMasked;
        },
        function (module, exports) {
            var objectProto = Object.prototype;
            function isPrototype(value) {
                var Ctor = value && value.constructor, proto = typeof Ctor == 'function' && Ctor.prototype || objectProto;
                return value === proto;
            }
            module.exports = isPrototype;
        },
        function (module, exports) {
            function listCacheClear() {
                this.__data__ = [];
                this.size = 0;
            }
            module.exports = listCacheClear;
        },
        function (module, exports) {
            var assocIndexOf = _require(47);
            var arrayProto = Array.prototype;
            var splice = arrayProto.splice;
            function listCacheDelete(key) {
                var data = this.__data__, index = assocIndexOf(data, key);
                if (index < 0) {
                    return false;
                }
                var lastIndex = data.length - 1;
                if (index == lastIndex) {
                    data.pop();
                } else {
                    splice.call(data, index, 1);
                }
                --this.size;
                return true;
            }
            module.exports = listCacheDelete;
        },
        function (module, exports) {
            var assocIndexOf = _require(47);
            function listCacheGet(key) {
                var data = this.__data__, index = assocIndexOf(data, key);
                return index < 0 ? undefined : data[index][1];
            }
            module.exports = listCacheGet;
        },
        function (module, exports) {
            var assocIndexOf = _require(47);
            function listCacheHas(key) {
                return assocIndexOf(this.__data__, key) > -1;
            }
            module.exports = listCacheHas;
        },
        function (module, exports) {
            var assocIndexOf = _require(47);
            function listCacheSet(key, value) {
                var data = this.__data__, index = assocIndexOf(data, key);
                if (index < 0) {
                    ++this.size;
                    data.push([
                        key,
                        value
                    ]);
                } else {
                    data[index][1] = value;
                }
                return this;
            }
            module.exports = listCacheSet;
        },
        function (module, exports) {
            var Hash = _require(28), ListCache = _require(29), Map = _require(30);
            function mapCacheClear() {
                this.size = 0;
                this.__data__ = {
                    'hash': new Hash(),
                    'map': new (Map || ListCache)(),
                    'string': new Hash()
                };
            }
            module.exports = mapCacheClear;
        },
        function (module, exports) {
            var getMapData = _require(84);
            function mapCacheDelete(key) {
                var result = getMapData(this, key)['delete'](key);
                this.size -= result ? 1 : 0;
                return result;
            }
            module.exports = mapCacheDelete;
        },
        function (module, exports) {
            var getMapData = _require(84);
            function mapCacheGet(key) {
                return getMapData(this, key).get(key);
            }
            module.exports = mapCacheGet;
        },
        function (module, exports) {
            var getMapData = _require(84);
            function mapCacheHas(key) {
                return getMapData(this, key).has(key);
            }
            module.exports = mapCacheHas;
        },
        function (module, exports) {
            var getMapData = _require(84);
            function mapCacheSet(key, value) {
                var data = getMapData(this, key), size = data.size;
                data.set(key, value);
                this.size += data.size == size ? 0 : 1;
                return this;
            }
            module.exports = mapCacheSet;
        },
        function (module, exports) {
            function mapToArray(map) {
                var index = -1, result = Array(map.size);
                map.forEach(function (value, key) {
                    result[++index] = [
                        key,
                        value
                    ];
                });
                return result;
            }
            module.exports = mapToArray;
        },
        function (module, exports) {
            var getNative = _require(85);
            var nativeCreate = getNative(Object, 'create');
            module.exports = nativeCreate;
        },
        function (module, exports) {
            var overArg = _require(121);
            var nativeKeys = overArg(Object.keys, Object);
            module.exports = nativeKeys;
        },
        function (module, exports) {
            function nativeKeysIn(object) {
                var result = [];
                if (object != null) {
                    for (var key in Object(object)) {
                        result.push(key);
                    }
                }
                return result;
            }
            module.exports = nativeKeysIn;
        },
        function (module, exports) {
            var freeGlobal = _require(81);
            var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;
            var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;
            var moduleExports = freeModule && freeModule.exports === freeExports;
            var freeProcess = moduleExports && freeGlobal.process;
            var nodeUtil = function () {
                    try {
                        return freeProcess && freeProcess.binding && freeProcess.binding('util');
                    } catch (e) {
                    }
                }();
            module.exports = nodeUtil;
        },
        function (module, exports) {
            var objectProto = Object.prototype;
            var nativeObjectToString = objectProto.toString;
            function objectToString(value) {
                return nativeObjectToString.call(value);
            }
            module.exports = objectToString;
        },
        function (module, exports) {
            function overArg(func, transform) {
                return function (arg) {
                    return func(transform(arg));
                };
            }
            module.exports = overArg;
        },
        function (module, exports) {
            var apply = _require(40);
            var nativeMax = Math.max;
            function overRest(func, start, transform) {
                start = nativeMax(start === undefined ? func.length - 1 : start, 0);
                return function () {
                    var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array(length);
                    while (++index < length) {
                        array[index] = args[start + index];
                    }
                    index = -1;
                    var otherArgs = Array(start + 1);
                    while (++index < start) {
                        otherArgs[index] = args[index];
                    }
                    otherArgs[start] = transform(array);
                    return apply(func, this, otherArgs);
                };
            }
            module.exports = overRest;
        },
        function (module, exports) {
            var freeGlobal = _require(81);
            var freeSelf = typeof self == 'object' && self && self.Object === Object && self;
            var root = freeGlobal || freeSelf || Function('return this')();
            module.exports = root;
        },
        function (module, exports) {
            function setToArray(set) {
                var index = -1, result = Array(set.size);
                set.forEach(function (value) {
                    result[++index] = value;
                });
                return result;
            }
            module.exports = setToArray;
        },
        function (module, exports) {
            var baseSetToString = _require(61), shortOut = _require(126);
            var setToString = shortOut(baseSetToString);
            module.exports = setToString;
        },
        function (module, exports) {
            var HOT_COUNT = 800, HOT_SPAN = 16;
            var nativeNow = Date.now;
            function shortOut(func) {
                var count = 0, lastCalled = 0;
                return function () {
                    var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
                    lastCalled = stamp;
                    if (remaining > 0) {
                        if (++count >= HOT_COUNT) {
                            return arguments[0];
                        }
                    } else {
                        count = 0;
                    }
                    return func.apply(undefined, arguments);
                };
            }
            module.exports = shortOut;
        },
        function (module, exports) {
            var ListCache = _require(29);
            function stackClear() {
                this.__data__ = new ListCache();
                this.size = 0;
            }
            module.exports = stackClear;
        },
        function (module, exports) {
            function stackDelete(key) {
                var data = this.__data__, result = data['delete'](key);
                this.size = data.size;
                return result;
            }
            module.exports = stackDelete;
        },
        function (module, exports) {
            function stackGet(key) {
                return this.__data__.get(key);
            }
            module.exports = stackGet;
        },
        function (module, exports) {
            function stackHas(key) {
                return this.__data__.has(key);
            }
            module.exports = stackHas;
        },
        function (module, exports) {
            var ListCache = _require(29), Map = _require(30), MapCache = _require(31);
            var LARGE_ARRAY_SIZE = 200;
            function stackSet(key, value) {
                var data = this.__data__;
                if (data instanceof ListCache) {
                    var pairs = data.__data__;
                    if (!Map || pairs.length < LARGE_ARRAY_SIZE - 1) {
                        pairs.push([
                            key,
                            value
                        ]);
                        this.size = ++data.size;
                        return this;
                    }
                    data = this.__data__ = new MapCache(pairs);
                }
                data.set(key, value);
                this.size = data.size;
                return this;
            }
            module.exports = stackSet;
        },
        function (module, exports) {
            var funcProto = Function.prototype;
            var funcToString = funcProto.toString;
            function toSource(func) {
                if (func != null) {
                    try {
                        return funcToString.call(func);
                    } catch (e) {
                    }
                    try {
                        return func + '';
                    } catch (e) {
                    }
                }
                return '';
            }
            module.exports = toSource;
        },
        function (module, exports) {
            var copyObject = _require(74), createAssigner = _require(78), keysIn = _require(151);
            var assignIn = createAssigner(function (object, source) {
                    copyObject(source, keysIn(source), object);
                });
            module.exports = assignIn;
        },
        function (module, exports) {
            var copyObject = _require(74), createAssigner = _require(78), keysIn = _require(151);
            var assignInWith = createAssigner(function (object, source, srcIndex, customizer) {
                    copyObject(source, keysIn(source), object, customizer);
                });
            module.exports = assignInWith;
        },
        function (module, exports) {
            var baseClone = _require(51);
            var CLONE_SYMBOLS_FLAG = 4;
            function clone(value) {
                return baseClone(value, CLONE_SYMBOLS_FLAG);
            }
            module.exports = clone;
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
            var apply = _require(40), assignInWith = _require(134), baseRest = _require(60), customDefaultsAssignIn = _require(79);
            var defaults = baseRest(function (args) {
                    args.push(undefined, customDefaultsAssignIn);
                    return apply(assignInWith, undefined, args);
                });
            module.exports = defaults;
        },
        function (module, exports) {
            function eq(value, other) {
                return value === other || value !== value && other !== other;
            }
            module.exports = eq;
        },
        function (module, exports) {
            module.exports = _require(133);
        },
        function (module, exports) {
            function identity(value) {
                return value;
            }
            module.exports = identity;
        },
        function (module, exports) {
            var baseIsArguments = _require(55), isObjectLike = _require(148);
            var objectProto = Object.prototype;
            var hasOwnProperty = objectProto.hasOwnProperty;
            var propertyIsEnumerable = objectProto.propertyIsEnumerable;
            var isArguments = baseIsArguments(function () {
                    return arguments;
                }()) ? baseIsArguments : function (value) {
                    return isObjectLike(value) && hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
                };
            module.exports = isArguments;
        },
        function (module, exports) {
            var isArray = Array.isArray;
            module.exports = isArray;
        },
        function (module, exports) {
            var isFunction = _require(145), isLength = _require(146);
            function isArrayLike(value) {
                return value != null && isLength(value.length) && !isFunction(value);
            }
            module.exports = isArrayLike;
        },
        function (module, exports) {
            var root = _require(123), stubFalse = _require(153);
            var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;
            var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;
            var moduleExports = freeModule && freeModule.exports === freeExports;
            var Buffer = moduleExports ? root.Buffer : undefined;
            var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;
            var isBuffer = nativeIsBuffer || stubFalse;
            module.exports = isBuffer;
        },
        function (module, exports) {
            var baseGetTag = _require(54), isObject = _require(147);
            var asyncTag = '[object AsyncFunction]', funcTag = '[object Function]', genTag = '[object GeneratorFunction]', proxyTag = '[object Proxy]';
            function isFunction(value) {
                if (!isObject(value)) {
                    return false;
                }
                var tag = baseGetTag(value);
                return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
            }
            module.exports = isFunction;
        },
        function (module, exports) {
            var MAX_SAFE_INTEGER = 9007199254740991;
            function isLength(value) {
                return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
            }
            module.exports = isLength;
        },
        function (module, exports) {
            function isObject(value) {
                var type = typeof value;
                return value != null && (type == 'object' || type == 'function');
            }
            module.exports = isObject;
        },
        function (module, exports) {
            function isObjectLike(value) {
                return value != null && typeof value == 'object';
            }
            module.exports = isObjectLike;
        },
        function (module, exports) {
            var baseIsTypedArray = _require(57), baseUnary = _require(63), nodeUtil = _require(119);
            var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
            var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
            module.exports = isTypedArray;
        },
        function (module, exports) {
            var arrayLikeKeys = _require(43), baseKeys = _require(58), isArrayLike = _require(143);
            function keys(object) {
                return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
            }
            module.exports = keys;
        },
        function (module, exports) {
            var arrayLikeKeys = _require(43), baseKeysIn = _require(59), isArrayLike = _require(143);
            function keysIn(object) {
                return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
            }
            module.exports = keysIn;
        },
        function (module, exports) {
            function stubArray() {
                return [];
            }
            module.exports = stubArray;
        },
        function (module, exports) {
            function stubFalse() {
                return false;
            }
            module.exports = stubFalse;
        },
        function (module, exports) {
            var assignValue = _require(46), baseZipObject = _require(64);
            function zipObject(props, values) {
                return baseZipObject(props || [], values || [], assignValue);
            }
            module.exports = zipObject;
        },
        function (module, exports) {
            (function () {
                var getNanoSeconds, hrtime, loadTime, moduleLoadTime, nodeLoadTime, upTime;
                if (typeof performance !== 'undefined' && performance !== null && performance.now) {
                    module.exports = function () {
                        return performance.now();
                    };
                } else if (typeof process !== 'undefined' && process !== null && process.hrtime) {
                    module.exports = function () {
                        return (getNanoSeconds() - nodeLoadTime) / 1000000;
                    };
                    hrtime = process.hrtime;
                    getNanoSeconds = function () {
                        var hr;
                        hr = hrtime();
                        return hr[0] * 1000000000 + hr[1];
                    };
                    moduleLoadTime = getNanoSeconds();
                    upTime = process.uptime() * 1000000000;
                    nodeLoadTime = moduleLoadTime - upTime;
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