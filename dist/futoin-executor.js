(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            'futoin-asyncsteps',
            'futoin-invoker',
            'lodash'
        ], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('futoin-asyncsteps'), require('futoin-invoker'), require('lodash'));
    } else {
        this.FutoInExecutor = factory($as, FutoInInvoker, _);
    }
}(function (__external_$as, __external_FutoInInvoker, __external__) {
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
            (function (window) {
                'use strict';
                var futoin = window.FutoIn || {};
                if (typeof futoin.Executor === 'undefined') {
                    var executor_module = _require(3);
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
            var _ = _require(8);
            var executor = _require(2);
            var request = _require(4);
            var async_steps = _require(6);
            var performance_now = _require(9);
            var browser_window = window;
            var BrowserChannelContext = function (executor, event) {
                request.ChannelContext.call(this, executor);
                _.extend(this, BrowserChannelContextProto);
                this._event_origin = event.origin;
                this._event_source = event.source;
                this._last_used = performance_now();
                this._is_secure_channel = true;
            };
            var BrowserChannelContextProto = {};
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
            var BrowserExecutorConst = {
                    OPT_CONNECT_TIMEOUT: 'CONN_TIMEOUT',
                    OPT_ALLOWED_ORIGINS: 'ALLOWED_ORIGINS'
                };
            _.extend(BrowserExecutorConst, executor.ExecutorConst);
            var BrowserExecutor = function (ccm, opts) {
                executor.Executor.call(this, ccm, opts);
                _.extend(this, BrowserExecutorConst, BrowserExecutorProto);
                opts = opts || {};
                this._msg_sniffer = opts[this.OPT_MSG_SNIFFER] || function () {
                };
                this._contexts = [];
                this._reverse_requests = {
                    rid: 1,
                    sentreqs: {}
                };
                var _this = this;
                var allowed_origins = opts[this.OPT_ALLOWED_ORIGINS] || {};
                if (allowed_origins instanceof Array) {
                    allowed_origins = _.object(allowed_origins, allowed_origins);
                }
                this.allowed_origins = allowed_origins;
                var connection_timeout = opts[this.OPT_CONNECT_TIMEOUT] || 600;
                var connection_cleanup = function () {
                    var ctx_list = _this._contexts;
                    var remove_time = performance_now() - connection_timeout;
                    for (var i = ctx_list.length - 1; i >= 0; --i) {
                        var ctx = ctx_list[i];
                        if (ctx._last_used < remove_time) {
                            ctx._cleanup();
                            ctx_list.splice(i, 1);
                        }
                    }
                    setTimeout(connection_cleanup, connection_timeout * 1000);
                };
                connection_cleanup();
                this._event_listener = function (event) {
                    _this.handleMessage(event);
                };
                browser_window.addEventListener('message', this._event_listener);
            };
            _.extend(BrowserExecutor, BrowserExecutorConst);
            var BrowserExecutorProto = {};
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
                var source_addr = new request.SourceAddress('LOCAL', source, origin);
                var reqinfo = new request.RequestInfo(this, ftnreq);
                var reqinfo_info = reqinfo.info;
                reqinfo_info[reqinfo.INFO_CHANNEL_CONTEXT] = context;
                reqinfo_info[reqinfo.INFO_CLIENT_ADDR] = source_addr;
                reqinfo_info[reqinfo.INFO_SECURE_CHANNEL] = this._is_secure_channel;
                var _this = this;
                var as = async_steps();
                as.state.reqinfo = reqinfo;
                reqinfo._as = as;
                var cancel_req = function (as) {
                    void as;
                    reqinfo.cancelAfter(0);
                    reqinfo._as = null;
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
                        var ftnrsp = reqinfo_info[reqinfo.INFO_RAW_RESPONSE];
                        reqinfo.cancelAfter(0);
                        reqinfo._as = null;
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
            BrowserExecutorProto._onNotExpected = function (as, err, error_info) {
                void as;
                console.log('Not Expected: ' + err + ' - ' + error_info);
            };
            exports = module.exports = BrowserExecutor;
        },
        function (module, exports) {
            'use strict';
            var _ = _require(8);
            var invoker = _require(7);
            var FutoInError = invoker.FutoInError;
            var request = _require(4);
            var async_steps = _require(6);
            var ChannelContext = request.ChannelContext;
            var CallbackChannelContext = function (executor) {
                ChannelContext.call(this, executor);
                _.extend(this, CallbackChannelContextProto);
            };
            var CallbackChannelContextProto = {
                    type: function () {
                        return 'CALLBACK';
                    },
                    isStateful: function () {
                        return true;
                    }
                };
            var InternalChannelContext = function (executor, invoker_executor) {
                ChannelContext.call(this, executor);
                _.extend(this, InternalChannelContextProto);
                this._invoker_executor = invoker_executor;
            };
            var InternalChannelContextProto = {
                    type: function () {
                        return 'INTERNAL';
                    },
                    isStateful: function () {
                        return true;
                    },
                    _getPerformRequest: function () {
                        var invoker_executor = this._invoker_executor;
                        if (!invoker_executor) {
                            return this._commError;
                        }
                        return function (as, ctx, ftnreq) {
                            invoker_executor.onInternalRequest(as, ctx.info, ftnreq);
                        };
                    },
                    _commError: function (as) {
                        as.error(FutoInError.CommError, 'No Invoker\'s Executor for internal call');
                    }
                };
            var executor_const = {
                    OPT_VAULT: 'vault',
                    OPT_SPEC_DIRS: invoker.AdvancedCCM.OPT_SPEC_DIRS,
                    OPT_PROD_MODE: invoker.AdvancedCCM.OPT_PROD_MODE,
                    OPT_MSG_SNIFFER: invoker.SimpleCCM.OPT_MSG_SNIFFER,
                    OPT_REQUEST_TIMEOT: 'reqTimeout',
                    OPT_HEAVY_REQUEST_TIMEOT: 'heavyTimeout',
                    DEFAULT_REQUEST_TIMEOUT: 5000,
                    DEFAULT_HEAVY_TIMEOUT: 60000,
                    SAFE_PAYLOAD_LIMIT: 65536
                };
            var executor = function (ccm, opts) {
                _.extend(this, executor_const, executor_proto);
                this._ccm = ccm;
                this._ifaces = {};
                this._impls = {};
                opts = opts || {};
                var spec_dirs = opts[this.OPT_SPEC_DIRS];
                if (!(spec_dirs instanceof Array)) {
                    spec_dirs = [spec_dirs];
                }
                this._specdirs = spec_dirs;
                this._dev_checks = !opts[this.OPT_PROD_MODE];
                this._request_timeout = opts[this.OPT_REQUEST_TIMEOT] || this.DEFAULT_REQUEST_TIMEOUT;
                this._heavy_timeout = opts[this.OPT_HEAVY_REQUEST_TIMEOT] || this.DEFAULT_HEAVY_TIMEOUT;
                if (typeof Buffer !== 'undefined' && Buffer.byteLength) {
                    this._byteLength = Buffer.byteLength;
                } else {
                    this._byteLength = function (data) {
                        return data.length;
                    };
                }
            };
            var executor_proto = {
                    _ccm: null,
                    _ifaces: null,
                    _impls: null,
                    _specdirs: null,
                    _dev_checks: false,
                    ccm: function () {
                        return this._ccm;
                    },
                    register: function (as, ifacever, impl) {
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
                        invoker.SpecTools.loadIface(as, info, this._specdirs);
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
                        var reqinfo = new request.RequestInfo(this, ftnreq);
                        var context = new CallbackChannelContext(this);
                        var source_addr = new request.SourceAddress(context.type(), null, info.regname);
                        var reqinfo_info = reqinfo.info;
                        reqinfo_info[reqinfo.INFO_CHANNEL_CONTEXT] = context;
                        reqinfo_info[reqinfo.INFO_CLIENT_ADDR] = source_addr;
                        reqinfo_info[reqinfo.INFO_SECURE_CHANNEL] = info.secure_channel;
                        var as = async_steps();
                        reqinfo._as = as;
                        as.add(function (as) {
                            as.setCancel(function (as) {
                                void as;
                                var ftnrsp = {
                                        rid: reqinfo._rawreq.rid,
                                        e: 'InternalError'
                                    };
                                reqinfo.cancelAfter(0);
                                reqinfo._as = null;
                                send_executor_rsp(ftnrsp);
                            });
                            as.state.reqinfo = reqinfo;
                            _this.process(as);
                            as.add(function (as) {
                                void as;
                                var ftnrsp = reqinfo_info[reqinfo.INFO_RAW_RESPONSE];
                                reqinfo.cancelAfter(0);
                                reqinfo._as = null;
                                if (ftnrsp !== null) {
                                    send_executor_rsp(ftnrsp);
                                }
                            });
                        }, function (as, err) {
                            _this._onNotExpected(as, err, as.state.error_info);
                            reqinfo.cancelAfter(0);
                            reqinfo._as = null;
                        }).execute();
                    },
                    onInternalRequest: function (as, info, ftnreq, upload_data, download_stream) {
                        var context = info._server_executor_context;
                        if (!context) {
                            context = new InternalChannelContext(this, info.options.executor);
                            info._server_executor_context = context;
                        }
                        var _this = this;
                        var reqinfo = new request.RequestInfo(this, ftnreq);
                        var source_addr = new request.SourceAddress(context.type(), null, null);
                        var reqinfo_info = reqinfo.info;
                        reqinfo_info[reqinfo.INFO_CHANNEL_CONTEXT] = context;
                        reqinfo_info[reqinfo.INFO_CLIENT_ADDR] = source_addr;
                        reqinfo_info[reqinfo.INFO_SECURE_CHANNEL] = true;
                        if (upload_data) {
                            reqinfo_info[reqinfo.INFO_HAVE_RAW_UPLOAD] = true;
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
                                    reqinfo.cancelAfter(0);
                                    reqinfo._as = null;
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
                                    var ftnrsp = reqinfo_info[reqinfo.INFO_RAW_RESPONSE];
                                    reqinfo.cancelAfter(0);
                                    reqinfo._as = null;
                                    if (ftnrsp !== null) {
                                        orig_as.success(ftnrsp, invoker.SimpleCCM.FUTOIN_CONTENT_TYPE);
                                    }
                                });
                            }, function (as, err) {
                                _this._onNotExpected(as, err, as.state.error_info);
                                reqinfo.cancelAfter(0);
                                reqinfo._as = null;
                            }).execute();
                            orig_as.setCancel(function (as) {
                                void as;
                                inner_as.state._orig_as_cancel = true;
                                inner_as.cancel();
                            });
                        });
                    },
                    process: function (as) {
                        if (!('reqinfo' in as.state) || '_futoin_func_info' in as.state) {
                            as.error(FutoInError.InternalError, 'Invalid process() invocation');
                        }
                        var _this = this;
                        as.add(function (as) {
                            var reqinfo = as.state.reqinfo;
                            _this._getInfo(as, reqinfo);
                            if (as.state._futoin_func_info.heavy) {
                                reqinfo.cancelAfter(_this._heavy_timeout);
                            } else {
                                reqinfo.cancelAfter(_this._request_timeout);
                            }
                            as.add(function (as) {
                                _this._checkConstraints(as, reqinfo);
                                _this._checkParams(as, reqinfo);
                            });
                            as.add(function (as) {
                                var func = as.state._futoin_func;
                                var impl = _this._getImpl(as, reqinfo);
                                if (!(func in impl)) {
                                    as.error(FutoInError.InternalError, 'Missing function implementation');
                                }
                                var result = impl[func](as, reqinfo);
                                if (result) {
                                    _.extend(reqinfo.result(), result);
                                }
                            });
                            as.add(function (as, result) {
                                if (result) {
                                    _.extend(reqinfo.result(), result);
                                }
                                _this._checkResponse(as, reqinfo);
                                _this._signResponse(as, reqinfo);
                            });
                        }, function (as, err) {
                            var reqinfo = as.state.reqinfo;
                            var error_info = as.state.error_info;
                            if (!(err in invoker.SpecTools.standard_errors) && (!as.state._futoin_func_info || !(err in as.state._futoin_func_info.throws))) {
                                _this._onNotExpected(as, err, error_info);
                                err = FutoInError.InternalError;
                                error_info = 'Not expected error';
                            }
                            var rawrsp = reqinfo.info[reqinfo.INFO_RAW_RESPONSE];
                            rawrsp.e = err;
                            delete rawrsp.r;
                            if (error_info) {
                                rawrsp.edesc = error_info;
                            }
                            _this._signResponse(as, reqinfo);
                            as.success();
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
                        var f = reqinfo_info[reqinfo.INFO_RAW_REQUEST].f;
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
                        as.state._futoin_iface_info = iface_info;
                        as.state._futoin_func = func;
                        as.state._futoin_func_info = finfo;
                        if (finfo.rawresult) {
                            reqinfo_info[reqinfo.INFO_HAVE_RAW_RESULT] = true;
                        }
                    },
                    _checkConstraints: function (as, reqinfo) {
                        var reqinfo_info = reqinfo.info;
                        var constraints = as.state._futoin_iface_info.constraints;
                        if ('SecureChannel' in constraints && !reqinfo_info[reqinfo.INFO_SECURE_CHANNEL]) {
                            as.error(FutoInError.SecurityError, 'Insecure channel');
                        }
                        if (!('AllowAnonymous' in constraints) && !reqinfo_info[reqinfo.INFO_USER_INFO]) {
                            as.error(FutoInError.SecurityError, 'Anonymous not allowed');
                        }
                        var context = reqinfo_info[reqinfo.INFO_CHANNEL_CONTEXT];
                        if ('BiDirectChannel' in constraints && (!context || !context.isStateful())) {
                            as.error(FutoInError.InvalidRequest, 'Bi-Direct Channel is required');
                        }
                    },
                    _checkParams: function (as, reqinfo) {
                        var rawreq = reqinfo.info[reqinfo.INFO_RAW_REQUEST];
                        var finfo = as.state._futoin_func_info;
                        if (reqinfo[reqinfo.INFO_HAVE_RAW_UPLOAD] && !finfo.rawupload) {
                            as.error(FutoInError.InvalidRequest, 'Raw upload is not allowed');
                        }
                        if ('p' in rawreq) {
                            var reqparams = rawreq.p;
                            var k;
                            for (k in reqparams) {
                                if (!(k in finfo.params)) {
                                    as.error(FutoInError.InvalidRequest, 'Unknown parameter');
                                }
                                invoker.SpecTools.checkParameterType(as, as.state._futoin_iface_info, as.state._futoin_func, k, reqparams[k]);
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
                        void reqinfo;
                        var iface_info = as.state._futoin_iface_info;
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
                        var rsp = reqinfo_info[reqinfo.INFO_RAW_RESPONSE];
                        var finfo = as.state._futoin_func_info;
                        if (finfo.rawresult) {
                            reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = null;
                            if (Object.keys(rsp.r).length > 0) {
                                as.error(FutoInError.InternalError, 'Raw result is expected');
                            }
                            return;
                        }
                        if (!finfo.expect_result && reqinfo_info[reqinfo.INFO_RAW_REQUEST].forcersp !== true) {
                            reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = null;
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
                                invoker.SpecTools.checkResultType(as, as.state._futoin_iface_info, as.state._futoin_func, k, rsp.r[k]);
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
                        if (!reqinfo.info[reqinfo.INFO_DERIVED_KEY]) {
                            return;
                        }
                    },
                    _onNotExpected: function (as, err, error_info) {
                        void as;
                        void err;
                        void error_info;
                    },
                    close: function () {
                    },
                    packPayloadJSON: function (msg) {
                        var rawmsg = JSON.stringify(msg);
                        if (this._byteLength(rawmsg, 'utf8') > this.SAFE_PAYLOAD_LIMIT) {
                            this._onNotExpected(FutoInError.InternalError, 'Response size has exceeded safety limit');
                            throw new Error(FutoInError.InternalError);
                        }
                        return rawmsg;
                    }
                };
            _.extend(executor, executor_const);
            exports.Executor = executor;
            exports.ExecutorConst = executor_const;
        },
        function (module, exports) {
            'use strict';
            var isNode = _require(5);
            var _ = _require(8);
            var request = _require(4);
            _.extend(exports, request);
            var Executor = _require(2).Executor;
            exports.Executor = Executor;
            exports.ClientExecutor = Executor;
            if (isNode) {
                var hidreq = require;
                exports.NodeExecutor = hidreq('./node_executor');
            } else {
                exports.BrowserExecutor = _require(1);
            }
        },
        function (module, exports) {
            'use strict';
            var _ = _require(8);
            var performance_now = _require(9);
            var async_steps = _require(6);
            var userinfo_const = {
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
            exports.UserInfo = function (ccm, local_id, global_id) {
                _.extend(this, userinfo_const, UserInfoProto);
                this._ccm = ccm;
                this._local_id = local_id;
                this._global_id = global_id;
            };
            _.extend(exports.UserInfo, userinfo_const);
            var UserInfoProto = {
                    localID: function () {
                        return this._local_id;
                    },
                    globalID: function () {
                        return this._global_id;
                    },
                    details: function (as, user_field_identifiers) {
                        as.error('NotImplemented');
                        void user_field_identifiers;
                    }
                };
            exports.SourceAddress = function (type, host, port) {
                _.extend(this, SourceAddressProto);
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
            var SourceAddressProto = {
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
            exports.DerivedKey = function (ccm, base_id, sequence_id) {
                _.extend(this, DerivedKeyProto);
                this._ccm = ccm;
                this._base_id = base_id;
                this._sequence_id = sequence_id;
            };
            var DerivedKeyProto = {
                    baseID: function () {
                        return this._base_id;
                    },
                    sequenceID: function () {
                        return this._sequence_id;
                    },
                    encrypt: function (as, data) {
                        void as;
                        void data;
                    },
                    decrypt: function (as, data) {
                        void as;
                        void data;
                    }
                };
            exports.ChannelContext = function (executor) {
                _.extend(this, ChannelContextProto);
                this._executor = executor;
                this._ifaces = {};
                this.state = function () {
                    return this.state;
                };
            };
            var ChannelContextProto = {
                    _user_info: null,
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
                        delete this._executor;
                        delete this._ifaces;
                        delete this.state;
                    }
                };
            var reqinfo_const = {
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
            exports.RequestInfo = function (executor, rawreq) {
                _.extend(this, reqinfo_const, RequestInfoProto);
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
                info[this.INFO_X509_CN] = null;
                info[this.INFO_X509_CN] = null;
                info[this.INFO_PUBKEY] = null;
                info[this.INFO_CLIENT_ADDR] = null;
                info[this.INFO_SECURE_CHANNEL] = false;
                info[this.INFO_SECURITY_LEVEL] = this.SL_ANONYMOUS;
                info[this.INFO_USER_INFO] = null;
                info[this.INFO_RAW_REQUEST] = rawreq;
                info[this.INFO_RAW_RESPONSE] = rawrsp;
                info[this.INFO_DERIVED_KEY] = null;
                info[this.INFO_HAVE_RAW_UPLOAD] = false;
                info[this.INFO_HAVE_RAW_RESULT] = false;
                info[this.INFO_CHANNEL_CONTEXT] = null;
                info[this.INFO_REQUEST_TIME_FLOAT] = performance_now();
            };
            _.extend(exports.RequestInfo, reqinfo_const);
            var RequestInfoProto = {
                    _executor: null,
                    _rawreq: null,
                    _rawrsp: null,
                    _rawinp: null,
                    _rawout: null,
                    params: function () {
                        return this._rawreq.p;
                    },
                    result: function () {
                        return this._rawrsp.r;
                    },
                    rawInput: function () {
                        var rawinp = this._rawinp;
                        if (!rawinp) {
                            if (this.info[this.INFO_HAVE_RAW_UPLOAD] && this.info[this.INFO_CHANNEL_CONTEXT] !== null) {
                                rawinp = this.info[this.INFO_CHANNEL_CONTEXT]._openRawInput();
                                this._rawinp = rawinp;
                            }
                            if (!rawinp) {
                                throw new Error('RawInputError');
                            }
                        }
                        return rawinp;
                    },
                    rawOutput: function () {
                        var rawout = this._rawout;
                        if (!rawout) {
                            if (this.info[this.INFO_HAVE_RAW_RESULT] && this.info[this.INFO_CHANNEL_CONTEXT] !== null) {
                                rawout = this.info[this.INFO_CHANNEL_CONTEXT]._openRawOutput();
                                this._rawout = rawout;
                            }
                            if (!rawout) {
                                throw new Error('RawOutputError');
                            }
                        }
                        return rawout;
                    },
                    executor: function () {
                        return this._executor;
                    },
                    channel: function () {
                        return this.info[this.INFO_CHANNEL_CONTEXT];
                    },
                    cancelAfter: function (time_ms) {
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
                    }
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
            module.exports = __external_$as;
        },
        function (module, exports) {
            module.exports = __external_FutoInInvoker;
        },
        function (module, exports) {
            module.exports = __external__;
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
    return _require(0);
}));
//# sourceMappingURL=futoin-executor.js.map